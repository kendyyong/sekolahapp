-- =====================================================================
-- Platform & monetisasi: pendaftaran sekolah mandiri, permintaan ganti
-- paket, ringkasan untuk pemilik platform dan admin yayasan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Peran tingkat atas milik pengguna saat ini (untuk menu dasbor web).
-- ---------------------------------------------------------------------
create or replace function public.my_admin_scopes()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'platform', public.is_platform_admin(),
    'foundations', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.name)
      from foundation_admins fa join foundations f on f.id = fa.foundation_id
      where fa.user_id = auth.uid()), '[]'::jsonb)
  )
$$;

-- Kirim notifikasi ke semua admin platform.
create or replace function public.notify_platform_admins(p_kind text, p_title text, p_body text, p_ref_table text, p_ref_id uuid)
returns void language sql security definer set search_path = public as $$
  select public.notify(pa.user_id, null, p_kind, p_title, p_body, p_ref_table, p_ref_id) from platform_admins pa
$$;
revoke execute on function public.notify_platform_admins(text, text, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Pendaftaran sekolah mandiri: pengguna yang sudah login membuat sekolah
-- dengan paket Gratis dan menjadi Admin Sekolah-nya.
-- ---------------------------------------------------------------------
create or replace function public.register_school(
  p_name text, p_level text, p_npsn text default null, p_address text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_slug text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_year int := extract(year from v_today)::int - case when extract(month from v_today) < 7 then 1 else 0 end;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  if length(coalesce(trim(p_name), '')) < 3 then raise exception 'Nama sekolah minimal 3 karakter'; end if;
  if (select count(*) from memberships where user_id = v_uid and role = 'school_admin') >= 3 then
    raise exception 'Satu akun hanya bisa mendaftarkan 3 sekolah. Hubungi kami untuk yayasan dengan banyak sekolah.';
  end if;
  if nullif(trim(p_npsn), '') is not null and exists (select 1 from schools where npsn = trim(p_npsn)) then
    raise exception 'NPSN % sudah terdaftar. Minta admin sekolah tersebut menambahkan akun Anda.', trim(p_npsn);
  end if;

  v_slug := left(trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')), 50);
  if length(v_slug) < 3 then v_slug := 'sekolah'; end if;
  v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 5);

  insert into schools (name, slug, npsn, level, address, phone, plan)
  values (trim(p_name), v_slug, nullif(trim(p_npsn), ''), p_level, nullif(trim(p_address), ''), nullif(trim(p_phone), ''), 'free')
  returning id into v_id;

  insert into memberships (school_id, user_id, role) values (v_id, v_uid, 'school_admin');
  insert into academic_years (school_id, name, starts_on, ends_on, is_active)
  values (v_id, v_year || '/' || (v_year + 1), make_date(v_year, 7, 1), make_date(v_year + 1, 6, 30), true);

  perform public.notify_platform_admins('school.registered', 'Sekolah baru mendaftar: ' || trim(p_name),
    coalesce(p_level, '') || coalesce(' · NPSN ' || nullif(trim(p_npsn), ''), ''), 'schools', v_id);
  return v_id;
end $$;
revoke execute on function public.register_school(text, text, text, text, text) from public, anon;

-- ---------------------------------------------------------------------
-- Permintaan ganti paket oleh admin sekolah, disetujui admin platform.
-- ---------------------------------------------------------------------
create table public.plan_change_requests (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  requested_by uuid not null default auth.uid() references public.profiles(id),
  from_tier    public.plan_tier not null,
  to_tier      public.plan_tier not null,
  note         text,
  status       public.request_status not null default 'pending',
  reviewed_by  uuid references public.profiles(id),
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz not null default now()
);
create unique index plan_change_one_pending on public.plan_change_requests (school_id) where status = 'pending';
alter table public.plan_change_requests enable row level security;
create policy plan_change_read on public.plan_change_requests for select
  using (public.has_role(school_id, array['school_admin','principal','finance']::public.app_role[])
         or public.is_foundation_admin_of_school(school_id) or public.is_platform_admin());
-- Perubahan hanya lewat RPC di bawah.

create or replace function public.request_plan_change(p_school uuid, p_tier public.plan_tier, p_note text default null)
returns public.plan_change_requests language plpgsql security definer set search_path = public as $$
declare v_current plan_tier; v_name text; r plan_change_requests;
begin
  if not public.has_role(p_school, array['school_admin']::app_role[]) then raise exception 'Hanya admin sekolah yang dapat mengajukan ganti paket'; end if;
  select plan, name into v_current, v_name from schools where id = p_school;
  if v_current = p_tier then raise exception 'Sekolah sudah memakai paket ini'; end if;
  if exists (select 1 from plan_change_requests where school_id = p_school and status = 'pending') then
    raise exception 'Masih ada pengajuan yang menunggu. Batalkan dulu bila ingin mengganti.';
  end if;
  insert into plan_change_requests (school_id, from_tier, to_tier, note)
  values (p_school, v_current, p_tier, nullif(trim(p_note), '')) returning * into r;
  perform public.notify_platform_admins('plan.requested', v_name || ': ' || v_current || ' → ' || p_tier,
    nullif(trim(p_note), ''), 'plan_change_requests', r.id);
  return r;
end $$;

create or replace function public.cancel_plan_change(p_id uuid)
returns public.plan_change_requests language plpgsql security definer set search_path = public as $$
declare r plan_change_requests;
begin
  select * into r from plan_change_requests where id = p_id for update;
  if r.id is null or not public.has_role(r.school_id, array['school_admin']::app_role[]) then raise exception 'Pengajuan tidak ditemukan'; end if;
  if r.status <> 'pending' then raise exception 'Pengajuan sudah diproses'; end if;
  update plan_change_requests set status = 'cancelled' where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.review_plan_change(p_id uuid, p_approve boolean, p_note text default null)
returns public.plan_change_requests language plpgsql security definer set search_path = public as $$
declare r plan_change_requests; v_students int; v_max int;
begin
  if not public.is_platform_admin() then raise exception 'Hanya admin platform'; end if;
  select * into r from plan_change_requests where id = p_id for update;
  if r.id is null then raise exception 'Pengajuan tidak ditemukan'; end if;
  if r.status <> 'pending' then raise exception 'Pengajuan sudah diproses'; end if;
  if p_approve then
    select max_students into v_max from plans where tier = r.to_tier;
    select count(*) into v_students from students where school_id = r.school_id and status = 'aktif';
    if v_max is not null and v_students > v_max then
      raise exception 'Sekolah punya % murid aktif, melebihi batas paket (% murid)', v_students, v_max;
    end if;
    update schools set plan = r.to_tier where id = r.school_id;
  end if;
  update plan_change_requests
     set status = case when p_approve then 'approved'::request_status else 'rejected'::request_status end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_id returning * into r;
  perform public.notify(r.requested_by, r.school_id, 'plan.reviewed',
    case when p_approve then 'Paket sekolah diubah ke ' || r.to_tier else 'Pengajuan ganti paket ditolak' end,
    nullif(trim(p_note), ''), 'plan_change_requests', r.id);
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Ringkasan untuk pemilik platform.
-- ---------------------------------------------------------------------
create or replace function public.platform_schools()
returns table (
  id uuid, name text, level text, npsn text, plan public.plan_tier, is_active boolean, created_at timestamptz,
  foundation_name text, students int, staff int, price_per_student bigint, monthly_value bigint,
  payment_status text, open_bills bigint, admin_name text, admin_email text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Hanya admin platform'; end if;
  return query
  select s.id, s.name, s.level, s.npsn, s.plan, s.is_active, s.created_at, f.name,
         st.n, sf.n, pr.price, st.n * pr.price,
         spa.status, coalesce(b.due, 0)::bigint, adm.full_name, adm.email
  from schools s
  left join foundations f on f.id = s.foundation_id
  join plans p on p.tier = s.plan
  cross join lateral (select coalesce(nullif(s.settings->>'custom_price_per_student', '')::bigint, p.price_per_student) as price) pr
  cross join lateral (select count(*)::int n from students x where x.school_id = s.id and x.status = 'aktif') st
  cross join lateral (select count(distinct m.user_id)::int n from memberships m
                      where m.school_id = s.id and m.is_active and m.role in ('school_admin','principal','teacher','counselor','finance')) sf
  left join school_payment_accounts spa on spa.school_id = s.id
  left join lateral (select sum(amount_due) due from platform_bills pb where pb.school_id = s.id and pb.status = 'open') b on true
  left join lateral (select pf.full_name, pf.email from memberships m join profiles pf on pf.id = m.user_id
                     where m.school_id = s.id and m.role = 'school_admin' and m.is_active order by m.created_at limit 1) adm on true
  order by s.created_at desc;
end $$;

create or replace function public.platform_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Hanya admin platform'; end if;
  with sc as (select * from public.platform_schools())
  select jsonb_build_object(
    'schools_active', (select count(*) from sc where is_active),
    'schools_new_30d', (select count(*) from sc where created_at > now() - interval '30 days'),
    'students_active', (select coalesce(sum(students), 0) from sc where is_active),
    'mrr', (select coalesce(sum(monthly_value), 0) from sc where is_active),
    'by_plan', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb) from (select plan, count(*) n from sc where is_active group by plan) x),
    'open_bills', (select coalesce(sum(amount_due), 0) from platform_bills where status = 'open'),
    'pending_plan_requests', (select count(*) from plan_change_requests where status = 'pending'),
    'payments_pending_setup', (select count(*) from sc where is_active and coalesce(payment_status, 'none') <> 'live'),
    'fees_this_month', (select coalesce(sum(platform_fee), 0) from payments
                        where status = 'paid' and paid_at >= date_trunc('month', now()))
  ) into v;
  return v;
end $$;

-- Buat tagihan langganan semua sekolah aktif untuk satu bulan.
create or replace function public.generate_platform_bills(p_period date)
returns int language plpgsql security definer set search_path = public as $$
declare s record; n int := 0;
begin
  if not public.is_platform_admin() then raise exception 'Hanya admin platform'; end if;
  for s in select id from schools where is_active and plan <> 'free' loop
    perform public.compute_platform_bill(s.id, p_period);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Ringkasan untuk admin yayasan: semua sekolah dalam yayasan.
-- ---------------------------------------------------------------------
create or replace function public.foundation_overview(p_foundation uuid)
returns table (
  school_id uuid, name text, level text, plan public.plan_tier, students int,
  present_today int, recorded_today int, staff int, staff_present_today int,
  arrears bigint, collected_month bigint, pending_staff_leave int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_platform_admin()
          or exists (select 1 from foundation_admins where foundation_id = p_foundation and user_id = auth.uid())) then
    raise exception 'Tidak berwenang';
  end if;
  return query
  select s.id, s.name, s.level, s.plan,
    (select count(*)::int from students x where x.school_id = s.id and x.status = 'aktif'),
    (select count(*)::int from student_attendance a where a.school_id = s.id and a.date = public.school_today(s.id)
        and a.teaching_assignment_id is null and a.status in ('hadir', 'terlambat')),
    (select count(*)::int from student_attendance a where a.school_id = s.id and a.date = public.school_today(s.id)
        and a.teaching_assignment_id is null),
    (select count(distinct m.user_id)::int from memberships m where m.school_id = s.id and m.is_active
        and m.role in ('school_admin','principal','teacher','counselor','finance')),
    (select count(*)::int from staff_attendance sa where sa.school_id = s.id and sa.date = public.school_today(s.id)
        and sa.status in ('hadir', 'terlambat')),
    (select coalesce(sum(i.total - i.paid_amount), 0)::bigint from invoices i
        where i.school_id = s.id and i.status in ('unpaid', 'partial') and i.due_on < public.school_today(s.id)),
    (select coalesce(sum(pm.amount), 0)::bigint from payments pm
        where pm.school_id = s.id and pm.status = 'paid' and pm.paid_at >= date_trunc('month', now())),
    (select count(*)::int from staff_leave_requests l where l.school_id = s.id and l.status = 'pending')
  from schools s
  where s.foundation_id = p_foundation and s.is_active
  order by s.name;
end $$;

-- ---------------------------------------------------------------------
-- Harga khusus per murid (settings.custom_price_per_student) juga hanya
-- boleh diubah admin platform; sebelumnya admin sekolah bisa menulisnya
-- lewat kolom settings.
-- ---------------------------------------------------------------------
create or replace function public.guard_school_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if ((new.plan, new.plan_expires_at, new.foundation_id, new.is_active, new.settings->'custom_price_per_student')
      is distinct from (old.plan, old.plan_expires_at, old.foundation_id, old.is_active, old.settings->'custom_price_per_student'))
     and not public.is_platform_admin()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Hanya admin platform yang dapat mengubah paket, harga, atau status sekolah';
  end if;
  return new;
end $$;
