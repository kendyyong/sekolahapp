-- =====================================================================
-- SekolahApp · 0019 · Kokurikuler / P5 (modul paket "grades")
-- Projek per semester untuk satu atau beberapa kelas. Kerangka bisa
-- dipilih per projek:
--   kokurikuler = 8 dimensi profil lulusan (Permendikdasmen 2025)
--   p5          = Profil Pelajar Pancasila: 6 dimensi beserta elemennya
-- Koordinator / wali kelas menilai tiap aspek dengan BB, MB, BSH, SB
-- dan catatan proses. Hasilnya tampil di rapor setelah diterbitkan.
-- =====================================================================

create table public.profile_aspects (
  id        text primary key,                -- contoh: k.kolaborasi, p5.gotong.kolaborasi
  framework text not null check (framework in ('kokurikuler', 'p5')),
  dimension text not null,
  element   text,                            -- null: dinilai per dimensi
  position  smallint not null
);
alter table public.profile_aspects enable row level security;
create policy profile_aspects_read on public.profile_aspects for select using (true);

insert into public.profile_aspects (id, framework, dimension, element, position) values
  ('k.iman',       'kokurikuler', 'Keimanan dan ketakwaan terhadap Tuhan YME', null, 1),
  ('k.kewargaan',  'kokurikuler', 'Kewargaan', null, 2),
  ('k.nalar',      'kokurikuler', 'Penalaran kritis', null, 3),
  ('k.kreativitas','kokurikuler', 'Kreativitas', null, 4),
  ('k.kolaborasi', 'kokurikuler', 'Kolaborasi', null, 5),
  ('k.mandiri',    'kokurikuler', 'Kemandirian', null, 6),
  ('k.kesehatan',  'kokurikuler', 'Kesehatan', null, 7),
  ('k.komunikasi', 'kokurikuler', 'Komunikasi', null, 8),
  ('p5.iman.agama',     'p5', 'Beriman, bertakwa kepada Tuhan YME, dan berakhlak mulia', 'Akhlak beragama', 11),
  ('p5.iman.pribadi',   'p5', 'Beriman, bertakwa kepada Tuhan YME, dan berakhlak mulia', 'Akhlak pribadi', 12),
  ('p5.iman.manusia',   'p5', 'Beriman, bertakwa kepada Tuhan YME, dan berakhlak mulia', 'Akhlak kepada manusia', 13),
  ('p5.iman.alam',      'p5', 'Beriman, bertakwa kepada Tuhan YME, dan berakhlak mulia', 'Akhlak kepada alam', 14),
  ('p5.iman.negara',    'p5', 'Beriman, bertakwa kepada Tuhan YME, dan berakhlak mulia', 'Akhlak bernegara', 15),
  ('p5.bineka.budaya',  'p5', 'Berkebinekaan global', 'Mengenal dan menghargai budaya', 21),
  ('p5.bineka.komunikasi', 'p5', 'Berkebinekaan global', 'Komunikasi dan interaksi antarbudaya', 22),
  ('p5.bineka.refleksi','p5', 'Berkebinekaan global', 'Refleksi dan tanggung jawab terhadap pengalaman kebinekaan', 23),
  ('p5.bineka.adil',    'p5', 'Berkebinekaan global', 'Berkeadilan sosial', 24),
  ('p5.gotong.kolaborasi', 'p5', 'Bergotong royong', 'Kolaborasi', 31),
  ('p5.gotong.peduli',  'p5', 'Bergotong royong', 'Kepedulian', 32),
  ('p5.gotong.berbagi', 'p5', 'Bergotong royong', 'Berbagi', 33),
  ('p5.mandiri.diri',   'p5', 'Mandiri', 'Pemahaman diri dan situasi yang dihadapi', 41),
  ('p5.mandiri.regulasi','p5', 'Mandiri', 'Regulasi diri', 42),
  ('p5.nalar.info',     'p5', 'Bernalar kritis', 'Memperoleh dan memproses informasi dan gagasan', 51),
  ('p5.nalar.analisis', 'p5', 'Bernalar kritis', 'Menganalisis dan mengevaluasi penalaran dan prosedurnya', 52),
  ('p5.nalar.refleksi', 'p5', 'Bernalar kritis', 'Refleksi pemikiran dan proses berpikir', 53),
  ('p5.kreatif.gagasan','p5', 'Kreatif', 'Menghasilkan gagasan yang orisinal', 61),
  ('p5.kreatif.karya',  'p5', 'Kreatif', 'Menghasilkan karya dan tindakan yang orisinal', 62),
  ('p5.kreatif.luwes',  'p5', 'Kreatif', 'Memiliki keluwesan berpikir dalam mencari alternatif solusi permasalahan', 63);

create table public.kokurikuler_projects (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  term_id        uuid not null references public.terms(id) on delete cascade,
  framework      text not null default 'kokurikuler' check (framework in ('kokurikuler', 'p5')),
  title          text not null check (length(title) between 3 and 150),
  theme          text check (length(theme) <= 150),
  description    text check (length(description) <= 4000),
  class_ids      uuid[] not null check (cardinality(class_ids) between 1 and 40),
  aspect_ids     text[] not null check (cardinality(aspect_ids) between 1 and 30),
  coordinator_id uuid references public.profiles(id) default auth.uid(),
  created_at     timestamptz not null default now()
);
create index on public.kokurikuler_projects (term_id);
create index on public.kokurikuler_projects using gin (class_ids);
create trigger kp_same_school before insert or update on public.kokurikuler_projects
  for each row execute function public.assert_same_school('terms', 'term_id');
create trigger kp_module before insert on public.kokurikuler_projects
  for each row execute function public.require_module('grades');
create trigger kp_open before insert or update or delete on public.kokurikuler_projects
  for each row execute function public.guard_term_open('term');

-- Kelas harus di tahun ajaran semester itu; aspek harus dari kerangka projek.
create or replace function public.guard_kokurikuler_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from unnest(new.class_ids) cid
              where not exists (select 1 from classes c join terms t on t.academic_year_id = c.academic_year_id
                                 where c.id = cid and t.id = new.term_id and c.school_id = new.school_id)) then
    raise exception 'Kelas tidak berada di tahun ajaran semester ini';
  end if;
  if exists (select 1 from unnest(new.aspect_ids) aid
              where not exists (select 1 from profile_aspects a where a.id = aid and a.framework = new.framework)) then
    raise exception 'Dimensi tidak sesuai kerangka projek';
  end if;
  if tg_op = 'UPDATE' and new.framework <> old.framework
     and exists (select 1 from kokurikuler_results where project_id = new.id) then
    raise exception 'Kerangka projek tidak bisa diganti setelah ada penilaian';
  end if;
  return new;
end $$;
create trigger kp_guard before insert or update on public.kokurikuler_projects
  for each row execute function public.guard_kokurikuler_project();

create table public.kokurikuler_results (
  project_id uuid not null references public.kokurikuler_projects(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  school_id  uuid not null references public.schools(id) on delete cascade,
  levels     jsonb not null default '{}'::jsonb,   -- {aspect_id: "BB"|"MB"|"BSH"|"SB"}
  note       text check (length(note) <= 2000),     -- catatan proses
  updated_by uuid references public.profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (project_id, student_id),
  check (jsonb_typeof(levels) = 'object')
);
create index on public.kokurikuler_results (student_id);
create trigger kr_same_school before insert or update on public.kokurikuler_results
  for each row execute function public.assert_same_school('kokurikuler_projects', 'project_id');
-- Sekolah murid terjamin lewat pemeriksaan pendaftaran kelas projek di guard_kokurikuler_result.
create trigger kr_touch before update on public.kokurikuler_results
  for each row execute function public.touch_updated_at();

-- security definer: koordinator belum tentu bisa membaca pendaftaran kelas peserta.
create or replace function public.guard_kokurikuler_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare p kokurikuler_projects; v_row kokurikuler_results := case when tg_op = 'DELETE' then old else new end;
begin
  select * into p from kokurikuler_projects where id = v_row.project_id;
  if public.term_published(p.term_id) then
    raise exception 'Rapor semester ini sudah diterbitkan. Minta kepala sekolah membuka terbitan rapor untuk mengubah nilai.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if not exists (select 1 from enrollments e where e.student_id = new.student_id and e.class_id = any(p.class_ids)) then
    raise exception 'Murid tidak terdaftar di kelas projek ini';
  end if;
  if exists (select 1 from jsonb_each(new.levels) l
              where not (l.key = any(p.aspect_ids)) or l.value not in ('"BB"', '"MB"', '"BSH"', '"SB"')) then
    raise exception 'Nilai projek harus BB, MB, BSH, atau SB untuk dimensi projek ini';
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger kr_guard before insert or update or delete on public.kokurikuler_results
  for each row execute function public.guard_kokurikuler_result();

-- Penilai projek: pengelola sekolah, koordinator projek, atau wali kelas peserta (hanya untuk
-- murid kelasnya). Tanpa p_student: apakah pengguna menilai sebagian murid projek ini.
create or replace function public.can_assess_project(p_project uuid, p_student uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from kokurikuler_projects p where p.id = p_project and (
    public.is_school_manager(p.school_id) or p.coordinator_id = auth.uid()
    or exists (select 1 from classes c where c.id = any(p.class_ids) and c.homeroom_teacher_id = auth.uid()
                 and (p_student is null or exists (select 1 from enrollments e where e.class_id = c.id and e.student_id = p_student)))))
$$;

alter table public.kokurikuler_projects enable row level security;
alter table public.kokurikuler_results enable row level security;

create policy kp_read on public.kokurikuler_projects for select using (public.is_member(school_id) or public.is_school_manager(school_id));
create policy kp_insert on public.kokurikuler_projects for insert
  with check (public.is_school_manager(school_id)
              or (public.has_role(school_id, array['teacher']::public.app_role[]) and coordinator_id = auth.uid()));
create policy kp_update on public.kokurikuler_projects for update
  using (public.is_school_manager(school_id) or coordinator_id = auth.uid())
  with check (public.is_school_manager(school_id) or coordinator_id = auth.uid());
create policy kp_delete on public.kokurikuler_projects for delete
  using (public.is_school_manager(school_id) or coordinator_id = auth.uid());

create policy kr_read on public.kokurikuler_results for select
  using ((public.is_staff(school_id) and public.can_view_student(student_id))
         or public.can_assess_project(project_id, student_id)
         or exists (select 1 from kokurikuler_projects p where p.id = project_id
                     and public.report_visible_to_family(p.term_id, student_id)));
create policy kr_write on public.kokurikuler_results for all
  using (public.can_assess_project(project_id, student_id)) with check (public.can_assess_project(project_id, student_id));

-- Lembar penilaian projek: murid aktif kelas peserta beserta nilainya. Penilai melihat semua
-- murid projek (koordinator lintas kelas belum tentu mengajar kelasnya); staf lain hanya murid
-- yang memang boleh dilihatnya.
create or replace function public.kokurikuler_sheet(p_project uuid)
returns table (student_id uuid, full_name text, nis text, nisn text, class_id uuid, class_name text,
               roll_number smallint, levels jsonb, note text)
language sql stable security definer set search_path = public as $$
  select s.id, s.full_name, s.nis, s.nisn, c.id, c.name, e.roll_number, r.levels, r.note
    from kokurikuler_projects p
    join classes c on c.id = any(p.class_ids)
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id and s.status = 'aktif'
    left join kokurikuler_results r on r.project_id = p.id and r.student_id = s.id
   where p.id = p_project
     and (public.can_assess_project(p.id, s.id) or (public.is_staff(p.school_id) and public.can_view_student(s.id)))
   order by c.grade_level, c.name, e.roll_number nulls last, s.full_name
$$;
revoke execute on function public.kokurikuler_sheet(uuid) from public, anon;
grant execute on function public.kokurikuler_sheet(uuid) to authenticated;

-- Bagian kokurikuler/P5 di rapor satu murid (hak lihat sama dengan report_card_view).
create or replace function public.kokurikuler_report(p_term uuid, p_student uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from students where id = p_student;
  if not ((public.is_staff(v_school) and public.can_view_student(p_student))
          or public.report_visible_to_family(p_term, p_student)) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'title', p.title, 'theme', p.theme, 'framework', p.framework, 'description', p.description,
      'note', r.note,
      'aspects', (select jsonb_agg(jsonb_build_object('id', a.id, 'dimension', a.dimension, 'element', a.element,
                                                      'level', r.levels ->> a.id) order by a.position)
                    from profile_aspects a where a.id = any(p.aspect_ids))
    ) order by p.created_at)
    from kokurikuler_projects p
    join enrollments e on e.class_id = any(p.class_ids) and e.student_id = p_student
    left join kokurikuler_results r on r.project_id = p.id and r.student_id = p_student
    where p.term_id = p_term), '[]'::jsonb);
end $$;
revoke execute on function public.kokurikuler_report(uuid, uuid) from public, anon;
grant execute on function public.kokurikuler_report(uuid, uuid) to authenticated;
