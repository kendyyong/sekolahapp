-- =====================================================================
-- SekolahApp · 0001 · Inti: tenant (yayasan & sekolah), profil, peran
-- =====================================================================
-- Prinsip multi-tenant: setiap tabel milik sekolah membawa school_id dan
-- dilindungi Row Level Security. Satu akun (auth.users) bisa memegang
-- banyak peran di banyak sekolah melalui tabel memberships.

create extension if not exists pgcrypto;

create type public.app_role as enum (
  'school_admin',   -- Admin Sekolah
  'principal',      -- Kepala Sekolah
  'teacher',        -- Guru (wali kelas ditentukan dari classes.homeroom_teacher_id)
  'counselor',      -- Guru BK
  'finance',        -- Tata Usaha / Bendahara
  'student',        -- Murid
  'guardian'        -- Wali Siswa / Orang tua
);

create type public.plan_tier as enum ('free', 'basic', 'pro', 'enterprise');

-- ---------------------------------------------------------------------
-- Tenant
-- ---------------------------------------------------------------------
create table public.foundations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table public.schools (
  id             uuid primary key default gen_random_uuid(),
  foundation_id  uuid references public.foundations(id) on delete set null,
  name           text not null,
  slug           text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  npsn           text unique,
  level          text check (level in ('TK','SD','SMP','SMA','SMK','MI','MTs','MA','LAINNYA')),
  address        text,
  phone          text,
  logo_url       text,
  timezone       text not null default 'Asia/Jakarta',
  plan           public.plan_tier not null default 'free',
  plan_expires_at timestamptz,
  -- Pengaturan: jam masuk, geofence absensi, kuota cuti, dll.
  settings       jsonb not null default jsonb_build_object(
                   'school_start_time', '07:00',
                   'late_after_minutes', 15,
                   'geofence', null,
                   'annual_leave_days', 12,
                   'student_leave_escalate_days', 3
                 ),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Profil pengguna (1:1 dengan auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          new.email, new.phone)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin platform (pemilik produk). Tidak terikat ke sekolah mana pun.
create table public.platform_admins (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Admin yayasan melihat semua sekolah di bawah yayasannya.
create table public.foundation_admins (
  foundation_id uuid not null references public.foundations(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  primary key (foundation_id, user_id)
);

-- Peran pengguna di sebuah sekolah. Satu orang bisa punya banyak baris.
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        public.app_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (school_id, user_id, role)
);
create index on public.memberships (user_id);

-- ---------------------------------------------------------------------
-- Fungsi bantu hak akses (security definer agar tidak rekursif di RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create or replace function public.has_role(p_school uuid, p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where school_id = p_school and user_id = auth.uid()
      and is_active and role = any (p_roles)
  )
$$;

create or replace function public.is_member(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where school_id = p_school and user_id = auth.uid() and is_active
  )
$$;

create or replace function public.is_foundation_admin_of_school(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from schools s
    join foundation_admins fa on fa.foundation_id = s.foundation_id
    where s.id = p_school and fa.user_id = auth.uid()
  )
$$;

-- Pengelola sekolah: admin sekolah, kepala sekolah, admin yayasan, admin platform.
create or replace function public.is_school_manager(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_school, array['school_admin','principal']::public.app_role[])
      or public.is_foundation_admin_of_school(p_school)
      or public.is_platform_admin()
$$;

-- Staf sekolah (bukan murid/orang tua).
create or replace function public.is_staff(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_school, array['school_admin','principal','teacher','counselor','finance']::public.app_role[])
      or public.is_foundation_admin_of_school(p_school)
      or public.is_platform_admin()
$$;

-- Daftar sekolah & peran milik pengguna saat ini (untuk tombol "Ganti peran").
create or replace function public.my_roles()
returns table (school_id uuid, school_name text, role public.app_role)
language sql stable security definer set search_path = public as $$
  select m.school_id, s.name, m.role
  from memberships m join schools s on s.id = m.school_id
  where m.user_id = auth.uid() and m.is_active and s.is_active
  order by s.name, m.role
$$;

-- ---------------------------------------------------------------------
-- updated_at otomatis
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.foundations       enable row level security;
alter table public.schools           enable row level security;
alter table public.profiles          enable row level security;
alter table public.platform_admins   enable row level security;
alter table public.foundation_admins enable row level security;
alter table public.memberships       enable row level security;

create policy foundations_read on public.foundations for select
  using (public.is_platform_admin()
         or exists (select 1 from public.foundation_admins fa
                    where fa.foundation_id = foundations.id and fa.user_id = auth.uid()));
create policy foundations_write on public.foundations for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy schools_read on public.schools for select
  using (public.is_member(id) or public.is_foundation_admin_of_school(id) or public.is_platform_admin());
create policy schools_insert on public.schools for insert
  with check (public.is_platform_admin());
create policy schools_update on public.schools for update
  using (public.has_role(id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(id, array['school_admin']::public.app_role[]) or public.is_platform_admin());
-- Kolom paket langganan hanya boleh diubah admin platform.
create or replace function public.guard_school_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.plan, new.plan_expires_at, new.foundation_id, new.is_active)
     is distinct from (old.plan, old.plan_expires_at, old.foundation_id, old.is_active)
     and not public.is_platform_admin()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Hanya admin platform yang dapat mengubah paket atau status sekolah';
  end if;
  return new;
end $$;
create trigger schools_guard_plan before update on public.schools
  for each row execute function public.guard_school_plan();

-- Profil: diri sendiri, atau orang yang satu sekolah.
create policy profiles_read on public.profiles for select
  using (
    id = auth.uid() or public.is_platform_admin()
    or exists (
      select 1 from public.memberships me
      join public.memberships them on them.school_id = me.school_id
      where me.user_id = auth.uid() and me.is_active and them.user_id = profiles.id
    )
  );
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy platform_admins_read on public.platform_admins for select
  using (user_id = auth.uid() or public.is_platform_admin());

create policy foundation_admins_read on public.foundation_admins for select
  using (user_id = auth.uid() or public.is_platform_admin());
create policy foundation_admins_write on public.foundation_admins for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy memberships_read on public.memberships for select
  using (user_id = auth.uid() or public.is_staff(school_id));
create policy memberships_write on public.memberships for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin())
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]) or public.is_platform_admin());
