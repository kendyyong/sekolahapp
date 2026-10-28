-- =====================================================================
-- SekolahApp · 0007 · Arahan kepala sekolah, BK, dasbor, penyimpanan berkas
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tugas / arahan kepala sekolah kepada guru & pegawai
-- ---------------------------------------------------------------------
create table public.directives (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  title       text not null,
  body        text not null,
  due_on      date,
  attachments jsonb not null default '[]'::jsonb,
  created_by  uuid not null default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table public.directive_recipients (
  directive_id uuid not null references public.directives(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  status       text not null default 'baru' check (status in ('baru', 'dikerjakan', 'selesai')),
  report       text,
  report_attachments jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (directive_id, user_id)
);

alter table public.directives           enable row level security;
alter table public.directive_recipients enable row level security;

create or replace function public.is_directive_recipient(p_directive uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from directive_recipients where directive_id = p_directive and user_id = auth.uid())
$$;

create policy directives_read on public.directives for select
  using (public.has_role(school_id, array['principal','school_admin']::public.app_role[])
         or public.is_foundation_admin_of_school(school_id) or public.is_directive_recipient(id));
create policy directives_write on public.directives for all
  using (public.has_role(school_id, array['principal']::public.app_role[]))
  with check (public.has_role(school_id, array['principal']::public.app_role[]) and created_by = auth.uid());

create policy dr_read on public.directive_recipients for select
  using (user_id = auth.uid() or public.has_role(school_id, array['principal','school_admin']::public.app_role[]));
create policy dr_principal on public.directive_recipients for all
  using (public.has_role(school_id, array['principal']::public.app_role[]))
  with check (public.has_role(school_id, array['principal']::public.app_role[])
              and public.is_staff(school_id) and exists (
                select 1 from public.memberships m where m.school_id = directive_recipients.school_id
                and m.user_id = directive_recipients.user_id and m.role in ('teacher','counselor','finance','school_admin')));

-- Penerima melaporkan progres.
create or replace function public.report_directive(p_directive uuid, p_status text, p_report text default null, p_attachments jsonb default null)
returns public.directive_recipients language plpgsql security definer set search_path = public as $$
declare r directive_recipients; d directives; v_name text;
begin
  update directive_recipients
     set status = p_status, report = coalesce(p_report, report),
         report_attachments = coalesce(p_attachments, report_attachments), updated_at = now()
   where directive_id = p_directive and user_id = auth.uid()
  returning * into r;
  if r.directive_id is null then raise exception 'Arahan tidak ditemukan'; end if;
  select * into d from directives where id = p_directive;
  select full_name into v_name from profiles where id = auth.uid();
  perform public.notify(d.created_by, d.school_id, 'directive.report', v_name || ': ' || d.title, 'Status: ' || p_status,
    'directives', d.id);
  return r;
end $$;

create or replace function public.notify_directive_recipient()
returns trigger language plpgsql security definer set search_path = public as $$
declare d directives;
begin
  select * into d from directives where id = new.directive_id;
  perform public.notify(new.user_id, new.school_id, 'directive.new', 'Arahan Kepala Sekolah: ' || d.title,
    coalesce('Tenggat ' || to_char(d.due_on, 'DD-MM-YYYY'), left(d.body, 140)), 'directives', d.id);
  return new;
end $$;
create trigger dr_notify after insert on public.directive_recipients
  for each row execute function public.notify_directive_recipient();

-- ---------------------------------------------------------------------
-- BK: poin perilaku & catatan konseling (rahasia)
-- ---------------------------------------------------------------------
create table public.behavior_records (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  kind        text not null check (kind in ('pelanggaran', 'prestasi')),
  points      int not null check (points > 0),
  description text not null,
  occurred_on date not null default current_date,
  recorded_by uuid not null default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now()
);
create trigger behavior_same_school before insert or update on public.behavior_records
  for each row execute function public.assert_same_school('students', 'student_id');

alter table public.behavior_records enable row level security;
create policy behavior_read on public.behavior_records for select using (public.can_view_student(student_id));
create policy behavior_insert on public.behavior_records for insert
  with check (recorded_by = auth.uid() and (
    public.has_role(school_id, array['counselor','principal']::public.app_role[])
    or exists (select 1 from public.enrollments e where e.student_id = behavior_records.student_id and public.teaches_class(e.class_id))));
create policy behavior_modify on public.behavior_records for update
  using (recorded_by = auth.uid() or public.has_role(school_id, array['counselor']::public.app_role[]))
  with check (recorded_by = auth.uid() or public.has_role(school_id, array['counselor']::public.app_role[]));

create table public.counseling_notes (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  session_on  date not null default current_date,
  topic       text not null,
  notes       text not null,
  follow_up   text,
  counselor_id uuid not null default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now()
);
create trigger counseling_same_school before insert or update on public.counseling_notes
  for each row execute function public.assert_same_school('students', 'student_id');
alter table public.counseling_notes enable row level security;
create policy counseling_read on public.counseling_notes for select
  using (public.has_role(school_id, array['counselor','principal']::public.app_role[]));
create policy counseling_write on public.counseling_notes for all
  using (public.has_role(school_id, array['counselor']::public.app_role[]))
  with check (public.has_role(school_id, array['counselor']::public.app_role[]) and counselor_id = auth.uid());

-- ---------------------------------------------------------------------
-- Dasbor kepala sekolah (angka hari ini)
-- ---------------------------------------------------------------------
create or replace function public.principal_dashboard(p_school uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date := public.school_today(p_school); v jsonb;
begin
  if not (public.has_role(p_school, array['principal','school_admin']::app_role[])
          or public.is_foundation_admin_of_school(p_school) or public.is_platform_admin()) then
    raise exception 'Tidak berwenang';
  end if;
  select jsonb_build_object(
    'date', v_today,
    'students_active', (select count(*) from students where school_id = p_school and status = 'aktif'),
    'student_attendance', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) n from student_attendance
        where school_id = p_school and date = v_today and teaching_assignment_id is null group by status) x),
    'staff_total', (select count(distinct user_id) from memberships
        where school_id = p_school and is_active and role in ('teacher','counselor','finance','school_admin')),
    'staff_attendance', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) n from staff_attendance where school_id = p_school and date = v_today group by status) x),
    'pending_staff_leave', (select count(*) from staff_leave_requests where school_id = p_school and status = 'pending'),
    'pending_student_leave', (select count(*) from student_leave_requests where school_id = p_school and status = 'pending'),
    'pending_groups', (select count(*) from work_groups where school_id = p_school and status = 'pending'),
    'arrears_amount', (select coalesce(sum(total - paid_amount), 0) from invoices
        where school_id = p_school and status in ('unpaid','partial') and due_on < v_today),
    'arrears_students', (select count(distinct student_id) from invoices
        where school_id = p_school and status in ('unpaid','partial') and due_on < v_today),
    'collected_this_month', (select coalesce(sum(amount), 0) from payments
        where school_id = p_school and status = 'paid' and paid_at >= date_trunc('month', v_today)),
    'assignments_due_week', (select count(*) from assignments
        where school_id = p_school and due_at between now() and now() + interval '7 days')
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Penyimpanan berkas (Supabase Storage)
-- Konvensi path: <bucket>/<school_id>/<entitas>/<nama berkas>
-- ---------------------------------------------------------------------
create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin return p::uuid; exception when others then return null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('school-assets', 'school-assets', true,  2097152,  array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('leave-letters', 'leave-letters', false, 5242880,  array['application/pdf','image/png','image/jpeg']),
  ('assignments',   'assignments',   false, 20971520, null),
  ('submissions',   'submissions',   false, 20971520, null),
  ('staff-files',   'staff-files',   false, 5242880,  array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

-- school-assets/<school_id>/logo.png — publik dibaca, ditulis admin sekolah
create policy "assets write" on storage.objects for insert to authenticated
  with check (bucket_id = 'school-assets'
              and public.has_role(public.try_uuid((storage.foldername(name))[1]), array['school_admin']::public.app_role[]));

-- leave-letters/<school_id>/<student_id>/<file>
create policy "leave letters upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-letters'
              and (public.is_guardian_of(public.try_uuid((storage.foldername(name))[2]))
                   or public.is_student_self(public.try_uuid((storage.foldername(name))[2]))));
create policy "leave letters read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-letters' and public.can_view_student(public.try_uuid((storage.foldername(name))[2])));

-- assignments/<school_id>/<teaching_assignment_id>/<file>
create policy "assignment files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'assignments' and public.is_teacher_of_ta(public.try_uuid((storage.foldername(name))[2])));
create policy "assignment files read" on storage.objects for select to authenticated
  using (bucket_id = 'assignments'
         and public.can_view_class(public.class_of_ta(public.try_uuid((storage.foldername(name))[2]))));

-- submissions/<school_id>/<assignment_id>/<student_id>/<file>
create or replace function public.can_view_submission_folder(p_assignment uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_student_self(p_student) or public.is_guardian_of(p_student)
      or exists (select 1 from assignments a where a.id = p_assignment and public.is_teacher_of_ta(a.teaching_assignment_id))
$$;
create policy "submission files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and public.is_student_self(public.try_uuid((storage.foldername(name))[3])));
create policy "submission files read" on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and public.can_view_submission_folder(
           public.try_uuid((storage.foldername(name))[2]), public.try_uuid((storage.foldername(name))[3])));

-- staff-files/<school_id>/<user_id>/<file> (selfie absensi, surat cuti)
create policy "staff files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-files' and (storage.foldername(name))[2] = auth.uid()::text
              and public.is_staff(public.try_uuid((storage.foldername(name))[1])));
create policy "staff files read" on storage.objects for select to authenticated
  using (bucket_id = 'staff-files' and ((storage.foldername(name))[2] = auth.uid()::text
         or public.has_role(public.try_uuid((storage.foldername(name))[1]), array['principal','school_admin']::public.app_role[])));
