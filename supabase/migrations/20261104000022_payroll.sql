-- =====================================================================
-- SekolahApp · 0022 · Penggajian guru & staf (modul paket "payroll")
-- TU menyusun data pegawai (gaji pokok, rekening) dan komponen gaji
-- (tunjangan tetap, uang transport per hari hadir, honor per JP, potongan
-- terlambat/alpa, potongan persen gaji pokok seperti BPJS). Tiap bulan TU
-- membuat penggajian: slip dihitung dari absensi guru & jadwal mengajar,
-- bisa diberi penyesuaian (lembur, kasbon), disetujui kepala sekolah, lalu
-- ditandai dibayar. Pegawai melihat slipnya sendiri setelah dibayar.
-- Slip hanya berubah lewat fungsi di file ini.
-- =====================================================================

update public.plans set modules = array_append(modules, 'payroll')
 where tier in ('pro', 'enterprise') and not ('payroll' = any(modules));

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
    when 'cbt' then 'Ujian online (CBT)'
    when 'whatsapp' then 'Notifikasi WhatsApp'
    when 'canteen' then 'Kantin digital'
    when 'payroll' then 'Penggajian'
    else p_module end
$$;

create or replace function public.wa_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind like 'attendance.%' then 'kehadiran'
    when p_kind in ('invoice.new', 'payment.paid') or p_kind like 'canteen.%' then 'tagihan'
    when p_kind like 'leave.%' then 'izin'
    when p_kind = 'announcement' then 'pengumuman'
    when p_kind = 'message' then 'pesan'
    when p_kind in ('assignment.new', 'submission.graded', 'report.published', 'exam.scheduled', 'exam.reset', 'online_session.new') then 'akademik'
    when p_kind like 'ppdb.%' then 'ppdb'
    when p_kind like 'staff_leave.%' or p_kind like 'directive.%' or p_kind like 'payroll.%' then 'kepegawaian'
    else null end
$$;

create or replace function public.bulan_tahun(p_date date)
returns text language sql immutable as $$
  select (array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'])
         [extract(month from p_date)::int] || ' ' || extract(year from p_date)::int
$$;

-- Yang boleh melihat data gaji: TU, admin, kepala sekolah, pengurus yayasan.
create or replace function public.is_payroll_viewer(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_school, array['finance', 'school_admin', 'principal']::public.app_role[])
      or public.is_foundation_admin_of_school(p_school)
$$;

create or replace function public.is_payroll_manager(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_school, array['finance', 'school_admin']::public.app_role[])
$$;

-- Pengaturan: menit per JP & jumlah pekan per bulan untuk honor mengajar.
create or replace function public.payroll_settings(p_school uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'jp_minutes', coalesce((settings ->> 'payroll_jp_minutes')::int, 40),
    'jp_weeks', coalesce((settings ->> 'payroll_jp_weeks')::int, 4))
  from schools where id = p_school
$$;

-- ---------------------------------------------------------------------
-- Komponen gaji, pegawai, penggajian bulanan, slip
-- ---------------------------------------------------------------------
create type public.payroll_calc as enum ('fixed', 'per_attendance', 'per_jp', 'per_late', 'per_absence', 'percent_base');
create type public.payroll_status as enum ('draft', 'approved', 'paid');

create table public.payroll_components (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  name           text not null check (length(name) between 2 and 60),
  kind           text not null check (kind in ('earning', 'deduction')),
  calc           public.payroll_calc not null default 'fixed',
  rate           numeric(14,2) not null default 0 check (rate >= 0),   -- rupiah, atau persen untuk percent_base
  applies_to_all boolean not null default false,                       -- otomatis untuk semua pegawai aktif
  is_active      boolean not null default true,
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  unique (school_id, name),
  check (calc <> 'percent_base' or rate <= 100)
);
create trigger payroll_components_module before insert on public.payroll_components
  for each row execute function public.require_module('payroll');

create table public.payroll_employees (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete set null,   -- kosong untuk staf tanpa akun (satpam, kebersihan)
  full_name      text not null check (length(full_name) between 2 and 120),
  position       text check (length(position) <= 80),                     -- jabatan, mis. "Guru Matematika", "Wakasek Kurikulum"
  status         text not null default 'gty' check (status in ('gty', 'gtt', 'pty', 'ptt', 'pns', 'pppk', 'honorer')),
  nip            text check (length(nip) <= 40),
  base_salary    bigint not null default 0 check (base_salary >= 0),
  bank_name      text check (length(bank_name) <= 40),
  bank_account   text check (length(bank_account) <= 40),
  account_holder text check (length(account_holder) <= 120),
  joined_on      date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (school_id, user_id)
);
create index on public.payroll_employees (user_id);
create trigger payroll_employees_module before insert on public.payroll_employees
  for each row execute function public.require_module('payroll');

create or replace function public.guard_payroll_employee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and not exists (
       select 1 from memberships m where m.user_id = new.user_id and m.school_id = new.school_id
          and m.role in ('school_admin', 'principal', 'teacher', 'counselor', 'finance', 'canteen')) then
    raise exception 'Akun pegawai harus guru atau staf sekolah ini';
  end if;
  return new;
end $$;
create trigger payroll_employees_guard before insert or update on public.payroll_employees
  for each row execute function public.guard_payroll_employee();

create or replace function public.guard_payroll_employee_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from payslips where employee_id = old.id) then
    raise exception 'Pegawai sudah punya slip gaji; nonaktifkan saja agar riwayatnya tetap ada';
  end if;
  return old;
end $$;

-- Nominal komponen khusus per pegawai (0 = tidak berlaku untuk pegawai ini).
create table public.payroll_employee_components (
  employee_id  uuid not null references public.payroll_employees(id) on delete cascade,
  component_id uuid not null references public.payroll_components(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  rate         numeric(14,2) not null check (rate >= 0),
  primary key (employee_id, component_id)
);

create or replace function public.guard_payroll_employee_component()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from payroll_employees where id = new.employee_id and school_id = new.school_id)
     or not exists (select 1 from payroll_components where id = new.component_id and school_id = new.school_id) then
    raise exception 'Pegawai dan komponen harus dari sekolah yang sama';
  end if;
  if new.rate > 100 and exists (select 1 from payroll_components where id = new.component_id and calc = 'percent_base') then
    raise exception 'Persentase maksimal 100';
  end if;
  return new;
end $$;
create trigger payroll_employee_components_guard before insert or update on public.payroll_employee_components
  for each row execute function public.guard_payroll_employee_component();

create table public.payroll_runs (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  period       date not null check (extract(day from period) = 1),
  status       public.payroll_status not null default 'draft',
  note         text check (length(note) <= 500),
  created_by   uuid references public.profiles(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  approved_by  uuid references public.profiles(id),
  approved_at  timestamptz,
  paid_on      date,
  paid_method  text check (paid_method in ('transfer', 'tunai')),
  unique (school_id, period)
);
create trigger payroll_runs_module before insert on public.payroll_runs
  for each row execute function public.require_module('payroll');

create table public.payslips (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.payroll_runs(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  employee_id  uuid not null references public.payroll_employees(id),
  user_id      uuid references public.profiles(id) on delete set null,
  full_name    text not null,
  position     text,
  status       text not null,
  base_salary  bigint not null default 0,
  attendance   jsonb not null default '{}',   -- {hadir, terlambat, izin, sakit, cuti, dinas, alpa, jp_week, jp}
  lines        jsonb not null default '[]',   -- [{name, kind, calc, qty, rate, amount}]
  adjustments  jsonb not null default '[]',   -- [{label, amount}] + pendapatan, − potongan
  gross        bigint not null default 0,
  deductions   bigint not null default 0,
  net          bigint not null default 0,
  unique (run_id, employee_id)
);
create index on public.payslips (user_id);
create index on public.payslips (employee_id);

create trigger payroll_employees_guard_delete before delete on public.payroll_employees
  for each row execute function public.guard_payroll_employee_delete();

-- ---------------------------------------------------------------------
-- Perhitungan slip
-- ---------------------------------------------------------------------
-- JP per pekan dari jadwal mengajar tahun ajaran aktif.
create or replace function public.payroll_weekly_jp(p_school uuid, p_user uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(greatest(1, round(extract(epoch from (s.ends_at - s.starts_at)) / 60.0
                                        / (public.payroll_settings(p_school) ->> 'jp_minutes')::int))), 0)::int
    from schedules s
    join teaching_assignments ta on ta.id = s.teaching_assignment_id
    join classes c on c.id = ta.class_id
    join academic_years ay on ay.id = c.academic_year_id and ay.is_active
   where ta.teacher_id = p_user and ta.school_id = p_school
$$;
revoke execute on function public.payroll_weekly_jp(uuid, uuid) from public, anon;
grant execute on function public.payroll_weekly_jp(uuid, uuid) to authenticated;

create or replace function public.payroll_compute(p_slip uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  sl payslips; r payroll_runs; e payroll_employees;
  v_att jsonb; v_jp_week int := 0; v_jp int := 0; v_lines jsonb := '[]';
  c record; v_qty numeric; v_amount bigint; v_gross bigint := 0; v_ded bigint := 0; a jsonb;
begin
  select * into sl from payslips where id = p_slip;
  select * into r from payroll_runs where id = sl.run_id;
  select * into e from payroll_employees where id = sl.employee_id;

  select jsonb_build_object(
           'hadir', count(*) filter (where status = 'hadir'),
           'terlambat', count(*) filter (where status = 'terlambat'),
           'izin', count(*) filter (where status = 'izin'),
           'sakit', count(*) filter (where status = 'sakit'),
           'cuti', count(*) filter (where status = 'cuti'),
           'dinas', count(*) filter (where status = 'dinas'),
           'alpa', count(*) filter (where status = 'alpa'))
    into v_att
    from staff_attendance
   where school_id = r.school_id and user_id = e.user_id
     and date >= r.period and date < (r.period + interval '1 month');
  if e.user_id is not null then
    v_jp_week := public.payroll_weekly_jp(r.school_id, e.user_id);
    v_jp := v_jp_week * (public.payroll_settings(r.school_id) ->> 'jp_weeks')::int;
  end if;
  v_att := v_att || jsonb_build_object('jp_week', v_jp_week, 'jp', v_jp);

  if e.base_salary > 0 then
    v_lines := v_lines || jsonb_build_object('name', 'Gaji pokok', 'kind', 'earning', 'calc', 'fixed', 'qty', 1, 'rate', e.base_salary, 'amount', e.base_salary);
    v_gross := e.base_salary;
  end if;

  for c in
    select pc.name, pc.kind, pc.calc, coalesce(ec.rate, pc.rate) as rate
      from payroll_components pc
      left join payroll_employee_components ec on ec.component_id = pc.id and ec.employee_id = e.id
     where pc.school_id = r.school_id and pc.is_active and (pc.applies_to_all or ec.employee_id is not null)
     order by pc.kind desc, pc.position, pc.name
  loop
    v_qty := case c.calc
      when 'fixed' then 1
      when 'per_attendance' then (v_att->>'hadir')::int + (v_att->>'terlambat')::int + (v_att->>'dinas')::int
      when 'per_jp' then v_jp
      when 'per_late' then (v_att->>'terlambat')::int
      when 'per_absence' then (v_att->>'alpa')::int
      else null end;
    v_amount := round(case when c.calc = 'percent_base' then e.base_salary * c.rate / 100 else v_qty * c.rate end);
    continue when v_amount = 0;
    v_lines := v_lines || jsonb_build_object('name', c.name, 'kind', c.kind, 'calc', c.calc, 'qty', v_qty, 'rate', c.rate, 'amount', v_amount);
    if c.kind = 'earning' then v_gross := v_gross + v_amount; else v_ded := v_ded + v_amount; end if;
  end loop;

  for a in select * from jsonb_array_elements(sl.adjustments) loop
    if (a->>'amount')::bigint > 0 then v_gross := v_gross + (a->>'amount')::bigint;
    else v_ded := v_ded - (a->>'amount')::bigint; end if;
  end loop;

  update payslips set full_name = e.full_name, position = e.position, status = e.status, user_id = e.user_id,
         base_salary = e.base_salary, attendance = v_att, lines = v_lines,
         gross = v_gross, deductions = v_ded, net = v_gross - v_ded
   where id = p_slip;
end $$;
revoke execute on function public.payroll_compute(uuid) from public, anon, authenticated;

create or replace function public.payroll_assert_draft(p_run uuid)
returns payroll_runs language plpgsql security definer set search_path = public as $$
declare r payroll_runs;
begin
  select * into r from payroll_runs where id = p_run;
  if r.id is null or not public.is_payroll_manager(r.school_id) then
    raise exception 'Hanya Tata Usaha yang bisa mengubah penggajian';
  end if;
  if r.status <> 'draft' then
    raise exception 'Penggajian % sudah %; buka kembali dulu untuk mengubah', public.bulan_tahun(r.period),
      case r.status when 'approved' then 'disetujui' else 'dibayar' end;
  end if;
  return r;
end $$;
revoke execute on function public.payroll_assert_draft(uuid) from public, anon, authenticated;

-- Tambah slip untuk pegawai aktif yang belum ada, lalu hitung ulang semua slip.
create or replace function public.payroll_refresh(p_run uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r payroll_runs; s uuid; n int := 0;
begin
  r := public.payroll_assert_draft(p_run);
  insert into payslips (run_id, school_id, employee_id, full_name, status)
  select r.id, r.school_id, e.id, e.full_name, e.status
    from payroll_employees e
   where e.school_id = r.school_id and e.is_active
     and (e.joined_on is null or e.joined_on < r.period + interval '1 month')
  on conflict (run_id, employee_id) do nothing;
  for s in select id from payslips where run_id = r.id loop
    perform public.payroll_compute(s); n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.payroll_refresh(uuid) from public, anon;
grant execute on function public.payroll_refresh(uuid) to authenticated;

create or replace function public.payroll_create_run(p_school uuid, p_period date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_period date := date_trunc('month', p_period)::date;
begin
  if not public.is_payroll_manager(p_school) then
    raise exception 'Hanya Tata Usaha yang bisa membuat penggajian';
  end if;
  if exists (select 1 from payroll_runs where school_id = p_school and period = v_period) then
    raise exception 'Penggajian % sudah dibuat', public.bulan_tahun(v_period);
  end if;
  if not exists (select 1 from payroll_employees where school_id = p_school and is_active) then
    raise exception 'Belum ada pegawai aktif. Tambahkan data pegawai dulu.';
  end if;
  insert into payroll_runs (school_id, period, note) values (p_school, v_period, nullif(trim(p_note), '')) returning id into v_id;
  perform public.payroll_refresh(v_id);
  return v_id;
end $$;
revoke execute on function public.payroll_create_run(uuid, date, text) from public, anon;
grant execute on function public.payroll_create_run(uuid, date, text) to authenticated;

create or replace function public.payroll_set_adjustments(p_slip uuid, p_adjustments jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_run uuid; a jsonb; v_clean jsonb := '[]';
begin
  select run_id into v_run from payslips where id = p_slip;
  if v_run is null then raise exception 'Slip tidak ditemukan'; end if;
  perform public.payroll_assert_draft(v_run);
  if jsonb_typeof(p_adjustments) <> 'array' or jsonb_array_length(p_adjustments) > 20 then
    raise exception 'Penyesuaian maksimal 20 baris';
  end if;
  for a in select * from jsonb_array_elements(p_adjustments) loop
    if length(trim(coalesce(a->>'label', ''))) not between 2 and 80 then
      raise exception 'Keterangan penyesuaian 2–80 huruf';
    end if;
    if coalesce((a->>'amount')::bigint, 0) = 0 or abs((a->>'amount')::bigint) > 1000000000 then
      raise exception 'Nominal penyesuaian "%" tidak valid', a->>'label';
    end if;
    v_clean := v_clean || jsonb_build_object('label', trim(a->>'label'), 'amount', (a->>'amount')::bigint);
  end loop;
  update payslips set adjustments = v_clean where id = p_slip;
  perform public.payroll_compute(p_slip);
end $$;
revoke execute on function public.payroll_set_adjustments(uuid, jsonb) from public, anon;
grant execute on function public.payroll_set_adjustments(uuid, jsonb) to authenticated;

create or replace function public.payroll_remove_slip(p_slip uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_run uuid;
begin
  select run_id into v_run from payslips where id = p_slip;
  if v_run is null then raise exception 'Slip tidak ditemukan'; end if;
  perform public.payroll_assert_draft(v_run);
  delete from payslips where id = p_slip;
end $$;
revoke execute on function public.payroll_remove_slip(uuid) from public, anon;
grant execute on function public.payroll_remove_slip(uuid) to authenticated;

-- Kepala sekolah (atau admin) menyetujui; TU tidak bisa menyetujui buatannya sendiri.
create or replace function public.payroll_approve(p_run uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r payroll_runs;
begin
  select * into r from payroll_runs where id = p_run;
  if r.id is null or not public.has_role(r.school_id, array['principal', 'school_admin']::public.app_role[]) then
    raise exception 'Hanya kepala sekolah atau admin yang bisa menyetujui penggajian';
  end if;
  if r.status <> 'draft' then raise exception 'Penggajian ini tidak menunggu persetujuan'; end if;
  if not exists (select 1 from payslips where run_id = p_run) then raise exception 'Penggajian belum berisi slip'; end if;
  update payroll_runs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_run;
  perform public.notify(r.created_by, r.school_id, 'payroll.approved', 'Penggajian ' || public.bulan_tahun(r.period) || ' disetujui',
    'Silakan proses pembayaran gaji.', 'payroll_runs', r.id);
end $$;
revoke execute on function public.payroll_approve(uuid) from public, anon;
grant execute on function public.payroll_approve(uuid) to authenticated;

create or replace function public.payroll_reopen(p_run uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r payroll_runs;
begin
  select * into r from payroll_runs where id = p_run;
  if r.id is null or not public.has_role(r.school_id, array['principal', 'school_admin', 'finance']::public.app_role[]) then
    raise exception 'Tidak berhak membuka kembali penggajian';
  end if;
  if r.status <> 'approved' then raise exception 'Hanya penggajian yang disetujui dan belum dibayar yang bisa dibuka kembali'; end if;
  update payroll_runs set status = 'draft', approved_by = null, approved_at = null where id = p_run;
end $$;
revoke execute on function public.payroll_reopen(uuid) from public, anon;
grant execute on function public.payroll_reopen(uuid) to authenticated;

create or replace function public.payroll_mark_paid(p_run uuid, p_method text, p_paid_on date default null)
returns void language plpgsql security definer set search_path = public as $$
declare r payroll_runs; s record;
begin
  select * into r from payroll_runs where id = p_run;
  if r.id is null or not public.is_payroll_manager(r.school_id) then
    raise exception 'Hanya Tata Usaha yang bisa mencatat pembayaran gaji';
  end if;
  if r.status <> 'approved' then raise exception 'Penggajian harus disetujui kepala sekolah sebelum dibayar'; end if;
  if p_method not in ('transfer', 'tunai') then raise exception 'Metode pembayaran tidak dikenal'; end if;
  update payroll_runs set status = 'paid', paid_method = p_method,
         paid_on = coalesce(p_paid_on, (now() at time zone 'Asia/Jakarta')::date)
   where id = p_run;
  for s in select id, user_id, net from payslips where run_id = p_run and user_id is not null loop
    perform public.notify(s.user_id, r.school_id, 'payroll.paid', 'Slip gaji ' || public.bulan_tahun(r.period),
      'Gaji bersih ' || public.rp(s.net) || case p_method when 'transfer' then ' sudah ditransfer.' else ' sudah dibayarkan tunai.' end,
      'payslips', s.id);
  end loop;
end $$;
revoke execute on function public.payroll_mark_paid(uuid, text, date) from public, anon;
grant execute on function public.payroll_mark_paid(uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.payroll_components enable row level security;
alter table public.payroll_employees enable row level security;
alter table public.payroll_employee_components enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payslips enable row level security;

create policy pc_read on public.payroll_components for select using (public.is_payroll_viewer(school_id));
create policy pc_write on public.payroll_components for all
  using (public.is_payroll_manager(school_id)) with check (public.is_payroll_manager(school_id));

create policy pe_read on public.payroll_employees for select using (public.is_payroll_viewer(school_id) or user_id = auth.uid());
create policy pe_write on public.payroll_employees for all
  using (public.is_payroll_manager(school_id)) with check (public.is_payroll_manager(school_id));

create policy pec_read on public.payroll_employee_components for select using (public.is_payroll_viewer(school_id));
create policy pec_write on public.payroll_employee_components for all
  using (public.is_payroll_manager(school_id)) with check (public.is_payroll_manager(school_id));

create or replace function public.payroll_run_paid(p_run uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from payroll_runs where id = p_run and status = 'paid')
$$;

create policy pr_read on public.payroll_runs for select
  using (public.is_payroll_viewer(school_id)
         or (status = 'paid' and exists (select 1 from payslips s where s.run_id = payroll_runs.id and s.user_id = auth.uid())));
create policy pr_delete on public.payroll_runs for delete
  using (status = 'draft' and public.is_payroll_manager(school_id));

create policy ps_read on public.payslips for select
  using (public.is_payroll_viewer(school_id) or (user_id = auth.uid() and public.payroll_run_paid(run_id)));
