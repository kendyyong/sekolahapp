-- =====================================================================
-- SekolahApp · 0004 · Absensi murid & guru, izin murid, cuti guru
-- =====================================================================

create type public.attendance_status as enum ('hadir', 'terlambat', 'izin', 'sakit', 'alpa');
create type public.staff_attendance_status as enum ('hadir', 'terlambat', 'izin', 'sakit', 'cuti', 'dinas', 'alpa');
create type public.attendance_method as enum ('manual', 'qr', 'geo', 'leave');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- Tanggal & waktu lokal sekolah.
create or replace function public.school_today(p_school uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from schools where id = p_school), 'Asia/Jakarta'))::date
$$;

create or replace function public.school_local_time(p_school uuid)
returns time language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from schools where id = p_school), 'Asia/Jakarta'))::time
$$;

-- Jarak dua titik (meter), rumus haversine.
create or replace function public.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Lolos geofence? Jika sekolah tidak mengatur geofence, selalu lolos.
create or replace function public.within_geofence(p_school uuid, p_lat float8, p_lng float8)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare g jsonb;
begin
  select settings->'geofence' into g from schools where id = p_school;
  if g is null or jsonb_typeof(g) = 'null' then return true; end if;
  if p_lat is null or p_lng is null then return false; end if;
  return public.distance_m((g->>'lat')::float8, (g->>'lng')::float8, p_lat, p_lng)
         <= coalesce((g->>'radius_m')::float8, 150);
end $$;

-- Terlambat jika lewat jam masuk + toleransi.
create or replace function public.is_late_now(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.school_local_time(p_school) >
         ((settings->>'school_start_time')::time + make_interval(mins => coalesce((settings->>'late_after_minutes')::int, 15)))
  from schools where id = p_school
$$;

-- ---------------------------------------------------------------------
-- Absensi murid
-- teaching_assignment_id kosong = absensi harian; terisi = per jam pelajaran.
-- ---------------------------------------------------------------------
create table public.student_attendance (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  student_id             uuid not null references public.students(id) on delete cascade,
  class_id               uuid not null references public.classes(id) on delete cascade,
  teaching_assignment_id uuid references public.teaching_assignments(id) on delete cascade,
  date                   date not null,
  status                 public.attendance_status not null,
  method                 public.attendance_method not null default 'manual',
  checked_in_at          timestamptz,
  leave_request_id       uuid,
  note                   text,
  recorded_by            uuid default auth.uid() references public.profiles(id),
  updated_at             timestamptz not null default now(),
  unique nulls not distinct (student_id, date, teaching_assignment_id)
);
create index on public.student_attendance (class_id, date);
create index on public.student_attendance (school_id, date);

create trigger student_attendance_same_school before insert or update on public.student_attendance
  for each row execute function public.assert_same_school('students', 'student_id');
create trigger student_attendance_touch before update on public.student_attendance
  for each row execute function public.touch_updated_at();

alter table public.student_attendance enable row level security;
create policy sa_read on public.student_attendance for select using (public.can_view_student(student_id));
create policy sa_write on public.student_attendance for all
  using (public.teaches_class(class_id) or public.has_role(school_id, array['school_admin']::public.app_role[]))
  with check (public.teaches_class(class_id) or public.has_role(school_id, array['school_admin']::public.app_role[]));

-- Murid absen sendiri dengan memindai QR kelas (+ lokasi bila geofence aktif).
create or replace function public.student_check_in(p_class uuid, p_qr_secret text, p_lat float8 default null, p_lng float8 default null)
returns public.student_attendance language plpgsql security definer set search_path = public as $$
declare v_class classes; v_student uuid; v_row student_attendance; v_today date;
begin
  select * into v_class from classes where id = p_class;
  if v_class.id is null or v_class.qr_secret <> p_qr_secret then
    raise exception 'Kode QR tidak valid';
  end if;
  select s.id into v_student from students s join enrollments e on e.student_id = s.id
   where s.user_id = auth.uid() and e.class_id = p_class;
  if v_student is null then raise exception 'Anda tidak terdaftar di kelas ini'; end if;
  if not public.within_geofence(v_class.school_id, p_lat, p_lng) then
    raise exception 'Anda berada di luar area sekolah';
  end if;
  v_today := public.school_today(v_class.school_id);

  insert into student_attendance (school_id, student_id, class_id, date, status, method, checked_in_at, recorded_by)
  values (v_class.school_id, v_student, p_class, v_today,
          case when public.is_late_now(v_class.school_id) then 'terlambat' else 'hadir' end::attendance_status,
          case when p_lat is null then 'qr' else 'geo' end::attendance_method, now(), auth.uid())
  on conflict (student_id, date, teaching_assignment_id) do update
     set checked_in_at = coalesce(student_attendance.checked_in_at, excluded.checked_in_at)
     -- tidak menimpa status izin/sakit yang sudah disetujui
     where student_attendance.status not in ('izin', 'sakit')
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from student_attendance
     where student_id = v_student and date = v_today and teaching_assignment_id is null;
  end if;
  return v_row;
end $$;

-- Wali kelas/guru menutup absensi harian: semua murid yang belum tercatat menjadi alpa.
create or replace function public.close_daily_attendance(p_class uuid, p_date date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_count int;
begin
  select school_id into v_school from classes where id = p_class;
  if not (public.teaches_class(p_class) or public.has_role(v_school, array['school_admin']::app_role[])) then
    raise exception 'Tidak berwenang';
  end if;
  with ins as (
    insert into student_attendance (school_id, student_id, class_id, date, status, method, recorded_by)
    select v_school, e.student_id, p_class, p_date, 'alpa', 'manual', auth.uid()
    from enrollments e join students s on s.id = e.student_id and s.status = 'aktif'
    where e.class_id = p_class
    on conflict (student_id, date, teaching_assignment_id) do nothing
    returning student_id
  ), notif as (
    -- Beri tahu orang tua murid yang alpa.
    insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
    select g.guardian_id, v_school, 'attendance.absent', 'Anak Anda tercatat tidak hadir',
           s.full_name || ' tercatat alpa pada ' || to_char(p_date, 'DD-MM-YYYY') || '.', 'students', s.id
    from ins join students s on s.id = ins.student_id
    join guardian_links g on g.student_id = s.id
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;

-- Rekap kehadiran per murid dalam rentang tanggal.
create or replace function public.attendance_summary(p_class uuid, p_from date, p_to date)
returns table (student_id uuid, full_name text, hadir int, terlambat int, izin int, sakit int, alpa int)
language sql stable security invoker as $$
  select s.id, s.full_name,
    count(*) filter (where a.status = 'hadir')::int,
    count(*) filter (where a.status = 'terlambat')::int,
    count(*) filter (where a.status = 'izin')::int,
    count(*) filter (where a.status = 'sakit')::int,
    count(*) filter (where a.status = 'alpa')::int
  from public.enrollments e
  join public.students s on s.id = e.student_id
  left join public.student_attendance a on a.student_id = s.id and a.class_id = e.class_id
       and a.teaching_assignment_id is null and a.date between p_from and p_to
  where e.class_id = p_class
  group by s.id, s.full_name, e.roll_number
  order by e.roll_number nulls last, s.full_name
$$;

-- ---------------------------------------------------------------------
-- Absensi guru & pegawai
-- ---------------------------------------------------------------------
create table public.staff_attendance (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  date          date not null,
  status        public.staff_attendance_status not null,
  check_in_at   timestamptz,
  check_out_at  timestamptz,
  check_in_lat  float8,
  check_in_lng  float8,
  selfie_path   text,
  note          text,
  unique (school_id, user_id, date)
);
create index on public.staff_attendance (school_id, date);

alter table public.staff_attendance enable row level security;
create policy staff_att_read on public.staff_attendance for select
  using (user_id = auth.uid() or public.has_role(school_id, array['school_admin','principal','finance']::public.app_role[])
         or public.is_foundation_admin_of_school(school_id));
create policy staff_att_admin on public.staff_attendance for all
  using (public.has_role(school_id, array['school_admin','principal']::public.app_role[]))
  with check (public.has_role(school_id, array['school_admin','principal']::public.app_role[]));

create or replace function public.staff_check_in(p_school uuid, p_lat float8 default null, p_lng float8 default null, p_selfie_path text default null)
returns public.staff_attendance language plpgsql security definer set search_path = public as $$
declare v_row staff_attendance;
begin
  if not public.has_role(p_school, array['school_admin','principal','teacher','counselor','finance']::app_role[]) then
    raise exception 'Anda bukan pegawai sekolah ini';
  end if;
  if not public.within_geofence(p_school, p_lat, p_lng) then
    raise exception 'Anda berada di luar area sekolah';
  end if;
  insert into staff_attendance (school_id, user_id, date, status, check_in_at, check_in_lat, check_in_lng, selfie_path)
  values (p_school, auth.uid(), public.school_today(p_school),
          case when public.is_late_now(p_school) then 'terlambat' else 'hadir' end::staff_attendance_status,
          now(), p_lat, p_lng, p_selfie_path)
  on conflict (school_id, user_id, date) do update
     set check_in_at = coalesce(staff_attendance.check_in_at, excluded.check_in_at)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.staff_check_out(p_school uuid)
returns public.staff_attendance language plpgsql security definer set search_path = public as $$
declare v_row staff_attendance;
begin
  update staff_attendance set check_out_at = now()
   where school_id = p_school and user_id = auth.uid() and date = public.school_today(p_school)
     and check_in_at is not null
  returning * into v_row;
  if v_row.id is null then raise exception 'Anda belum absen masuk hari ini'; end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- Izin murid (diajukan orang tua / murid, diputuskan wali kelas)
-- ---------------------------------------------------------------------
create table public.student_leave_requests (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  requested_by     uuid not null default auth.uid() references public.profiles(id),
  kind             text not null check (kind in ('sakit', 'izin')),
  starts_on        date not null,
  ends_on          date not null,
  reason           text not null check (length(reason) between 3 and 2000),
  attachment_path  text,                         -- surat (PDF/foto) di bucket "leave-letters"
  status           public.request_status not null default 'pending',
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  review_note      text,
  created_at       timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (ends_on - starts_on <= 30)
);
create index on public.student_leave_requests (school_id, status);
create index on public.student_leave_requests (student_id);

create trigger slr_same_school before insert or update on public.student_leave_requests
  for each row execute function public.assert_same_school('students', 'student_id');

alter table public.student_leave_requests enable row level security;
create policy slr_read on public.student_leave_requests for select using (public.can_view_student(student_id));
create policy slr_insert on public.student_leave_requests for insert
  with check (requested_by = auth.uid() and status = 'pending'
              and (public.is_guardian_of(student_id) or public.is_student_self(student_id)));
-- Perubahan status hanya lewat review_student_leave / cancel_student_leave.

create or replace function public.notify_leave_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_homeroom uuid; v_name text;
begin
  select c.homeroom_teacher_id into v_homeroom from classes c where c.id = public.current_class_of(new.student_id);
  select full_name into v_name from students where id = new.student_id;
  perform public.notify(v_homeroom, new.school_id, 'leave.submitted', 'Pengajuan ' || new.kind || ': ' || v_name,
    to_char(new.starts_on, 'DD-MM-YYYY') || ' s.d. ' || to_char(new.ends_on, 'DD-MM-YYYY') || ' · ' || left(new.reason, 100),
    'student_leave_requests', new.id);
  return new;
end $$;
create trigger slr_notify after insert on public.student_leave_requests
  for each row execute function public.notify_leave_submitted();

create or replace function public.review_student_leave(p_id uuid, p_approve boolean, p_note text default null)
returns public.student_leave_requests language plpgsql security definer set search_path = public as $$
declare r student_leave_requests; v_class uuid; v_name text; v_days int; v_escalate int;
begin
  select * into r from student_leave_requests where id = p_id for update;
  if r.id is null then raise exception 'Pengajuan tidak ditemukan'; end if;
  if not (public.is_homeroom_of_student(r.student_id)
          or public.has_role(r.school_id, array['school_admin','principal']::app_role[])) then
    raise exception 'Hanya wali kelas yang dapat memutuskan izin ini';
  end if;
  if r.status <> 'pending' then raise exception 'Pengajuan sudah diproses'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Alasan penolakan wajib diisi';
  end if;

  update student_leave_requests
     set status = case when p_approve then 'approved' else 'rejected' end::request_status,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where id = p_id returning * into r;

  select full_name into v_name from students where id = r.student_id;

  if p_approve then
    v_class := public.current_class_of(r.student_id);
    -- Tandai absensi harian (kecuali hari Minggu) sebagai izin/sakit.
    insert into student_attendance (school_id, student_id, class_id, date, status, method, leave_request_id, recorded_by, note)
    select r.school_id, r.student_id, v_class, d::date, r.kind::attendance_status, 'leave', r.id, auth.uid(), left(r.reason, 200)
    from generate_series(r.starts_on, r.ends_on, interval '1 day') d
    where extract(isodow from d) <> 7
    on conflict (student_id, date, teaching_assignment_id) do update
      set status = excluded.status, method = 'leave', leave_request_id = excluded.leave_request_id, note = excluded.note;

    -- Izin panjang diteruskan ke Guru BK.
    v_days := r.ends_on - r.starts_on + 1;
    select coalesce((settings->>'student_leave_escalate_days')::int, 3) into v_escalate from schools where id = r.school_id;
    if v_days > v_escalate then
      insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
      select m.user_id, r.school_id, 'leave.escalated', 'Izin panjang: ' || v_name,
             v_days || ' hari (' || r.kind || '). Mohon ditindaklanjuti.', 'student_leave_requests', r.id
      from memberships m where m.school_id = r.school_id and m.role = 'counselor' and m.is_active;
    end if;
  end if;

  perform public.notify(r.requested_by, r.school_id, 'leave.reviewed',
    'Izin ' || v_name || (case when p_approve then ' disetujui' else ' ditolak' end),
    coalesce(p_note, ''), 'student_leave_requests', r.id);
  return r;
end $$;

create or replace function public.cancel_student_leave(p_id uuid)
returns public.student_leave_requests language plpgsql security definer set search_path = public as $$
declare r student_leave_requests;
begin
  update student_leave_requests set status = 'cancelled'
   where id = p_id and requested_by = auth.uid() and status = 'pending'
  returning * into r;
  if r.id is null then raise exception 'Pengajuan tidak dapat dibatalkan'; end if;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Cuti guru & pegawai (diputuskan kepala sekolah)
-- ---------------------------------------------------------------------
create table public.staff_leave_requests (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools(id) on delete cascade,
  user_id           uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind              text not null check (kind in ('tahunan', 'sakit', 'melahirkan', 'alasan_penting', 'dinas')),
  starts_on         date not null,
  ends_on           date not null,
  reason            text not null check (length(reason) between 3 and 2000),
  attachment_path   text,
  substitute_id     uuid references public.profiles(id),   -- guru pengganti
  status            public.request_status not null default 'pending',
  reviewed_by       uuid references public.profiles(id),
  reviewed_at       timestamptz,
  review_note       text,
  created_at        timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on public.staff_leave_requests (school_id, status);

alter table public.staff_leave_requests enable row level security;
create policy stlr_read on public.staff_leave_requests for select
  using (user_id = auth.uid() or substitute_id = auth.uid()
         or public.has_role(school_id, array['school_admin','principal','finance']::public.app_role[])
         or public.is_foundation_admin_of_school(school_id));
create policy stlr_insert on public.staff_leave_requests for insert
  with check (user_id = auth.uid() and status = 'pending'
              and public.has_role(school_id, array['teacher','counselor','finance','school_admin']::public.app_role[]));

-- Hari kerja (Senin–Sabtu) dalam rentang.
create or replace function public.workdays_between(p_from date, p_to date)
returns int language sql immutable as $$
  select count(*)::int from generate_series(p_from, p_to, interval '1 day') d where extract(isodow from d) <> 7
$$;

-- Sisa cuti tahunan.
create or replace function public.staff_leave_balance(p_school uuid, p_user uuid default auth.uid(), p_year int default extract(year from now())::int)
returns table (quota int, used int, remaining int)
language sql stable security definer set search_path = public as $$
  with q as (select coalesce((settings->>'annual_leave_days')::int, 12) as quota from schools where id = p_school),
       u as (select coalesce(sum(public.workdays_between(starts_on, ends_on)), 0)::int as used
             from staff_leave_requests
             where school_id = p_school and user_id = p_user and kind = 'tahunan'
               and status = 'approved' and extract(year from starts_on) = p_year)
  select q.quota, u.used, q.quota - u.used from q, u
  where p_user = auth.uid() or public.has_role(p_school, array['school_admin','principal','finance']::public.app_role[])
$$;

create or replace function public.notify_staff_leave_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select full_name into v_name from profiles where id = new.user_id;
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select m.user_id, new.school_id, 'staff_leave.submitted', 'Pengajuan cuti: ' || v_name,
         new.kind || ' · ' || to_char(new.starts_on, 'DD-MM-YYYY') || ' s.d. ' || to_char(new.ends_on, 'DD-MM-YYYY'),
         'staff_leave_requests', new.id
  from memberships m where m.school_id = new.school_id and m.role = 'principal' and m.is_active;
  return new;
end $$;
create trigger stlr_notify after insert on public.staff_leave_requests
  for each row execute function public.notify_staff_leave_submitted();

create or replace function public.review_staff_leave(p_id uuid, p_approve boolean, p_note text default null)
returns public.staff_leave_requests language plpgsql security definer set search_path = public as $$
declare r staff_leave_requests; v_remaining int;
begin
  select * into r from staff_leave_requests where id = p_id for update;
  if r.id is null then raise exception 'Pengajuan tidak ditemukan'; end if;
  if not public.has_role(r.school_id, array['principal']::app_role[]) then
    raise exception 'Hanya kepala sekolah yang dapat memutuskan cuti';
  end if;
  if r.user_id = auth.uid() then raise exception 'Tidak dapat menyetujui cuti sendiri'; end if;
  if r.status <> 'pending' then raise exception 'Pengajuan sudah diproses'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Alasan penolakan wajib diisi';
  end if;
  if p_approve and r.kind = 'tahunan' then
    select remaining into v_remaining from public.staff_leave_balance(r.school_id, r.user_id, extract(year from r.starts_on)::int);
    if v_remaining < public.workdays_between(r.starts_on, r.ends_on) then
      raise exception 'Sisa cuti tahunan tidak mencukupi (sisa % hari)', v_remaining;
    end if;
  end if;

  update staff_leave_requests
     set status = case when p_approve then 'approved' else 'rejected' end::request_status,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where id = p_id returning * into r;

  if p_approve then
    insert into staff_attendance (school_id, user_id, date, status, note)
    select r.school_id, r.user_id, d::date,
           case r.kind when 'sakit' then 'sakit' when 'dinas' then 'dinas' else 'cuti' end::staff_attendance_status,
           'Cuti disetujui'
    from generate_series(r.starts_on, r.ends_on, interval '1 day') d
    where extract(isodow from d) <> 7
    on conflict (school_id, user_id, date) do update set status = excluded.status, note = excluded.note;

    perform public.notify(r.substitute_id, r.school_id, 'staff_leave.substitute',
      'Anda ditunjuk sebagai guru pengganti',
      to_char(r.starts_on, 'DD-MM-YYYY') || ' s.d. ' || to_char(r.ends_on, 'DD-MM-YYYY'), 'staff_leave_requests', r.id);
  end if;

  perform public.notify(r.user_id, r.school_id, 'staff_leave.reviewed',
    'Cuti Anda ' || case when p_approve then 'disetujui' else 'ditolak' end, coalesce(p_note, ''),
    'staff_leave_requests', r.id);
  return r;
end $$;

create or replace function public.cancel_staff_leave(p_id uuid)
returns public.staff_leave_requests language plpgsql security definer set search_path = public as $$
declare r staff_leave_requests;
begin
  update staff_leave_requests set status = 'cancelled'
   where id = p_id and user_id = auth.uid() and status = 'pending'
  returning * into r;
  if r.id is null then raise exception 'Pengajuan tidak dapat dibatalkan'; end if;
  return r;
end $$;

create trigger audit_student_leave after update on public.student_leave_requests
  for each row execute function public.audit_row();
create trigger audit_staff_leave after update on public.staff_leave_requests
  for each row execute function public.audit_row();
