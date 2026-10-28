-- =====================================================================
-- SekolahApp · 0002 · Akademik: tahun ajaran, kelas, murid, wali, mapel
-- =====================================================================

create table public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  name        text not null,                 -- contoh: 2026/2027
  starts_on   date not null,
  ends_on     date not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (school_id, name),
  check (ends_on > starts_on)
);
-- Hanya satu tahun ajaran aktif per sekolah.
create unique index academic_years_one_active on public.academic_years (school_id) where is_active;

create table public.terms (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  name             text not null,            -- Ganjil / Genap
  starts_on        date not null,
  ends_on          date not null,
  unique (academic_year_id, name)
);

create table public.classes (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools(id) on delete cascade,
  academic_year_id    uuid not null references public.academic_years(id) on delete cascade,
  name                text not null,         -- contoh: VII-A
  grade_level         smallint not null check (grade_level between 0 and 13),
  homeroom_teacher_id uuid references public.profiles(id) on delete set null,  -- wali kelas
  qr_secret           text not null default encode(gen_random_bytes(16), 'hex'),
  created_at          timestamptz not null default now(),
  unique (academic_year_id, name)
);
create index on public.classes (school_id);
create index on public.classes (homeroom_teacher_id);

-- Data induk murid. user_id boleh kosong (murid SD sering belum punya akun).
create table public.students (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  nis         text,
  nisn        text,
  full_name   text not null,
  gender      char(1) check (gender in ('L','P')),
  birth_place text,
  birth_date  date,
  address     text,
  photo_url   text,
  status      text not null default 'aktif' check (status in ('aktif','lulus','pindah','keluar')),
  created_at  timestamptz not null default now(),
  unique (school_id, nis),
  unique (school_id, user_id)
);
create index on public.students (user_id);

create table public.guardian_links (
  student_id  uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete cascade,
  school_id   uuid not null references public.schools(id) on delete cascade,
  relation    text not null default 'orang tua' check (relation in ('ayah','ibu','wali','orang tua')),
  is_primary  boolean not null default false,
  primary key (student_id, guardian_id)
);
create index on public.guardian_links (guardian_id);

create table public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  roll_number smallint,                      -- nomor absen
  created_at  timestamptz not null default now(),
  unique (class_id, student_id)
);
create index on public.enrollments (student_id);

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  code        text not null,
  name        text not null,
  unique (school_id, code)
);

-- Guru × mapel × kelas.
create table public.teaching_assignments (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  meeting_url text,                          -- link Zoom/Meet tetap untuk kelas ini
  unique (class_id, subject_id)
);
create index on public.teaching_assignments (teacher_id);

create table public.schedules (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  teaching_assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  day_of_week            smallint not null check (day_of_week between 1 and 7),  -- 1 = Senin
  starts_at              time not null,
  ends_at                time not null,
  room                   text,
  check (ends_at > starts_at)
);

-- ---------------------------------------------------------------------
-- Konsistensi tenant: baris anak harus satu sekolah dengan induknya.
-- ---------------------------------------------------------------------
create or replace function public.assert_same_school()
returns trigger language plpgsql as $$
declare v_school uuid;
begin
  -- TG_ARGV[0] = nama tabel induk, TG_ARGV[1] = nama kolom FK
  execute format('select school_id from public.%I where id = ($1).%I', TG_ARGV[0], TG_ARGV[1])
    into v_school using new;
  if v_school is distinct from new.school_id then
    raise exception 'Data % tidak berada di sekolah yang sama', TG_ARGV[0];
  end if;
  return new;
end $$;

create trigger terms_same_school before insert or update on public.terms
  for each row execute function public.assert_same_school('academic_years', 'academic_year_id');
create trigger classes_same_school before insert or update on public.classes
  for each row execute function public.assert_same_school('academic_years', 'academic_year_id');
create trigger enrollments_same_school_c before insert or update on public.enrollments
  for each row execute function public.assert_same_school('classes', 'class_id');
create trigger enrollments_same_school_s before insert or update on public.enrollments
  for each row execute function public.assert_same_school('students', 'student_id');
create trigger guardian_links_same_school before insert or update on public.guardian_links
  for each row execute function public.assert_same_school('students', 'student_id');
create trigger ta_same_school_c before insert or update on public.teaching_assignments
  for each row execute function public.assert_same_school('classes', 'class_id');
create trigger ta_same_school_s before insert or update on public.teaching_assignments
  for each row execute function public.assert_same_school('subjects', 'subject_id');
create trigger schedules_same_school before insert or update on public.schedules
  for each row execute function public.assert_same_school('teaching_assignments', 'teaching_assignment_id');

-- ---------------------------------------------------------------------
-- Fungsi bantu hak akses akademik
-- ---------------------------------------------------------------------

-- Kelas aktif murid (tahun ajaran aktif).
create or replace function public.current_class_of(p_student uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.class_id
  from enrollments e
  join classes c on c.id = e.class_id
  join academic_years ay on ay.id = c.academic_year_id and ay.is_active
  where e.student_id = p_student
  limit 1
$$;

create or replace function public.is_homeroom_of_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = p_class and homeroom_teacher_id = auth.uid())
$$;

create or replace function public.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from teaching_assignments where class_id = p_class and teacher_id = auth.uid())
      or public.is_homeroom_of_class(p_class)
$$;

create or replace function public.is_homeroom_of_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_homeroom_of_class(public.current_class_of(p_student))
$$;

create or replace function public.is_guardian_of(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardian_links where student_id = p_student and guardian_id = auth.uid())
$$;

create or replace function public.is_student_self(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from students where id = p_student and user_id = auth.uid())
$$;

-- Murid milik akun saat ini (sebagai murid sendiri).
create or replace function public.my_student_id(p_school uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from students where school_id = p_school and user_id = auth.uid()
$$;

-- Akun saat ini adalah murid yang terdaftar di kelas ini.
create or replace function public.is_student_in_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments e join students s on s.id = e.student_id
                 where e.class_id = p_class and s.user_id = auth.uid())
$$;

-- Siapa boleh melihat data seorang murid.
create or replace function public.can_view_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from students s
    where s.id = p_student and (
      s.user_id = auth.uid()
      or public.is_guardian_of(s.id)
      or public.has_role(s.school_id, array['school_admin','principal','counselor','finance']::public.app_role[])
      or public.is_foundation_admin_of_school(s.school_id)
      or public.is_platform_admin()
      or exists (select 1 from enrollments e where e.student_id = s.id and public.teaches_class(e.class_id))
    )
  )
$$;

-- Murid boleh melihat kelasnya, guru kelas yang diajar, staf pengelola semua.
create or replace function public.can_view_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from classes c
    where c.id = p_class and (
      public.is_staff(c.school_id)
      or exists (select 1 from enrollments e join students s on s.id = e.student_id
                 where e.class_id = c.id and (s.user_id = auth.uid() or public.is_guardian_of(s.id)))
    )
  )
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.academic_years       enable row level security;
alter table public.terms                enable row level security;
alter table public.classes              enable row level security;
alter table public.students             enable row level security;
alter table public.guardian_links       enable row level security;
alter table public.enrollments          enable row level security;
alter table public.subjects             enable row level security;
alter table public.teaching_assignments enable row level security;
alter table public.schedules            enable row level security;

-- Data referensi sekolah: dibaca semua anggota, ditulis admin sekolah.
create policy ay_read  on public.academic_years for select using (public.is_member(school_id) or public.is_school_manager(school_id));
create policy ay_write on public.academic_years for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());

create policy terms_read  on public.terms for select using (public.is_member(school_id) or public.is_school_manager(school_id));
create policy terms_write on public.terms for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());

create policy subjects_read  on public.subjects for select using (public.is_member(school_id) or public.is_school_manager(school_id));
create policy subjects_write on public.subjects for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());

create policy classes_read  on public.classes for select using (public.can_view_class(id));
create policy classes_write on public.classes for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());

create policy students_read on public.students for select using (public.can_view_student(id));
create policy students_write on public.students for all
  using (public.has_role(school_id, array['school_admin','finance']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin','finance']::public.app_role[]) or public.is_platform_admin());

create policy guardian_links_read on public.guardian_links for select
  using (guardian_id = auth.uid() or public.can_view_student(student_id));
create policy guardian_links_write on public.guardian_links for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());

create policy enrollments_read on public.enrollments for select
  using (public.has_role(school_id, array['school_admin','principal','counselor','finance']::public.app_role[])
         or public.is_school_manager(school_id)
         or public.teaches_class(class_id)
         or public.can_view_student(student_id)
         or public.is_student_in_class(class_id));   -- teman sekelas (untuk membentuk kelompok)
create policy enrollments_write on public.enrollments for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());

create policy ta_read on public.teaching_assignments for select using (public.can_view_class(class_id));
create policy ta_write on public.teaching_assignments for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());
-- Guru boleh memperbarui link Zoom kelasnya sendiri.
create policy ta_teacher_update on public.teaching_assignments for update
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy schedules_read on public.schedules for select
  using (exists (select 1 from public.teaching_assignments ta where ta.id = teaching_assignment_id and public.can_view_class(ta.class_id)));
create policy schedules_write on public.schedules for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());

-- Guru tidak boleh mengubah kolom selain meeting_url lewat kebijakan ta_teacher_update.
create or replace function public.guard_teaching_assignment_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_role(old.school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin()
          or coalesce(auth.role(), '') = 'service_role')
     and (new.class_id, new.subject_id, new.teacher_id, new.school_id)
         is distinct from (old.class_id, old.subject_id, old.teacher_id, old.school_id) then
    raise exception 'Guru hanya dapat mengubah link kelas online';
  end if;
  return new;
end $$;
create trigger ta_guard before update on public.teaching_assignments
  for each row execute function public.guard_teaching_assignment_update();
