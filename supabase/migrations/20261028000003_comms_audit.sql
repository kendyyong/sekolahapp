-- =====================================================================
-- SekolahApp · 0003 · Notifikasi, pengumuman, pesan wali kelas, audit
-- =====================================================================

-- ---------------------------------------------------------------------
-- Notifikasi (sumber untuk push FCM via database webhook)
-- ---------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  school_id   uuid references public.schools(id) on delete cascade,
  kind        text not null,               -- contoh: leave.submitted, group.verified
  title       text not null,
  body        text,
  ref_table   text,
  ref_id      uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_own_read on public.notifications for select using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Dipanggil dari trigger/fungsi lain. Tidak diberikan ke klien.
create or replace function public.notify(
  p_user uuid, p_school uuid, p_kind text, p_title text, p_body text,
  p_ref_table text default null, p_ref_id uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select p_user, p_school, p_kind, p_title, p_body, p_ref_table, p_ref_id
  where p_user is not null
$$;
revoke execute on function public.notify(uuid, uuid, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.mark_all_notifications_read()
returns void language sql security invoker as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null
$$;

-- ---------------------------------------------------------------------
-- Pengumuman
-- ---------------------------------------------------------------------
create type public.audience as enum ('all', 'staff', 'students', 'guardians', 'class');

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  title        text not null,
  body         text not null,
  audience     public.audience not null default 'all',
  class_id     uuid references public.classes(id) on delete cascade,
  attachments  jsonb not null default '[]'::jsonb,
  created_by   uuid not null default auth.uid() references public.profiles(id),
  published_at timestamptz not null default now(),
  check ((audience = 'class') = (class_id is not null))
);
create index on public.announcements (school_id, published_at desc);

create or replace function public.can_read_announcement(a public.announcements)
returns boolean language sql stable security definer set search_path = public as $$
  select case a.audience
    when 'all'       then public.is_member(a.school_id) or public.is_school_manager(a.school_id)
    when 'staff'     then public.is_staff(a.school_id)
    when 'students'  then public.is_staff(a.school_id) or public.has_role(a.school_id, array['student']::public.app_role[])
    when 'guardians' then public.is_staff(a.school_id) or public.has_role(a.school_id, array['guardian']::public.app_role[])
    when 'class'     then public.can_view_class(a.class_id)
  end
$$;

alter table public.announcements enable row level security;
create policy announcements_read on public.announcements for select using (public.can_read_announcement(announcements));
create policy announcements_insert on public.announcements for insert with check (
  created_by = auth.uid() and (
    public.has_role(school_id, array['school_admin','principal','finance']::public.app_role[])
    or (audience = 'class' and public.teaches_class(class_id))
  ));
create policy announcements_modify on public.announcements for update
  using (created_by = auth.uid() or public.is_school_manager(school_id))
  with check (created_by = auth.uid() or public.is_school_manager(school_id));
create policy announcements_delete on public.announcements for delete
  using (created_by = auth.uid() or public.is_school_manager(school_id));

-- Kirim notifikasi ke semua penerima pengumuman.
create or replace function public.fanout_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select distinct r.user_id, new.school_id, 'announcement', new.title, left(new.body, 140), 'announcements', new.id
  from (
    select m.user_id from memberships m
    where m.school_id = new.school_id and m.is_active and (
      new.audience = 'all'
      or (new.audience = 'staff'     and m.role in ('school_admin','principal','teacher','counselor','finance'))
      or (new.audience = 'students'  and m.role = 'student')
      or (new.audience = 'guardians' and m.role = 'guardian'))
    union
    select s.user_id from enrollments e join students s on s.id = e.student_id
    where new.audience = 'class' and e.class_id = new.class_id and s.user_id is not null
    union
    select g.guardian_id from enrollments e join guardian_links g on g.student_id = e.student_id
    where new.audience = 'class' and e.class_id = new.class_id
  ) r
  where r.user_id <> new.created_by;
  return new;
end $$;
create trigger announcements_fanout after insert on public.announcements
  for each row execute function public.fanout_announcement();

-- ---------------------------------------------------------------------
-- Pesan orang tua ↔ wali kelas (satu utas per murid)
-- ---------------------------------------------------------------------
create table public.student_messages (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  sender_id   uuid not null default auth.uid() references public.profiles(id),
  body        text not null check (length(body) between 1 and 4000),
  attachment_path text,
  created_at  timestamptz not null default now()
);
create index on public.student_messages (student_id, created_at);

create or replace function public.can_chat_about(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_guardian_of(p_student)
      or public.is_homeroom_of_student(p_student)
      or exists (select 1 from students s where s.id = p_student
                 and public.has_role(s.school_id, array['principal','counselor']::public.app_role[]))
$$;

alter table public.student_messages enable row level security;
create policy student_messages_read on public.student_messages for select using (public.can_chat_about(student_id));
create policy student_messages_insert on public.student_messages for insert
  with check (sender_id = auth.uid() and public.can_chat_about(student_id)
              and school_id = (select s.school_id from public.students s where s.id = student_id));

create or replace function public.notify_student_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_homeroom uuid;
begin
  select full_name into v_name from students where id = new.student_id;
  select c.homeroom_teacher_id into v_homeroom from classes c where c.id = public.current_class_of(new.student_id);
  -- ke wali kelas
  perform public.notify(v_homeroom, new.school_id, 'message', 'Pesan tentang ' || v_name, left(new.body, 140), 'students', new.student_id)
  where v_homeroom is distinct from new.sender_id;
  -- ke orang tua
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select g.guardian_id, new.school_id, 'message', 'Pesan dari sekolah tentang ' || v_name, left(new.body, 140), 'students', new.student_id
  from guardian_links g where g.student_id = new.student_id and g.guardian_id <> new.sender_id;
  return new;
end $$;
create trigger student_messages_notify after insert on public.student_messages
  for each row execute function public.notify_student_message();

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  school_id   uuid,
  actor_id    uuid,
  table_name  text not null,
  record_id   uuid,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  at          timestamptz not null default now()
);
create index on public.audit_log (school_id, at desc);

alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select
  using (public.has_role(school_id, array['school_admin','principal']::public.app_role[]) or public.is_platform_admin());

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
        v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into audit_log (school_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (coalesce(v_new->>'school_id', v_old->>'school_id')::uuid, auth.uid(), tg_table_name,
          coalesce(v_new->>'id', v_old->>'id')::uuid, lower(tg_op), v_old, v_new);
  return coalesce(new, old);
end $$;

create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function public.audit_row();
create trigger audit_students after insert or update or delete on public.students
  for each row execute function public.audit_row();
