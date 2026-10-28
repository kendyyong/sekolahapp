-- =====================================================================
-- SekolahApp · 0005 · Tugas & PR, pengumpulan, kelas online, kelompok kerja
-- =====================================================================

create type public.assignment_kind as enum ('tugas', 'pr', 'kuis', 'proyek');

create or replace function public.class_of_ta(p_ta uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from teaching_assignments where id = p_ta
$$;

create or replace function public.is_teacher_of_ta(p_ta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from teaching_assignments where id = p_ta and teacher_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- Tugas / PR
-- ---------------------------------------------------------------------
create table public.assignments (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  teaching_assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  kind                   public.assignment_kind not null default 'tugas',
  title                  text not null,
  description            text,
  is_group               boolean not null default false,
  due_at                 timestamptz,
  max_score              numeric(5,2) not null default 100 check (max_score > 0),
  meeting_url            text,
  attachments            jsonb not null default '[]'::jsonb,   -- [{path,name,size}] di bucket "assignments"
  created_by             uuid not null default auth.uid() references public.profiles(id),
  created_at             timestamptz not null default now()
);
create index on public.assignments (teaching_assignment_id, due_at);

create trigger assignments_same_school before insert or update on public.assignments
  for each row execute function public.assert_same_school('teaching_assignments', 'teaching_assignment_id');

alter table public.assignments enable row level security;
create policy assignments_read on public.assignments for select
  using (public.can_view_class(public.class_of_ta(teaching_assignment_id)));
create policy assignments_write on public.assignments for all
  using (public.is_teacher_of_ta(teaching_assignment_id))
  with check (public.is_teacher_of_ta(teaching_assignment_id) and created_by = auth.uid());

create or replace function public.notify_new_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_subject text;
begin
  select sb.name into v_subject from teaching_assignments ta join subjects sb on sb.id = ta.subject_id
   where ta.id = new.teaching_assignment_id;
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select s.user_id, new.school_id, 'assignment.new', v_subject || ': ' || new.title,
         case when new.due_at is null then 'Tugas baru'
              else 'Tenggat ' || to_char(new.due_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') end,
         'assignments', new.id
  from enrollments e join students s on s.id = e.student_id
  where e.class_id = public.class_of_ta(new.teaching_assignment_id) and s.user_id is not null;
  return new;
end $$;
create trigger assignments_notify after insert on public.assignments
  for each row execute function public.notify_new_assignment();

-- ---------------------------------------------------------------------
-- Kelas online terjadwal (Zoom / Google Meet)
-- ---------------------------------------------------------------------
create table public.online_sessions (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  teaching_assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  title                  text not null,
  starts_at              timestamptz not null,
  duration_minutes       int not null default 60 check (duration_minutes between 5 and 600),
  url                    text not null check (url ~* '^https://'),
  passcode               text,
  created_by             uuid not null default auth.uid() references public.profiles(id),
  created_at             timestamptz not null default now()
);
create trigger online_sessions_same_school before insert or update on public.online_sessions
  for each row execute function public.assert_same_school('teaching_assignments', 'teaching_assignment_id');

alter table public.online_sessions enable row level security;
create policy online_sessions_read on public.online_sessions for select
  using (public.can_view_class(public.class_of_ta(teaching_assignment_id)));
create policy online_sessions_write on public.online_sessions for all
  using (public.is_teacher_of_ta(teaching_assignment_id))
  with check (public.is_teacher_of_ta(teaching_assignment_id));

create or replace function public.notify_online_session()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select s.user_id, new.school_id, 'online_session.new', 'Kelas online: ' || new.title,
         to_char(new.starts_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI'), 'online_sessions', new.id
  from enrollments e join students s on s.id = e.student_id
  where e.class_id = public.class_of_ta(new.teaching_assignment_id) and s.user_id is not null;
  return new;
end $$;
create trigger online_sessions_notify after insert on public.online_sessions
  for each row execute function public.notify_online_session();

-- ---------------------------------------------------------------------
-- Kelompok kerja (Ketua, Sekretaris, Bendahara, Anggota) + verifikasi guru
-- ---------------------------------------------------------------------
create type public.group_status   as enum ('draft', 'pending', 'revision', 'verified', 'rejected');
create type public.group_position as enum ('ketua', 'sekretaris', 'bendahara', 'anggota');
create type public.invite_status  as enum ('invited', 'accepted', 'declined');

create table public.work_groups (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  class_id               uuid not null references public.classes(id) on delete cascade,
  teaching_assignment_id uuid references public.teaching_assignments(id) on delete cascade,  -- mapel (opsional)
  assignment_id          uuid references public.assignments(id) on delete cascade,           -- tugas (opsional)
  name                   text not null check (length(name) between 2 and 80),
  created_by             uuid not null references public.profiles(id),
  status                 public.group_status not null default 'draft',
  submitted_at           timestamptz,
  reviewed_by            uuid references public.profiles(id),
  reviewed_at            timestamptz,
  review_note            text,
  created_at             timestamptz not null default now()
);
create index on public.work_groups (class_id, status);

create table public.work_group_members (
  group_id      uuid not null references public.work_groups(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  school_id     uuid not null references public.schools(id) on delete cascade,
  position      public.group_position not null default 'anggota',
  invite_status public.invite_status not null default 'invited',
  joined_at     timestamptz,
  primary key (group_id, student_id)
);
-- Satu Ketua, satu Sekretaris, satu Bendahara per kelompok.
create unique index wgm_one_officer on public.work_group_members (group_id, position)
  where position <> 'anggota' and invite_status <> 'declined';

-- Siapa yang memeriksa kelompok: guru mapel (jika ada) atau wali kelas.
create or replace function public.can_review_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from work_groups g where g.id = p_group and (
      (g.teaching_assignment_id is not null and public.is_teacher_of_ta(g.teaching_assignment_id))
      or public.is_homeroom_of_class(g.class_id)
      or public.has_role(g.school_id, array['school_admin','principal']::public.app_role[])
    ))
$$;

create or replace function public.is_group_member(p_group uuid, p_accepted_only boolean default true)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from work_group_members m join students s on s.id = m.student_id
                 where m.group_id = p_group and s.user_id = auth.uid()
                   and (not p_accepted_only or m.invite_status = 'accepted'))
$$;

create or replace function public.my_group_position(p_group uuid)
returns public.group_position language sql stable security definer set search_path = public as $$
  select m.position from work_group_members m join students s on s.id = m.student_id
  where m.group_id = p_group and s.user_id = auth.uid() and m.invite_status = 'accepted'
$$;

create or replace function public.is_guardian_in_group(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from work_group_members m join guardian_links g on g.student_id = m.student_id
                 where m.group_id = p_group and g.guardian_id = auth.uid())
$$;

alter table public.work_groups        enable row level security;
alter table public.work_group_members enable row level security;

create policy wg_read on public.work_groups for select
  using (public.is_student_in_class(class_id) or public.teaches_class(class_id)
         or public.has_role(school_id, array['school_admin','principal','counselor']::public.app_role[])
         or public.is_guardian_in_group(id));
create policy wgm_read on public.work_group_members for select
  using (exists (select 1 from public.work_groups g where g.id = group_id));   -- mengikuti wg_read
-- Semua perubahan kelompok lewat fungsi di bawah.

create or replace function public.create_work_group(p_class uuid, p_name text, p_ta uuid default null, p_assignment uuid default null)
returns public.work_groups language plpgsql security definer set search_path = public as $$
declare v_student students; g work_groups;
begin
  select s.* into v_student from students s join enrollments e on e.student_id = s.id
   where e.class_id = p_class and s.user_id = auth.uid();
  if v_student.id is null then raise exception 'Hanya murid di kelas ini yang dapat membuat kelompok'; end if;
  if p_ta is not null and public.class_of_ta(p_ta) <> p_class then raise exception 'Mapel tidak sesuai kelas'; end if;
  if p_assignment is not null and not exists (
       select 1 from assignments a where a.id = p_assignment and public.class_of_ta(a.teaching_assignment_id) = p_class) then
    raise exception 'Tugas tidak sesuai kelas';
  end if;
  insert into work_groups (school_id, class_id, teaching_assignment_id, assignment_id, name, created_by)
  values (v_student.school_id, p_class,
          coalesce(p_ta, (select teaching_assignment_id from assignments where id = p_assignment)),
          p_assignment, p_name, auth.uid())
  returning * into g;
  insert into work_group_members (group_id, student_id, school_id, position, invite_status, joined_at)
  values (g.id, v_student.id, g.school_id, 'ketua', 'accepted', now());
  return g;
end $$;

create or replace function public.assert_group_editable_by_leader(p_group uuid)
returns public.work_groups language plpgsql security definer set search_path = public as $$
declare g work_groups;
begin
  select * into g from work_groups where id = p_group for update;
  if g.id is null then raise exception 'Kelompok tidak ditemukan'; end if;
  if public.my_group_position(p_group) is distinct from 'ketua' then raise exception 'Hanya Ketua yang dapat mengubah kelompok'; end if;
  if g.status not in ('draft', 'revision') then raise exception 'Kelompok sedang diperiksa atau sudah final'; end if;
  return g;
end $$;
revoke execute on function public.assert_group_editable_by_leader(uuid) from public, anon, authenticated;

create or replace function public.invite_group_member(p_group uuid, p_student uuid, p_position public.group_position default 'anggota')
returns void language plpgsql security definer set search_path = public as $$
declare g work_groups; v_user uuid;
begin
  g := public.assert_group_editable_by_leader(p_group);
  if p_position = 'ketua' then raise exception 'Kelompok sudah memiliki Ketua'; end if;
  if not exists (select 1 from enrollments where class_id = g.class_id and student_id = p_student) then
    raise exception 'Murid bukan anggota kelas ini';
  end if;
  insert into work_group_members (group_id, student_id, school_id, position)
  values (p_group, p_student, g.school_id, p_position)
  on conflict (group_id, student_id) do update set position = excluded.position, invite_status = 'invited', joined_at = null;
  select user_id into v_user from students where id = p_student;
  perform public.notify(v_user, g.school_id, 'group.invited', 'Undangan kelompok: ' || g.name,
    'Jabatan: ' || p_position, 'work_groups', g.id);
end $$;

create or replace function public.set_group_member_position(p_group uuid, p_student uuid, p_position public.group_position)
returns void language plpgsql security definer set search_path = public as $$
declare g work_groups;
begin
  g := public.assert_group_editable_by_leader(p_group);
  if p_position = 'ketua' then raise exception 'Jabatan Ketua tidak dapat dipindahkan di sini'; end if;
  update work_group_members set position = p_position
   where group_id = p_group and student_id = p_student and position <> 'ketua';
  if not found then raise exception 'Anggota tidak ditemukan'; end if;
end $$;

create or replace function public.remove_group_member(p_group uuid, p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g work_groups;
begin
  g := public.assert_group_editable_by_leader(p_group);
  delete from work_group_members where group_id = p_group and student_id = p_student and position <> 'ketua';
end $$;

create or replace function public.respond_group_invite(p_group uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update work_group_members m
     set invite_status = case when p_accept then 'accepted' else 'declined' end::invite_status,
         joined_at = case when p_accept then now() end
    from students s
   where m.group_id = p_group and m.student_id = s.id and s.user_id = auth.uid() and m.invite_status = 'invited';
  if not found then raise exception 'Undangan tidak ditemukan'; end if;
end $$;

-- Ketua mengirim kelompok ke guru untuk diverifikasi.
create or replace function public.submit_work_group(p_group uuid)
returns public.work_groups language plpgsql security definer set search_path = public as $$
declare g work_groups; v_missing text; v_teacher uuid;
begin
  g := public.assert_group_editable_by_leader(p_group);
  if exists (select 1 from work_group_members where group_id = p_group and invite_status = 'invited') then
    raise exception 'Masih ada undangan yang belum dijawab';
  end if;
  select string_agg(p::text, ', ') into v_missing
  from unnest(array['ketua','sekretaris','bendahara']::group_position[]) p
  where not exists (select 1 from work_group_members
                    where group_id = p_group and position = p and invite_status = 'accepted');
  if v_missing is not null then raise exception 'Jabatan belum terisi: %', v_missing; end if;

  update work_groups set status = 'pending', submitted_at = now() where id = p_group returning * into g;

  select coalesce((select teacher_id from teaching_assignments where id = g.teaching_assignment_id),
                  (select homeroom_teacher_id from classes where id = g.class_id))
    into v_teacher;
  perform public.notify(v_teacher, g.school_id, 'group.submitted', 'Kelompok menunggu verifikasi', g.name, 'work_groups', g.id);
  return g;
end $$;

create or replace function public.review_work_group(p_group uuid, p_decision public.group_status, p_note text default null)
returns public.work_groups language plpgsql security definer set search_path = public as $$
declare g work_groups;
begin
  if p_decision not in ('verified', 'revision', 'rejected') then raise exception 'Keputusan tidak valid'; end if;
  if not public.can_review_group(p_group) then raise exception 'Anda tidak berwenang memverifikasi kelompok ini'; end if;
  select * into g from work_groups where id = p_group for update;
  if g.status <> 'pending' then raise exception 'Kelompok tidak sedang menunggu verifikasi'; end if;
  if p_decision <> 'verified' and coalesce(trim(p_note), '') = '' then raise exception 'Catatan wajib diisi'; end if;

  update work_groups set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where id = p_group returning * into g;

  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select s.user_id, g.school_id, 'group.reviewed',
         'Kelompok ' || g.name || ': ' || case p_decision when 'verified' then 'terverifikasi'
                                                         when 'revision' then 'perlu perbaikan' else 'ditolak' end,
         coalesce(p_note, ''), 'work_groups', g.id
  from work_group_members m join students s on s.id = m.student_id
  where m.group_id = g.id and m.invite_status = 'accepted';
  return g;
end $$;

-- Kas kelompok, dicatat Bendahara setelah kelompok terverifikasi.
create table public.group_ledger (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.work_groups(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  direction    text not null check (direction in ('masuk', 'keluar')),
  amount       bigint not null check (amount > 0),        -- rupiah
  description  text not null,
  occurred_on  date not null default current_date,
  recorded_by  uuid not null default auth.uid() references public.profiles(id),
  created_at   timestamptz not null default now()
);
alter table public.group_ledger enable row level security;
create policy gl_read on public.group_ledger for select
  using (public.is_group_member(group_id) or public.can_review_group(group_id));
create policy gl_insert on public.group_ledger for insert
  with check (recorded_by = auth.uid()
              and public.my_group_position(group_id) = 'bendahara'
              and exists (select 1 from public.work_groups g where g.id = group_id and g.status = 'verified' and g.school_id = group_ledger.school_id));

-- ---------------------------------------------------------------------
-- Pengumpulan tugas
-- ---------------------------------------------------------------------
create table public.submissions (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  assignment_id  uuid not null references public.assignments(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  group_id       uuid references public.work_groups(id) on delete set null,
  body           text,
  link_url       text,
  attachments    jsonb not null default '[]'::jsonb,   -- di bucket "submissions"
  submitted_at   timestamptz not null default now(),
  is_late        boolean not null default false,
  score          numeric(5,2),
  feedback       text,
  graded_by      uuid references public.profiles(id),
  graded_at      timestamptz,
  unique (assignment_id, student_id)
);
create index on public.submissions (student_id);

alter table public.submissions enable row level security;
create policy submissions_read on public.submissions for select
  using (public.is_student_self(student_id) or public.is_guardian_of(student_id)
         or exists (select 1 from public.assignments a where a.id = assignment_id
                    and (public.is_teacher_of_ta(a.teaching_assignment_id)
                         or public.is_homeroom_of_class(public.class_of_ta(a.teaching_assignment_id))))
         or public.has_role(school_id, array['school_admin','principal']::public.app_role[]));

create or replace function public.submit_assignment(p_assignment uuid, p_body text default null, p_link text default null, p_attachments jsonb default '[]'::jsonb)
returns setof public.submissions language plpgsql security definer set search_path = public as $$
declare a assignments; v_student students; v_group uuid; v_late boolean;
begin
  select * into a from assignments where id = p_assignment;
  if a.id is null then raise exception 'Tugas tidak ditemukan'; end if;
  select s.* into v_student from students s join enrollments e on e.student_id = s.id
   where s.user_id = auth.uid() and e.class_id = public.class_of_ta(a.teaching_assignment_id);
  if v_student.id is null then raise exception 'Anda tidak terdaftar di kelas tugas ini'; end if;
  if coalesce(trim(p_body), '') = '' and coalesce(trim(p_link), '') = '' and jsonb_array_length(coalesce(p_attachments, '[]')) = 0 then
    raise exception 'Isi jawaban, link, atau lampiran';
  end if;
  if exists (select 1 from submissions where assignment_id = a.id and student_id = v_student.id and score is not null) then
    raise exception 'Tugas sudah dinilai dan tidak dapat diubah';
  end if;
  v_late := a.due_at is not null and now() > a.due_at;

  if a.is_group then
    select g.id into v_group from work_groups g join work_group_members m on m.group_id = g.id
     where m.student_id = v_student.id and m.invite_status = 'accepted' and g.status = 'verified'
       and (g.assignment_id = a.id or (g.assignment_id is null and g.teaching_assignment_id = a.teaching_assignment_id))
     order by (g.assignment_id = a.id) desc limit 1;
    if v_group is null then raise exception 'Tugas kelompok: Anda belum tergabung di kelompok terverifikasi'; end if;

    return query
    insert into submissions (school_id, assignment_id, student_id, group_id, body, link_url, attachments, is_late, submitted_at)
    select a.school_id, a.id, m.student_id, v_group, p_body, p_link, coalesce(p_attachments, '[]'), v_late, now()
    from work_group_members m where m.group_id = v_group and m.invite_status = 'accepted'
    on conflict (assignment_id, student_id) do update
      set body = excluded.body, link_url = excluded.link_url, attachments = excluded.attachments,
          is_late = excluded.is_late, submitted_at = excluded.submitted_at, group_id = excluded.group_id
      where submissions.score is null
    returning *;
  else
    return query
    insert into submissions (school_id, assignment_id, student_id, body, link_url, attachments, is_late, submitted_at)
    values (a.school_id, a.id, v_student.id, p_body, p_link, coalesce(p_attachments, '[]'), v_late, now())
    on conflict (assignment_id, student_id) do update
      set body = excluded.body, link_url = excluded.link_url, attachments = excluded.attachments,
          is_late = excluded.is_late, submitted_at = excluded.submitted_at
    returning *;
  end if;
end $$;

create or replace function public.grade_submission(p_submission uuid, p_score numeric, p_feedback text default null)
returns public.submissions language plpgsql security definer set search_path = public as $$
declare r submissions; a assignments; v_user uuid;
begin
  select * into r from submissions where id = p_submission for update;
  if r.id is null then raise exception 'Pengumpulan tidak ditemukan'; end if;
  select * into a from assignments where id = r.assignment_id;
  if not public.is_teacher_of_ta(a.teaching_assignment_id) then raise exception 'Hanya guru mapel yang dapat menilai'; end if;
  if p_score < 0 or p_score > a.max_score then raise exception 'Nilai harus antara 0 dan %', a.max_score; end if;
  update submissions set score = p_score, feedback = p_feedback, graded_by = auth.uid(), graded_at = now()
   where id = p_submission returning * into r;
  select user_id into v_user from students where id = r.student_id;
  perform public.notify(v_user, r.school_id, 'submission.graded', 'Nilai ' || a.title || ': ' || p_score,
    coalesce(p_feedback, ''), 'assignments', a.id);
  return r;
end $$;

create trigger audit_submissions_grade after update of score on public.submissions
  for each row execute function public.audit_row();
create trigger audit_work_groups after update of status on public.work_groups
  for each row execute function public.audit_row();
