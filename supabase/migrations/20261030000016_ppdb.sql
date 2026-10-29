-- =====================================================================
-- SekolahApp · 0016 · PPDB online (penerimaan murid baru)
-- Gelombang pendaftaran dibuka admin sekolah dan tampil di halaman publik
-- /ppdb/<slug>. Orang tua membuat akun, mengisi formulir, mengunggah
-- berkas, lalu mengirimnya. Sekolah mencatat biaya pendaftaran,
-- memverifikasi, memberi keputusan, mengumumkan hasil, dan mendaftarkan
-- pendaftar yang diterima sebagai murid (orang tua otomatis jadi wali).
-- Keputusan disimpan terpisah (admission_reviews) agar tidak terlihat
-- pendaftar sebelum diumumkan.
-- =====================================================================

update public.plans set modules = array_append(modules, 'ppdb')
 where tier in ('pro', 'enterprise') and not ('ppdb' = any(modules));

create or replace function public.module_label(p_module text)
returns text language sql immutable as $$
  select case p_module
    when 'staff' then 'Absen & cuti guru'
    when 'finance' then 'SPP & pembayaran'
    when 'grades' then 'Penilaian & rapor'
    when 'counseling' then 'BK & catatan sikap'
    when 'dashboard' then 'Dasbor kepala sekolah'
    when 'foundation' then 'Dasbor yayasan'
    when 'ppdb' then 'PPDB online'
    else p_module end
$$;

-- Petugas PPDB: admin sekolah, kepala sekolah, dan TU (mencatat biaya).
create or replace function public.is_ppdb_staff(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_school, array['school_admin','principal','finance']::public.app_role[])
      or public.is_foundation_admin_of_school(p_school)
      or public.is_platform_admin()
$$;

-- ---------------------------------------------------------------------
-- Gelombang pendaftaran
-- ---------------------------------------------------------------------
create table public.admission_periods (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  title         text not null check (length(trim(title)) between 3 and 120),   -- contoh: Gelombang 1
  school_year   text not null check (school_year ~ '^\d{4}/\d{4}$'),            -- tahun ajaran tujuan
  grade_level   smallint not null check (grade_level between 0 and 13),         -- kelas tujuan (mis. 7)
  opens_on      date not null,
  closes_on     date not null,
  quota         int check (quota > 0),
  fee_amount    bigint not null default 0 check (fee_amount >= 0),             -- biaya pendaftaran
  requirements  text,
  documents     text[] not null default array['Akta kelahiran', 'Kartu keluarga', 'Pas foto'],
  is_published  boolean not null default false,
  announced_at  timestamptz,                                                    -- hasil seleksi diumumkan
  created_by    uuid default auth.uid() references public.profiles(id),
  created_at    timestamptz not null default now(),
  check (closes_on >= opens_on),
  check (cardinality(documents) <= 10)
);
create index on public.admission_periods (school_id, opens_on desc);

create type public.admission_status as enum
  ('draft', 'submitted', 'verified', 'accepted', 'waitlisted', 'rejected', 'enrolled', 'withdrawn');

-- ---------------------------------------------------------------------
-- Formulir pendaftar (satu baris per calon murid)
-- ---------------------------------------------------------------------
create table public.admission_applications (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  period_id        uuid not null references public.admission_periods(id) on delete restrict,
  applicant_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  number           text,                                   -- nomor pendaftaran, terbit saat dikirim
  status           public.admission_status not null default 'draft',
  -- Data calon murid
  full_name        text not null check (length(trim(full_name)) between 3 and 120),
  nisn             text check (nisn ~ '^\d{10}$'),
  gender           char(1) check (gender in ('L','P')),
  birth_place      text,
  birth_date       date,
  religion         text,
  address          text,
  previous_school  text,
  -- Data orang tua / wali (pemilik akun)
  parent_name      text,
  parent_relation  text not null default 'orang tua' check (parent_relation in ('ayah','ibu','wali','orang tua')),
  parent_phone     text check (parent_phone ~ '^\+?[0-9 -]{8,20}$'),
  parent_occupation text,
  notes            text,
  documents        jsonb not null default '{}'::jsonb,     -- {"Akta kelahiran": "<path di bucket admission-docs>"}
  -- Diisi sekolah
  staff_note       text,                                   -- pesan untuk pendaftar (mis. alasan dikembalikan)
  fee_status       text not null default 'unpaid' check (fee_status in ('unpaid','paid','waived')),
  fee_method       text check (fee_method in ('cash','transfer','waived')),
  fee_paid_at      timestamptz,
  fee_received_by  uuid references public.profiles(id),
  submitted_at     timestamptz,
  verified_at      timestamptz,
  student_id       uuid references public.students(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (school_id, number)
);
create index on public.admission_applications (period_id, status);
create index on public.admission_applications (applicant_id);
create trigger admission_applications_touch before update on public.admission_applications
  for each row execute function public.touch_updated_at();
create trigger admission_applications_same_school before insert or update on public.admission_applications
  for each row execute function public.assert_same_school('admission_periods', 'period_id');

-- Keputusan & catatan internal seleksi: hanya petugas.
create table public.admission_reviews (
  application_id uuid primary key references public.admission_applications(id) on delete cascade,
  school_id      uuid not null references public.schools(id) on delete cascade,
  decision       public.admission_status check (decision in ('accepted','waitlisted','rejected')),
  score          numeric(6,2),
  internal_note  text,
  decided_by     uuid references public.profiles(id),
  decided_at     timestamptz
);
create trigger admission_reviews_same_school before insert or update on public.admission_reviews
  for each row execute function public.assert_same_school('admission_applications', 'application_id');

create trigger audit_admission_applications after update or delete on public.admission_applications
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------
-- Aturan perubahan formulir
-- Pendaftar hanya mengubah isian selama masih draf. Status, nomor, biaya,
-- dan catatan sekolah hanya berubah lewat fungsi PPDB di bawah.
-- ---------------------------------------------------------------------
create or replace function public.period_is_open(p_period uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admission_periods p
                 where p.id = p_period and p.is_published
                   and (now() at time zone 'Asia/Jakarta')::date between p.opens_on and p.closes_on
                   and public.school_has_module(p.school_id, 'ppdb'))
$$;

create or replace function public.guard_admission_application()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.ppdb', true), '') = 'on' or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    select school_id into new.school_id from admission_periods where id = new.period_id;
    if not public.period_is_open(new.period_id) then
      raise exception 'Pendaftaran gelombang ini belum dibuka atau sudah ditutup';
    end if;
    if (select count(*) from admission_applications
        where period_id = new.period_id and applicant_id = auth.uid()) >= 5 then
      raise exception 'Satu akun maksimal mendaftarkan 5 calon murid per gelombang';
    end if;
    new.applicant_id := auth.uid();
    new.status := 'draft';
    new.number := null; new.staff_note := null; new.student_id := null;
    new.fee_status := 'unpaid'; new.fee_method := null; new.fee_paid_at := null; new.fee_received_by := null;
    new.submitted_at := null; new.verified_at := null;
    return new;
  end if;
  if old.status <> 'draft' then
    raise exception 'Formulir sudah dikirim dan tidak bisa diubah. Hubungi panitia PPDB bila ada data yang salah.';
  end if;
  if (new.status, new.number, new.staff_note, new.student_id, new.fee_status, new.fee_method, new.fee_paid_at,
      new.fee_received_by, new.submitted_at, new.verified_at, new.period_id, new.school_id, new.applicant_id)
     is distinct from
     (old.status, old.number, old.staff_note, old.student_id, old.fee_status, old.fee_method, old.fee_paid_at,
      old.fee_received_by, old.submitted_at, old.verified_at, old.period_id, old.school_id, old.applicant_id) then
    raise exception 'Status dan data panitia hanya bisa diubah lewat proses PPDB';
  end if;
  return new;
end $$;
create trigger admission_applications_guard before insert or update on public.admission_applications
  for each row execute function public.guard_admission_application();

create trigger admission_periods_module before insert on public.admission_periods
  for each row execute function public.require_module('ppdb');

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.admission_periods      enable row level security;
alter table public.admission_applications enable row level security;
alter table public.admission_reviews      enable row level security;

create policy periods_read on public.admission_periods for select to authenticated
  using (is_published or public.is_ppdb_staff(school_id));
create policy periods_write on public.admission_periods for all to authenticated
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());

create policy applications_read on public.admission_applications for select to authenticated
  using (applicant_id = auth.uid() or public.is_ppdb_staff(school_id));
create policy applications_insert on public.admission_applications for insert to authenticated
  with check (applicant_id = auth.uid());
create policy applications_update on public.admission_applications for update to authenticated
  using (applicant_id = auth.uid()) with check (applicant_id = auth.uid());
create policy applications_delete on public.admission_applications for delete to authenticated
  using (applicant_id = auth.uid() and status = 'draft');

-- Panitia melihat nama & email akun pendaftar walau belum menjadi anggota sekolah.
create policy profiles_ppdb_applicant on public.profiles for select to authenticated
  using (exists (select 1 from public.admission_applications a
                 where a.applicant_id = profiles.id and public.is_ppdb_staff(a.school_id)));

create policy reviews_read on public.admission_reviews for select to authenticated
  using (public.is_ppdb_staff(school_id));
-- Penulisan keputusan lewat ppdb_decide.

-- ---------------------------------------------------------------------
-- Berkas pendaftaran: admission-docs/<school_id>/<application_id>/<berkas>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('admission-docs', 'admission-docs', false, 5242880, array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create or replace function public.can_edit_admission(p_app uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admission_applications where id = p_app and applicant_id = auth.uid() and status = 'draft')
$$;
create or replace function public.can_view_admission(p_app uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admission_applications a
                 where a.id = p_app and (a.applicant_id = auth.uid() or public.is_ppdb_staff(a.school_id)))
$$;

create policy "admission docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'admission-docs' and public.can_edit_admission(public.try_uuid((storage.foldername(name))[2]))
              and exists (select 1 from public.admission_applications a
                          where a.id = public.try_uuid((storage.foldername(name))[2])
                            and a.school_id = public.try_uuid((storage.foldername(name))[1])));
create policy "admission docs read" on storage.objects for select to authenticated
  using (bucket_id = 'admission-docs' and public.can_view_admission(public.try_uuid((storage.foldername(name))[2])));
create policy "admission docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'admission-docs' and public.can_edit_admission(public.try_uuid((storage.foldername(name))[2])));

-- ---------------------------------------------------------------------
-- Halaman publik /ppdb/<slug>
-- ---------------------------------------------------------------------
create or replace function public.ppdb_public(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'school', public.school_brand(s.id) || jsonb_build_object(
      'id', s.id, 'level', s.level, 'address', s.address, 'phone', s.phone, 'email', s.email, 'website', s.website),
    'periods', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'title', p.title, 'school_year', p.school_year, 'grade_level', p.grade_level,
               'opens_on', p.opens_on, 'closes_on', p.closes_on, 'quota', p.quota, 'fee_amount', p.fee_amount,
               'requirements', p.requirements, 'documents', p.documents, 'is_open', public.period_is_open(p.id),
               'announced', p.announced_at is not null)
             order by p.opens_on)
      from admission_periods p
      where p.school_id = s.id and p.is_published
        and p.closes_on >= (now() at time zone 'Asia/Jakarta')::date - 60), '[]'::jsonb))
  from schools s
  where s.slug = lower(p_slug) and s.is_active and public.school_has_module(s.id, 'ppdb')
$$;
grant execute on function public.ppdb_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Proses PPDB
-- ---------------------------------------------------------------------
create or replace function public.ppdb_notify_applicant(a admission_applications, p_kind text, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  values (a.applicant_id, a.school_id, p_kind, p_title, p_body, 'admission_applications', a.id)
$$;
revoke execute on function public.ppdb_notify_applicant(admission_applications, text, text, text) from public, anon, authenticated;

-- Pendaftar mengirim formulir: data wajib dan semua berkas harus lengkap.
create or replace function public.ppdb_submit(p_app uuid)
returns text language plpgsql security definer set search_path = public as $$
declare a admission_applications; p admission_periods; v_missing text; v_seq int;
begin
  select * into a from admission_applications where id = p_app and applicant_id = auth.uid() for update;
  if not found then raise exception 'Formulir tidak ditemukan'; end if;
  if a.status <> 'draft' then raise exception 'Formulir sudah dikirim'; end if;
  if not public.period_is_open(a.period_id) then raise exception 'Pendaftaran gelombang ini sudah ditutup'; end if;
  if a.gender is null or a.birth_date is null or a.birth_place is null or a.address is null
     or a.parent_name is null or a.parent_phone is null then
    raise exception 'Lengkapi jenis kelamin, tempat & tanggal lahir, alamat, serta nama dan nomor HP orang tua';
  end if;
  select * into p from admission_periods where id = a.period_id;
  select string_agg(d, ', ') into v_missing from unnest(p.documents) d
   where coalesce(a.documents->>d, '') = '';
  if v_missing is not null then raise exception 'Berkas belum diunggah: %', v_missing; end if;

  perform set_config('app.ppdb', 'on', true);
  if a.number is null then
    perform pg_advisory_xact_lock(hashtext('ppdb_number:' || a.school_id::text));
    select count(*) + 1 into v_seq from admission_applications where school_id = a.school_id and number like 'PPDB-' || left(p.school_year, 4) || '-%';
    a.number := 'PPDB-' || left(p.school_year, 4) || '-' || lpad(v_seq::text, 4, '0');
  end if;
  update admission_applications set status = 'submitted', number = a.number, submitted_at = now(), staff_note = null
   where id = p_app;

  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select distinct m.user_id, a.school_id, 'ppdb.submitted', 'Pendaftar baru: ' || a.full_name,
         p.title || ' · ' || a.number, 'admission_applications', a.id
  from memberships m where m.school_id = a.school_id and m.is_active and m.role in ('school_admin', 'finance');
  return a.number;
end $$;

-- Pendaftar membatalkan pendaftaran (sebelum didaftarkan sebagai murid).
create or replace function public.ppdb_withdraw(p_app uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.ppdb', 'on', true);
  update admission_applications set status = 'withdrawn'
   where id = p_app and applicant_id = auth.uid() and status not in ('draft', 'enrolled', 'withdrawn');
  if not found then raise exception 'Pendaftaran tidak bisa dibatalkan'; end if;
end $$;

-- TU / admin mencatat biaya pendaftaran (tunai, transfer, atau dibebaskan).
create or replace function public.ppdb_record_fee(p_app uuid, p_method text)
returns void language plpgsql security definer set search_path = public as $$
declare a admission_applications;
begin
  select * into a from admission_applications where id = p_app for update;
  if not found or not public.has_role(a.school_id, array['school_admin','finance']::public.app_role[]) then
    raise exception 'Hanya admin sekolah atau TU yang dapat mencatat biaya pendaftaran';
  end if;
  if p_method not in ('cash', 'transfer', 'waived') then raise exception 'Cara bayar tidak dikenal'; end if;
  if a.status in ('draft', 'withdrawn') then raise exception 'Formulir belum dikirim pendaftar'; end if;
  if a.fee_status <> 'unpaid' then raise exception 'Biaya pendaftaran sudah tercatat'; end if;
  perform set_config('app.ppdb', 'on', true);
  update admission_applications
     set fee_status = case when p_method = 'waived' then 'waived' else 'paid' end,
         fee_method = p_method, fee_paid_at = now(), fee_received_by = auth.uid()
   where id = p_app;
end $$;

-- Admin memverifikasi berkas, atau mengembalikannya ke pendaftar untuk diperbaiki.
create or replace function public.ppdb_verify(p_app uuid, p_ok boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a admission_applications; v_fee bigint;
begin
  select * into a from admission_applications where id = p_app for update;
  if not found or not (public.has_role(a.school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin()) then
    raise exception 'Hanya admin sekolah yang dapat memverifikasi pendaftar';
  end if;
  if a.status <> 'submitted' then raise exception 'Hanya formulir berstatus terkirim yang bisa diverifikasi'; end if;
  perform set_config('app.ppdb', 'on', true);
  if p_ok then
    select fee_amount into v_fee from admission_periods where id = a.period_id;
    if v_fee > 0 and a.fee_status = 'unpaid' then
      raise exception 'Biaya pendaftaran belum dibayar. Catat pembayarannya dulu atau bebaskan biayanya.';
    end if;
    update admission_applications set status = 'verified', verified_at = now(), staff_note = nullif(trim(p_note), '') where id = p_app;
    perform public.ppdb_notify_applicant(a, 'ppdb.verified', 'Berkas PPDB terverifikasi', a.full_name || ' · ' || a.number);
  else
    if coalesce(trim(p_note), '') = '' then raise exception 'Tulis apa yang perlu diperbaiki pendaftar'; end if;
    update admission_applications set status = 'draft', staff_note = trim(p_note) where id = p_app;
    perform public.ppdb_notify_applicant(a, 'ppdb.returned', 'Formulir PPDB perlu diperbaiki', trim(p_note));
  end if;
end $$;

-- Jumlah yang sudah diterima di satu gelombang (termasuk yang sudah jadi murid).
create or replace function public.ppdb_accepted_count(p_period uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from admission_applications where period_id = p_period and status in ('accepted', 'enrolled')
$$;

-- Admin / kepsek memberi keputusan seleksi. Sebelum diumumkan, keputusan
-- hanya tersimpan untuk panitia; setelah diumumkan langsung berlaku.
create or replace function public.ppdb_decide(p_app uuid, p_decision text, p_score numeric default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a admission_applications; p admission_periods;
begin
  select * into a from admission_applications where id = p_app for update;
  if not found or not (public.has_role(a.school_id, array['school_admin','principal']::public.app_role[]) or public.is_platform_admin()) then
    raise exception 'Hanya admin sekolah atau kepala sekolah yang dapat memberi keputusan';
  end if;
  if p_decision not in ('accepted', 'waitlisted', 'rejected') then raise exception 'Keputusan tidak dikenal'; end if;
  select * into p from admission_periods where id = a.period_id for update;
  if a.status not in ('verified', 'accepted', 'waitlisted', 'rejected') then
    raise exception 'Verifikasi berkas pendaftar terlebih dahulu';
  end if;
  insert into admission_reviews (application_id, school_id, decision, score, internal_note, decided_by, decided_at)
  values (a.id, a.school_id, p_decision::admission_status, p_score, nullif(trim(p_note), ''), auth.uid(), now())
  on conflict (application_id) do update
    set decision = excluded.decision, score = coalesce(excluded.score, admission_reviews.score),
        internal_note = coalesce(excluded.internal_note, admission_reviews.internal_note),
        decided_by = excluded.decided_by, decided_at = excluded.decided_at;

  if p.announced_at is not null and a.status::text <> p_decision then
    if p_decision = 'accepted' and p.quota is not null and public.ppdb_accepted_count(p.id) >= p.quota then
      raise exception 'Kuota gelombang ini (%) sudah penuh', p.quota;
    end if;
    perform set_config('app.ppdb', 'on', true);
    update admission_applications set status = p_decision::admission_status where id = p_app;
    perform public.ppdb_notify_applicant(a, 'ppdb.result', 'Hasil seleksi PPDB: ' || a.full_name,
      case p_decision when 'accepted' then 'Selamat, diterima' when 'waitlisted' then 'Masuk daftar cadangan' else 'Belum diterima' end);
  end if;
end $$;

-- Mengumumkan hasil satu gelombang: keputusan panitia menjadi status pendaftar.
create or replace function public.ppdb_announce(p_period uuid)
returns int language plpgsql security definer set search_path = public as $$
declare p admission_periods; v_accept int; v_n int := 0; x record;
begin
  select * into p from admission_periods where id = p_period for update;
  if not found or not (public.has_role(p.school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin()) then
    raise exception 'Hanya admin sekolah yang dapat mengumumkan hasil';
  end if;
  if p.announced_at is not null then raise exception 'Hasil gelombang ini sudah diumumkan'; end if;
  if exists (select 1 from admission_applications a left join admission_reviews r on r.application_id = a.id
             where a.period_id = p_period and a.status = 'verified' and r.decision is null) then
    raise exception 'Masih ada pendaftar terverifikasi yang belum diberi keputusan';
  end if;
  select count(*) into v_accept from admission_applications a join admission_reviews r on r.application_id = a.id
   where a.period_id = p_period and a.status = 'verified' and r.decision = 'accepted';
  if p.quota is not null and v_accept > p.quota then
    raise exception 'Jumlah diterima (%) melebihi kuota (%)', v_accept, p.quota;
  end if;

  perform set_config('app.ppdb', 'on', true);
  for x in
    update admission_applications a set status = rv.decision
      from admission_reviews rv
     where rv.application_id = a.id and a.period_id = p_period and a.status = 'verified'
    returning a.*
  loop
    v_n := v_n + 1;
    insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
    values (x.applicant_id, x.school_id, 'ppdb.result', 'Hasil seleksi PPDB: ' || x.full_name,
            case x.status when 'accepted' then 'Selamat, diterima' when 'waitlisted' then 'Masuk daftar cadangan' else 'Belum diterima' end,
            'admission_applications', x.id);
  end loop;
  update admission_periods set announced_at = now() where id = p_period;
  return v_n;
end $$;

-- Mendaftarkan pendaftar yang diterima sebagai murid. Akun pendaftar menjadi wali murid.
create or replace function public.ppdb_enroll(p_app uuid, p_class uuid default null, p_nis text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare a admission_applications; v_student uuid;
begin
  select * into a from admission_applications where id = p_app for update;
  if not found or not (public.has_role(a.school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin()) then
    raise exception 'Hanya admin sekolah yang dapat mendaftarkan murid baru';
  end if;
  if a.status <> 'accepted' then raise exception 'Hanya pendaftar yang diterima yang bisa didaftarkan sebagai murid'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class and school_id = a.school_id) then
    raise exception 'Kelas tidak ditemukan';
  end if;

  insert into students (school_id, nis, nisn, full_name, gender, birth_place, birth_date, address)
  values (a.school_id, nullif(trim(p_nis), ''), a.nisn, trim(a.full_name), a.gender, a.birth_place, a.birth_date, a.address)
  returning id into v_student;
  if p_class is not null then
    insert into enrollments (school_id, class_id, student_id) values (a.school_id, p_class, v_student);
  end if;
  insert into guardian_links (student_id, guardian_id, school_id, relation, is_primary)
  values (v_student, a.applicant_id, a.school_id, a.parent_relation, true);
  insert into memberships (school_id, user_id, role) values (a.school_id, a.applicant_id, 'guardian')
  on conflict (school_id, user_id, role) do update set is_active = true;
  update profiles set phone = coalesce(phone, a.parent_phone),
         full_name = case when full_name = '' then coalesce(a.parent_name, '') else full_name end
   where id = a.applicant_id;

  perform set_config('app.ppdb', 'on', true);
  update admission_applications set status = 'enrolled', student_id = v_student where id = p_app;
  perform public.ppdb_notify_applicant(a, 'ppdb.enrolled', 'Selamat datang di sekolah baru',
    a.full_name || ' sudah terdaftar sebagai murid. Masuk kembali untuk membuka menu orang tua.');
  return v_student;
end $$;

revoke execute on function public.ppdb_submit(uuid), public.ppdb_withdraw(uuid), public.ppdb_record_fee(uuid, text),
  public.ppdb_verify(uuid, boolean, text), public.ppdb_decide(uuid, text, numeric, text),
  public.ppdb_announce(uuid), public.ppdb_enroll(uuid, uuid, text) from public, anon;
grant execute on function public.ppdb_submit(uuid), public.ppdb_withdraw(uuid), public.ppdb_record_fee(uuid, text),
  public.ppdb_verify(uuid, boolean, text), public.ppdb_decide(uuid, text, numeric, text),
  public.ppdb_announce(uuid), public.ppdb_enroll(uuid, uuid, text) to authenticated;
