-- =====================================================================
-- SekolahApp · 0025 · Kalender pendidikan
-- Admin sekolah & kepala sekolah mengisi agenda: hari libur, ujian,
-- pembagian rapor, kegiatan, awal/akhir semester. Guru, murid, dan orang
-- tua melihatnya sesuai sasaran dan mendapat notifikasi (saat dibuat,
-- diubah, dibatalkan, dan H-1). Pada hari libur absensi murid tidak
-- dicatat: tutup absensi tidak menandai alpa, izin melewati hari libur.
-- Modul inti, tersedia di semua paket.
-- =====================================================================

create table public.calendar_events (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  title          text not null check (length(trim(title)) between 1 and 120),
  description    text,
  kind           text not null default 'kegiatan'
                 check (kind in ('libur', 'ujian', 'rapor', 'kegiatan', 'akademik', 'lainnya')),
  starts_on      date not null,
  ends_on        date not null,
  -- 'students' = murid & orang tua; pengumuman per kelas tidak dipakai di kalender.
  audience       public.audience not null default 'all' check (audience in ('all', 'staff', 'students')),
  notify_members boolean not null default true,
  created_by     uuid not null default auth.uid() references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 366)
);
create index on public.calendar_events (school_id, starts_on);
create index on public.calendar_events (school_id, ends_on);

create trigger calendar_events_touch before update on public.calendar_events
  for each row execute function public.touch_updated_at();

create or replace function public.can_read_calendar_event(e public.calendar_events)
returns boolean language sql stable security definer set search_path = public as $$
  select case e.audience
    when 'all'      then public.is_member(e.school_id) or public.is_school_manager(e.school_id)
    when 'staff'    then public.is_staff(e.school_id)
    when 'students' then public.is_staff(e.school_id)
                      or public.has_role(e.school_id, array['student', 'guardian']::public.app_role[])
    else false
  end
$$;

alter table public.calendar_events enable row level security;
create policy calendar_read on public.calendar_events for select using (public.can_read_calendar_event(calendar_events));
create policy calendar_write on public.calendar_events for all
  using (public.has_role(school_id, array['school_admin', 'principal']::public.app_role[]))
  with check (public.has_role(school_id, array['school_admin', 'principal']::public.app_role[]));

-- ---------------------------------------------------------------------
-- Hari libur & absensi
-- ---------------------------------------------------------------------
-- Judul libur yang berlaku untuk murid pada tanggal itu (null bila hari sekolah biasa).
create or replace function public.holiday_on(p_school uuid, p_date date)
returns text language sql stable security definer set search_path = public as $$
  select string_agg(title, ', ' order by starts_on, title)
    from calendar_events
   where school_id = p_school and kind = 'libur' and audience <> 'staff'
     and p_date between starts_on and ends_on
$$;
revoke execute on function public.holiday_on(uuid, date) from public, anon, authenticated;

-- Untuk aplikasi: hanya warga sekolah yang bisa menanyakan.
create or replace function public.school_holiday(p_school uuid, p_date date default null)
returns text language sql stable security definer set search_path = public as $$
  select public.holiday_on(p_school, coalesce(p_date, public.school_today(p_school)))
   where public.is_member(p_school) or public.is_school_manager(p_school)
$$;

-- Absensi murid pada hari libur ditolak. Baris dari izin yang disetujui
-- dilewati diam-diam agar izin panjang yang melewati hari libur tetap bisa disetujui.
create or replace function public.guard_attendance_holiday()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text := public.holiday_on(new.school_id, new.date);
begin
  if v_title is null then return new; end if;
  if new.method = 'leave' then return null; end if;
  raise exception 'Tanggal % adalah hari libur (%). Absensi tidak dicatat.', to_char(new.date, 'DD-MM-YYYY'), v_title;
end $$;
create trigger student_attendance_holiday before insert on public.student_attendance
  for each row execute function public.guard_attendance_holiday();

-- ---------------------------------------------------------------------
-- Notifikasi
-- ---------------------------------------------------------------------
create or replace function public.calendar_kind_label(p_kind text)
returns text language sql immutable as $$
  select case p_kind
    when 'libur' then 'Hari libur'
    when 'ujian' then 'Ujian'
    when 'rapor' then 'Pembagian rapor'
    when 'kegiatan' then 'Kegiatan sekolah'
    when 'akademik' then 'Agenda akademik'
    else 'Agenda' end
$$;

create or replace function public.calendar_date_range(p_from date, p_to date)
returns text language sql immutable as $$
  select case when p_from = p_to then to_char(p_from, 'DD-MM-YYYY')
              else to_char(p_from, 'DD-MM-YYYY') || ' s.d. ' || to_char(p_to, 'DD-MM-YYYY') end
$$;

-- Penerima agenda sesuai sasaran (pengguna aktif sekolah).
create or replace function public.calendar_recipients(p_school uuid, p_audience public.audience)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct m.user_id from memberships m
   where m.school_id = p_school and m.is_active and (
     p_audience = 'all'
     or (p_audience = 'staff'    and m.role in ('school_admin', 'principal', 'teacher', 'counselor', 'finance'))
     or (p_audience = 'students' and m.role in ('student', 'guardian')))
$$;
revoke execute on function public.calendar_recipients(uuid, public.audience) from public, anon, authenticated;

create or replace function public.calendar_fanout(e public.calendar_events, p_kind text, p_title text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select r, e.school_id, p_kind, p_title,
         public.calendar_kind_label(e.kind) || ' · ' || public.calendar_date_range(e.starts_on, e.ends_on),
         'calendar_events', e.id
    from public.calendar_recipients(e.school_id, e.audience) r
   where r <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
$$;
revoke execute on function public.calendar_fanout(public.calendar_events, text, text) from public, anon, authenticated;

-- Agenda yang sudah lewat tidak perlu diberitahukan.
create or replace function public.notify_calendar_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.notify_members and old.ends_on >= public.school_today(old.school_id) then
      perform public.calendar_fanout(old, 'calendar.cancelled', 'Dibatalkan: ' || old.title);
    end if;
    return old;
  end if;
  if not new.notify_members or new.ends_on < public.school_today(new.school_id) then return new; end if;
  if tg_op = 'INSERT' then
    perform public.calendar_fanout(new, 'calendar.new', 'Kalender sekolah: ' || new.title);
  elsif (new.title, new.starts_on, new.ends_on, new.kind) is distinct from (old.title, old.starts_on, old.ends_on, old.kind) then
    perform public.calendar_fanout(new, 'calendar.changed', 'Jadwal diubah: ' || new.title);
  end if;
  return new;
end $$;
create trigger calendar_events_notify after insert or update or delete on public.calendar_events
  for each row execute function public.notify_calendar_event();

-- Pengingat H-1, dipanggil tugas harian (Edge Function monthly-jobs).
-- Aman dijalankan ulang: tiap pengguna hanya sekali diingatkan per agenda.
create or replace function public.calendar_send_reminders(p_school uuid, p_date date default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_today date := coalesce(p_date, public.school_today(p_school)); v_count int;
begin
  with ins as (
    insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
    select r, e.school_id, 'calendar.reminder', 'Besok: ' || e.title,
           public.calendar_kind_label(e.kind) || ' · ' || public.calendar_date_range(e.starts_on, e.ends_on),
           'calendar_events', e.id
      from calendar_events e
     cross join lateral public.calendar_recipients(e.school_id, e.audience) r
     where e.school_id = p_school and e.notify_members and e.starts_on = v_today + 1
       and not exists (select 1 from notifications n
                        where n.user_id = r and n.ref_id = e.id and n.kind = 'calendar.reminder')
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;
revoke execute on function public.calendar_send_reminders(uuid, date) from public, anon, authenticated;
grant execute on function public.calendar_send_reminders(uuid, date) to service_role;

-- Notifikasi kalender ikut kategori WhatsApp "pengumuman".
create or replace function public.wa_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind like 'attendance.%' then 'kehadiran'
    when p_kind in ('invoice.new', 'payment.paid') or p_kind like 'canteen.%' then 'tagihan'
    when p_kind like 'leave.%' then 'izin'
    when p_kind = 'announcement' or p_kind like 'calendar.%' then 'pengumuman'
    when p_kind = 'message' then 'pesan'
    when p_kind in ('assignment.new', 'submission.graded', 'report.published', 'exam.scheduled', 'exam.reset', 'online_session.new') then 'akademik'
    when p_kind like 'ppdb.%' then 'ppdb'
    when p_kind like 'staff_leave.%' or p_kind like 'directive.%' or p_kind like 'payroll.%' then 'kepegawaian'
    else null end
$$;
