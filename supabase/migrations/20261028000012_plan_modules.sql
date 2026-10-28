-- =====================================================================
-- SekolahApp · 0012 · Fitur sesuai paket langganan
-- plans.modules menentukan fitur yang boleh dipakai sekolah. Penulisan data
-- fitur berbayar ditolak di database; tampilan web/HP menyembunyikannya.
-- Data lama tetap bisa dibaca setelah sekolah turun paket, dan tagihan yang
-- sudah terbit tetap bisa dibayar.
-- =====================================================================

create or replace function public.school_modules(p_school uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select p.modules from schools s join plans p on p.tier = s.plan where s.id = p_school), '{}')
$$;

create or replace function public.school_has_module(p_school uuid, p_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_module = any(public.school_modules(p_school))
$$;

create or replace function public.module_label(p_module text)
returns text language sql immutable as $$
  select case p_module
    when 'staff' then 'Absen & cuti guru'
    when 'finance' then 'SPP & pembayaran'
    when 'grades' then 'Penilaian & rapor'
    when 'counseling' then 'BK & catatan sikap'
    when 'dashboard' then 'Dasbor kepala sekolah'
    when 'foundation' then 'Dasbor yayasan'
    else p_module end
$$;

-- Trigger umum: TG_ARGV[0] = nama modul. Baris harus punya kolom school_id.
create or replace function public.require_module()
returns trigger language plpgsql as $$
begin
  if not public.school_has_module(new.school_id, tg_argv[0]) then
    raise exception 'Fitur % belum termasuk paket sekolah Anda. Admin sekolah dapat menaikkan paket di menu Langganan & Paket.',
      public.module_label(tg_argv[0]);
  end if;
  return new;
end $$;

create trigger staff_attendance_module before insert on public.staff_attendance
  for each row execute function public.require_module('staff');
create trigger staff_leave_module before insert on public.staff_leave_requests
  for each row execute function public.require_module('staff');
create trigger directives_module before insert on public.directives
  for each row execute function public.require_module('staff');
create trigger fee_types_module before insert on public.fee_types
  for each row execute function public.require_module('finance');
create trigger invoices_module before insert on public.invoices
  for each row execute function public.require_module('finance');
create trigger behavior_records_module before insert on public.behavior_records
  for each row execute function public.require_module('counseling');
create trigger counseling_notes_module before insert on public.counseling_notes
  for each row execute function public.require_module('counseling');

-- ---------------------------------------------------------------------
-- Batas jumlah murid aktif (paket Gratis: 100)
-- ---------------------------------------------------------------------
create or replace function public.guard_student_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_max int; v_name text; v_count int;
begin
  if new.status <> 'aktif' or (tg_op = 'UPDATE' and old.status = 'aktif') then return new; end if;
  select p.max_students, p.name into v_max, v_name from schools s join plans p on p.tier = s.plan where s.id = new.school_id;
  if v_max is null then return new; end if;
  -- Kunci per sekolah agar impor paralel tidak melewati batas.
  perform pg_advisory_xact_lock(hashtext('student_limit:' || new.school_id::text));
  select count(*) into v_count from students where school_id = new.school_id and status = 'aktif' and id <> new.id;
  if v_count >= v_max then
    raise exception 'Paket % maksimal % murid aktif. Admin sekolah dapat menaikkan paket di menu Langganan & Paket.', v_name, v_max;
  end if;
  return new;
end $$;
create trigger students_limit before insert or update of status on public.students
  for each row execute function public.guard_student_limit();

-- ---------------------------------------------------------------------
-- Dasbor yayasan: hanya bila salah satu sekolahnya berlangganan modul yayasan.
-- ---------------------------------------------------------------------
create or replace function public.foundation_has_module(p_foundation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from schools where foundation_id = p_foundation and is_active
                 and public.school_has_module(id, 'foundation'))
$$;
