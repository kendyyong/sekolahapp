-- =====================================================================
-- Program affiliator: mitra mendaftarkan sekolah memakai kode referral
-- dan mendapat komisi dari biaya langganan sekolah tersebut.
--
-- Aturan bawaan (bisa diubah per affiliator oleh admin platform):
--   * komisi 20% dari nilai langganan bulanan sekolah yang direferensikan,
--   * selama 12 bulan pertama sejak sekolah terdaftar,
--   * dihitung saat tagihan langganan bulan itu ditandai Lunas,
--   * dibayar manual (transfer) oleh admin platform.
-- =====================================================================

create table public.affiliates (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references public.profiles(id) on delete cascade,
  code              text not null unique check (code ~ '^[A-Z0-9]{4,12}$'),
  status            text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'rejected')),
  commission_pct    numeric(5,2) not null default 20 check (commission_pct between 0 and 100),
  commission_months int not null default 12 check (commission_months between 1 and 120),
  phone             text,
  bank_name         text,
  bank_account      text,
  account_holder    text,
  note              text,
  review_note       text,
  reviewed_by       uuid references public.profiles(id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);

-- Satu sekolah paling banyak punya satu affiliator.
create table public.affiliate_referrals (
  school_id    uuid primary key references public.schools(id) on delete cascade,
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index affiliate_referrals_affiliate on public.affiliate_referrals (affiliate_id);

create table public.affiliate_commissions (
  id           uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  bill_id      uuid not null unique references public.platform_bills(id) on delete cascade,
  period       date not null,
  base_amount  bigint not null,
  pct          numeric(5,2) not null,
  amount       bigint not null,
  status       text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  paid_at      timestamptz,
  payout_ref   text,
  created_at   timestamptz not null default now()
);
create index affiliate_commissions_affiliate on public.affiliate_commissions (affiliate_id, status);

alter table public.affiliates            enable row level security;
alter table public.affiliate_referrals   enable row level security;
alter table public.affiliate_commissions enable row level security;

create or replace function public.my_affiliate_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from affiliates where user_id = auth.uid()
$$;

create policy affiliates_read on public.affiliates for select
  using (user_id = auth.uid() or public.is_platform_admin());
-- Admin platform boleh mengubah syarat komisi; affiliator mengubah datanya lewat apply_affiliate.
create policy affiliates_platform_update on public.affiliates for update
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy affiliate_referrals_read on public.affiliate_referrals for select
  using (affiliate_id = public.my_affiliate_id() or public.is_platform_admin());
create policy affiliate_commissions_read on public.affiliate_commissions for select
  using (affiliate_id = public.my_affiliate_id() or public.is_platform_admin());

-- ---------------------------------------------------------------------
-- Pendaftaran affiliator (pengguna yang sudah login). Dipanggil lagi untuk
-- memperbarui nomor HP dan rekening tanpa mengubah status.
-- ---------------------------------------------------------------------
create or replace function public.apply_affiliate(
  p_phone text, p_bank_name text, p_bank_account text, p_account_holder text, p_note text default null)
returns public.affiliates language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); a affiliates; v_base text; v_code text;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  if length(coalesce(trim(p_phone), '')) < 8 then raise exception 'Nomor HP/WhatsApp wajib diisi'; end if;
  select * into a from affiliates where user_id = v_uid for update;
  if a.id is not null then
    update affiliates set phone = trim(p_phone), bank_name = nullif(trim(p_bank_name), ''),
           bank_account = nullif(trim(p_bank_account), ''), account_holder = nullif(trim(p_account_holder), ''),
           note = coalesce(nullif(trim(p_note), ''), note)
     where id = a.id returning * into a;
    return a;
  end if;

  select upper(left(regexp_replace(coalesce(full_name, ''), '[^A-Za-z]', '', 'g'), 5)) into v_base from profiles where id = v_uid;
  if length(v_base) < 2 then v_base := 'SA'; end if;
  loop
    v_code := v_base || upper(substr(md5(gen_random_uuid()::text), 1, 4));
    exit when not exists (select 1 from affiliates where code = v_code);
  end loop;

  insert into affiliates (user_id, code, phone, bank_name, bank_account, account_holder, note)
  values (v_uid, v_code, trim(p_phone), nullif(trim(p_bank_name), ''), nullif(trim(p_bank_account), ''),
          nullif(trim(p_account_holder), ''), nullif(trim(p_note), ''))
  returning * into a;
  perform public.notify_platform_admins('affiliate.applied', 'Pendaftar affiliator baru',
    (select coalesce(nullif(full_name, ''), email) from profiles where id = v_uid), 'affiliates', a.id);
  return a;
end $$;
revoke execute on function public.apply_affiliate(text, text, text, text, text) from public, anon;

create or replace function public.review_affiliate(
  p_id uuid, p_status text, p_pct numeric default null, p_months int default null, p_note text default null)
returns public.affiliates language plpgsql security definer set search_path = public as $$
declare a affiliates;
begin
  if not public.is_platform_admin() then raise exception 'Hanya admin platform'; end if;
  if p_status not in ('active', 'suspended', 'rejected') then raise exception 'Status tidak valid'; end if;
  update affiliates
     set status = p_status, commission_pct = coalesce(p_pct, commission_pct),
         commission_months = coalesce(p_months, commission_months),
         review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id returning * into a;
  if a.id is null then raise exception 'Affiliator tidak ditemukan'; end if;
  perform public.notify(a.user_id, null, 'affiliate.reviewed',
    case p_status when 'active' then 'Akun affiliator Anda aktif. Kode Anda: ' || a.code
                  when 'suspended' then 'Akun affiliator Anda dibekukan'
                  else 'Pendaftaran affiliator ditolak' end,
    nullif(trim(p_note), ''), 'affiliates', a.id);
  return a;
end $$;

-- Admin platform menghubungkan (atau melepas, p_code null) sekolah dengan affiliator.
create or replace function public.set_school_affiliate(p_school uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_aff uuid;
begin
  if not public.is_platform_admin() then raise exception 'Hanya admin platform'; end if;
  if nullif(trim(p_code), '') is null then
    delete from affiliate_referrals where school_id = p_school;
    return;
  end if;
  select id into v_aff from affiliates where code = upper(trim(p_code)) and status = 'active';
  if v_aff is null then raise exception 'Kode affiliator % tidak ditemukan atau belum aktif', upper(trim(p_code)); end if;
  insert into affiliate_referrals (school_id, affiliate_id, created_by, created_at)
  values (p_school, v_aff, auth.uid(), (select created_at from schools where id = p_school))
  on conflict (school_id) do update set affiliate_id = excluded.affiliate_id, created_by = excluded.created_by;
end $$;

-- Tandai semua komisi tertunda seorang affiliator sudah ditransfer.
create or replace function public.pay_affiliate_commissions(p_affiliate uuid, p_ref text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_total bigint; v_user uuid;
begin
  if not public.is_platform_admin() then raise exception 'Hanya admin platform'; end if;
  with paid as (
    update affiliate_commissions set status = 'paid', paid_at = now(), payout_ref = nullif(trim(p_ref), '')
     where affiliate_id = p_affiliate and status = 'pending' returning amount)
  select coalesce(sum(amount), 0) into v_total from paid;
  if v_total = 0 then raise exception 'Tidak ada komisi yang menunggu pembayaran'; end if;
  select user_id into v_user from affiliates where id = p_affiliate;
  perform public.notify(v_user, null, 'affiliate.paid', 'Komisi affiliator dibayarkan: Rp' || to_char(v_total, 'FM999G999G999G999'),
    nullif(trim(p_ref), ''), 'affiliates', p_affiliate);
  return v_total;
end $$;

-- ---------------------------------------------------------------------
-- Komisi dibuat saat tagihan langganan ditandai Lunas, dan dibatalkan
-- bila status Lunas dicabut (selama belum ditransfer).
-- ---------------------------------------------------------------------
create or replace function public.affiliate_commission_on_bill()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select a.id, a.commission_pct, a.commission_months, ar.created_at into r
      from affiliate_referrals ar join affiliates a on a.id = ar.affiliate_id
     where ar.school_id = new.school_id and a.status = 'active';
    if r.id is not null and new.gross_amount > 0
       and new.period < (date_trunc('month', r.created_at at time zone 'Asia/Jakarta') + make_interval(months => r.commission_months))::date then
      insert into affiliate_commissions (affiliate_id, school_id, bill_id, period, base_amount, pct, amount)
      values (r.id, new.school_id, new.id, new.period, new.gross_amount, r.commission_pct,
              floor(new.gross_amount * r.commission_pct / 100))
      on conflict (bill_id) do update
        set affiliate_id = excluded.affiliate_id, base_amount = excluded.base_amount, pct = excluded.pct,
            amount = excluded.amount, status = 'pending'
        where affiliate_commissions.status = 'void';
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'paid' and new.status <> 'paid' then
    update affiliate_commissions set status = 'void' where bill_id = new.id and status = 'pending';
  end if;
  return new;
end $$;
create trigger platform_bills_affiliate after insert or update of status on public.platform_bills
  for each row execute function public.affiliate_commission_on_bill();

-- ---------------------------------------------------------------------
-- Ringkasan untuk affiliator: sekolah yang direferensikan (tanpa data
-- pribadi warga sekolah) dan perolehan komisinya.
-- ---------------------------------------------------------------------
create or replace function public.my_affiliate_schools()
returns table (
  school_id uuid, name text, level text, plan public.plan_tier, students int, referred_at timestamptz,
  commission_until date, earned bigint, pending bigint
) language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.level, s.plan,
         (select count(*)::int from students x where x.school_id = s.id and x.status = 'aktif'),
         ar.created_at,
         ((date_trunc('month', ar.created_at at time zone 'Asia/Jakarta') + make_interval(months => a.commission_months))::date - 1),
         coalesce((select sum(amount) from affiliate_commissions c where c.school_id = s.id and c.affiliate_id = a.id and c.status = 'paid'), 0)::bigint,
         coalesce((select sum(amount) from affiliate_commissions c where c.school_id = s.id and c.affiliate_id = a.id and c.status = 'pending'), 0)::bigint
  from affiliates a
  join affiliate_referrals ar on ar.affiliate_id = a.id
  join schools s on s.id = ar.school_id
  where a.user_id = auth.uid()
  order by ar.created_at desc
$$;

create or replace function public.platform_affiliates()
returns table (
  id uuid, full_name text, email text, phone text, code text, status text, commission_pct numeric,
  commission_months int, bank_name text, bank_account text, account_holder text, note text, created_at timestamptz,
  schools int, pending bigint, paid bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Hanya admin platform'; end if;
  return query
  select a.id, p.full_name, p.email, a.phone, a.code, a.status, a.commission_pct, a.commission_months,
         a.bank_name, a.bank_account, a.account_holder, a.note, a.created_at,
         (select count(*)::int from affiliate_referrals ar where ar.affiliate_id = a.id),
         coalesce((select sum(amount) from affiliate_commissions c where c.affiliate_id = a.id and c.status = 'pending'), 0)::bigint,
         coalesce((select sum(amount) from affiliate_commissions c where c.affiliate_id = a.id and c.status = 'paid'), 0)::bigint
  from affiliates a join profiles p on p.id = a.user_id
  order by (a.status = 'pending') desc, a.created_at desc;
end $$;

-- Cek kode referral di halaman pendaftaran sekolah (boleh tanpa login).
create or replace function public.affiliate_code_valid(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from affiliates where code = upper(trim(p_code)) and status = 'active')
$$;

-- Menu web: tampilkan "Program Affiliator" bagi yang sudah mendaftar.
create or replace function public.my_admin_scopes()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'platform', public.is_platform_admin(),
    'foundations', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.name)
      from foundation_admins fa join foundations f on f.id = fa.foundation_id
      where fa.user_id = auth.uid()), '[]'::jsonb),
    'affiliate', (select status from affiliates where user_id = auth.uid())
  )
$$;

-- ---------------------------------------------------------------------
-- Pendaftaran sekolah kini menerima kode affiliator (opsional).
-- ---------------------------------------------------------------------
drop function public.register_school(text, text, text, text, text);
create or replace function public.register_school(
  p_name text, p_level text, p_npsn text default null, p_address text default null, p_phone text default null,
  p_ref text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_slug text;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_year int := extract(year from v_today)::int - case when extract(month from v_today) < 7 then 1 else 0 end;
  v_aff affiliates;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  if length(coalesce(trim(p_name), '')) < 3 then raise exception 'Nama sekolah minimal 3 karakter'; end if;
  if (select count(*) from memberships where user_id = v_uid and role = 'school_admin') >= 3 then
    raise exception 'Satu akun hanya bisa mendaftarkan 3 sekolah. Hubungi kami untuk yayasan dengan banyak sekolah.';
  end if;
  if nullif(trim(p_npsn), '') is not null and exists (select 1 from schools where npsn = trim(p_npsn)) then
    raise exception 'NPSN % sudah terdaftar. Minta admin sekolah tersebut menambahkan akun Anda.', trim(p_npsn);
  end if;
  if nullif(trim(p_ref), '') is not null then
    select * into v_aff from affiliates where code = upper(trim(p_ref)) and status = 'active';
    if v_aff.id is null then raise exception 'Kode affiliator % tidak ditemukan. Periksa lagi atau kosongkan.', upper(trim(p_ref)); end if;
    -- Affiliator tidak mendapat komisi dari sekolah yang ia kelola sendiri.
    if v_aff.user_id = v_uid then v_aff := null; end if;
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

  if v_aff.id is not null then
    insert into affiliate_referrals (school_id, affiliate_id, created_by) values (v_id, v_aff.id, v_uid);
    perform public.notify(v_aff.user_id, null, 'affiliate.school', 'Sekolah baru memakai kode Anda: ' || trim(p_name),
      coalesce(p_level, ''), 'affiliates', v_aff.id);
  end if;

  perform public.notify_platform_admins('school.registered', 'Sekolah baru mendaftar: ' || trim(p_name),
    coalesce(p_level, '') || coalesce(' · NPSN ' || nullif(trim(p_npsn), ''), '')
      || coalesce(' · affiliator ' || v_aff.code, ''), 'schools', v_id);
  return v_id;
end $$;
revoke execute on function public.register_school(text, text, text, text, text, text) from public, anon;
