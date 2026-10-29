-- =====================================================================
-- SekolahApp · 0014 · E-rapor Kurikulum Merdeka (modul paket "grades")
--
-- Alur:
--   1. Admin membuat semester (tabel terms) dengan tanggal & tempat rapor.
--   2. Guru mapel menulis Tujuan Pembelajaran (TP), membuat penilaian
--      (formatif, sumatif lingkup materi, sumatif akhir semester) dan nilainya.
--   3. compute_report_grades() menghitung nilai rapor per mapel beserta
--      deskripsi capaian dari TP tertinggi & terendah; guru boleh mengubahnya.
--   4. Wali kelas mengisi catatan, ekstrakurikuler, kenaikan kelas, lalu
--      memfinalkan rapor (rekap ketidakhadiran diambil otomatis).
--   5. Kepala sekolah/admin menerbitkan rapor semester: orang tua & murid
--      diberi tahu dan bisa melihat rapor; data semester itu terkunci.
--
-- Pengaturan sekolah: settings->>'kktp' (default 75) dan
-- settings->>'report_sas_weight' = bobot sumatif akhir semester dalam
-- persen (default 50; sisanya rata-rata sumatif lingkup materi).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Semester & urutan mapel di rapor
-- ---------------------------------------------------------------------
alter table public.terms
  add column semester     smallint not null default 1 check (semester in (1, 2)),
  add column report_date  date,
  add column report_place text,
  add column published_at timestamptz,
  add column published_by uuid references public.profiles(id);

alter table public.subjects add column report_order smallint not null default 100;

-- ---------------------------------------------------------------------
-- Fungsi bantu
-- ---------------------------------------------------------------------
create or replace function public.ta_class(p_ta uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select class_id from teaching_assignments where id = p_ta
$$;

-- Guru pengampu mapel di kelas itu, atau pengelola sekolah.
create or replace function public.can_grade(p_ta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from teaching_assignments ta where ta.id = p_ta
                 and (ta.teacher_id = auth.uid() or public.is_school_manager(ta.school_id)))
$$;

create or replace function public.teaches_subject_grade(p_subject uuid, p_grade smallint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from teaching_assignments ta join classes c on c.id = ta.class_id
                 where ta.subject_id = p_subject and c.grade_level = p_grade and ta.teacher_id = auth.uid())
$$;

create or replace function public.term_published(p_term uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from terms where id = p_term and published_at is not null)
$$;

-- Data semester yang sudah diterbitkan tidak boleh diubah (buka dulu terbitannya).
create or replace function public.guard_term_open()
returns trigger language plpgsql as $$
declare v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end); v_term uuid;
begin
  if tg_argv[0] = 'assessment' then
    select term_id into v_term from assessments where id = (v_row->>'assessment_id')::uuid;
  else
    v_term := (v_row->>'term_id')::uuid;
  end if;
  if public.term_published(v_term) then
    raise exception 'Rapor semester ini sudah diterbitkan. Minta kepala sekolah membuka terbitan rapor untuk mengubah nilai.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ---------------------------------------------------------------------
-- Tujuan Pembelajaran (TP) per mapel & tingkat
-- ---------------------------------------------------------------------
create table public.learning_objectives (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  grade_level smallint not null,
  code        text not null,                 -- contoh: TP 1
  description text not null,                 -- frasa, contoh: "menjumlahkan dan mengurangkan pecahan"
  created_by  uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (subject_id, grade_level, code)
);
create trigger lo_same_school before insert or update on public.learning_objectives
  for each row execute function public.assert_same_school('subjects', 'subject_id');
create trigger lo_module before insert on public.learning_objectives
  for each row execute function public.require_module('grades');

alter table public.learning_objectives enable row level security;
create policy lo_read on public.learning_objectives for select
  using (public.is_member(school_id) or public.is_school_manager(school_id));
create policy lo_write on public.learning_objectives for all
  using (public.is_school_manager(school_id) or public.teaches_subject_grade(subject_id, grade_level))
  with check (public.is_school_manager(school_id) or public.teaches_subject_grade(subject_id, grade_level));

-- ---------------------------------------------------------------------
-- Penilaian & nilai
-- ---------------------------------------------------------------------
create type public.assessment_kind as enum ('formatif', 'sumatif', 'sas');  -- sas = sumatif akhir semester

create table public.assessments (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  teaching_assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  term_id                uuid not null references public.terms(id) on delete cascade,
  kind                   public.assessment_kind not null,
  title                  text not null,
  held_on                date not null default current_date,
  objective_ids          uuid[] not null default '{}',
  created_by             uuid references public.profiles(id) default auth.uid(),
  created_at             timestamptz not null default now()
);
create index on public.assessments (teaching_assignment_id, term_id);
create trigger assessments_same_school before insert or update on public.assessments
  for each row execute function public.assert_same_school('teaching_assignments', 'teaching_assignment_id');
create trigger assessments_same_school_t before insert or update on public.assessments
  for each row execute function public.assert_same_school('terms', 'term_id');
create trigger assessments_module before insert on public.assessments
  for each row execute function public.require_module('grades');
create trigger assessments_open before insert or update or delete on public.assessments
  for each row execute function public.guard_term_open('term');

create table public.assessment_scores (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  school_id     uuid not null references public.schools(id) on delete cascade,
  score         numeric(5,2) not null check (score between 0 and 100),
  updated_at    timestamptz not null default now(),
  primary key (assessment_id, student_id)
);
create index on public.assessment_scores (student_id);
create trigger scores_same_school before insert or update on public.assessment_scores
  for each row execute function public.assert_same_school('assessments', 'assessment_id');
create trigger scores_same_school_s before insert or update on public.assessment_scores
  for each row execute function public.assert_same_school('students', 'student_id');
create trigger scores_open before insert or update or delete on public.assessment_scores
  for each row execute function public.guard_term_open('assessment');
create trigger scores_touch before update on public.assessment_scores
  for each row execute function public.touch_updated_at();

alter table public.assessments enable row level security;
alter table public.assessment_scores enable row level security;
create policy assessments_read on public.assessments for select
  using (public.can_view_class(public.ta_class(teaching_assignment_id)));
create policy assessments_write on public.assessments for all
  using (public.can_grade(teaching_assignment_id)) with check (public.can_grade(teaching_assignment_id));
create policy scores_read on public.assessment_scores for select using (public.can_view_student(student_id));
create policy scores_write on public.assessment_scores for all
  using (exists (select 1 from assessments a where a.id = assessment_id and public.can_grade(a.teaching_assignment_id)))
  with check (exists (select 1 from assessments a where a.id = assessment_id and public.can_grade(a.teaching_assignment_id)));

-- ---------------------------------------------------------------------
-- Nilai rapor per mapel
-- ---------------------------------------------------------------------
create table public.report_grades (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  term_id                uuid not null references public.terms(id) on delete cascade,
  teaching_assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  student_id             uuid not null references public.students(id) on delete cascade,
  score                  numeric(5,2) check (score between 0 and 100),
  description            text,
  edited                 boolean not null default false,  -- diubah guru: tidak ditimpa hitung ulang
  updated_by             uuid references public.profiles(id) default auth.uid(),
  updated_at             timestamptz not null default now(),
  unique (term_id, teaching_assignment_id, student_id)
);
create index on public.report_grades (student_id, term_id);
create trigger rg_same_school before insert or update on public.report_grades
  for each row execute function public.assert_same_school('teaching_assignments', 'teaching_assignment_id');
create trigger rg_module before insert on public.report_grades
  for each row execute function public.require_module('grades');
create trigger rg_open before insert or update or delete on public.report_grades
  for each row execute function public.guard_term_open('term');
create trigger rg_touch before update on public.report_grades
  for each row execute function public.touch_updated_at();

alter table public.report_grades enable row level security;
create policy rg_write on public.report_grades for all
  using (public.can_grade(teaching_assignment_id)) with check (public.can_grade(teaching_assignment_id));

-- ---------------------------------------------------------------------
-- Rapor per murid (bagian wali kelas)
-- ---------------------------------------------------------------------
create table public.report_cards (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  term_id          uuid not null references public.terms(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  class_id         uuid not null references public.classes(id) on delete cascade,
  homeroom_note    text,
  extracurriculars jsonb not null default '[]',   -- [{"name":"Pramuka","grade":"Baik","note":"..."}]
  promotion        text check (promotion in ('naik', 'tinggal', 'lulus', 'tidak_lulus')),
  sick             int,                           -- diisi otomatis saat difinalkan
  permit           int,
  absent           int,
  status           text not null default 'draft' check (status in ('draft', 'final')),
  finalized_at     timestamptz,
  finalized_by     uuid references public.profiles(id),
  updated_at       timestamptz not null default now(),
  unique (term_id, student_id),
  check (jsonb_typeof(extracurriculars) = 'array')
);
create index on public.report_cards (class_id, term_id);

-- Rapor yang sudah final dan diterbitkan boleh dilihat murid sendiri & orang tuanya.
create or replace function public.report_visible_to_family(p_term uuid, p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.term_published(p_term)
     and exists (select 1 from report_cards where term_id = p_term and student_id = p_student and status = 'final')
     and (public.is_student_self(p_student) or public.is_guardian_of(p_student))
$$;

create policy rg_read on public.report_grades for select
  using ((public.is_staff(school_id) and public.can_view_student(student_id))
         or public.report_visible_to_family(term_id, student_id));

create trigger rc_same_school before insert or update on public.report_cards
  for each row execute function public.assert_same_school('classes', 'class_id');
create trigger rc_same_school_s before insert or update on public.report_cards
  for each row execute function public.assert_same_school('students', 'student_id');
create trigger rc_module before insert on public.report_cards
  for each row execute function public.require_module('grades');
create trigger rc_open before insert or update or delete on public.report_cards
  for each row execute function public.guard_term_open('term');
create trigger rc_touch before update on public.report_cards
  for each row execute function public.touch_updated_at();

-- Rekap ketidakhadiran harian murid dalam rentang semester.
create or replace function public.term_attendance(p_term uuid, p_student uuid)
returns table (sick int, permit int, absent int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where a.status = 'sakit')::int,
         count(*) filter (where a.status = 'izin')::int,
         count(*) filter (where a.status = 'alpa')::int
  from terms t
  left join student_attendance a on a.student_id = p_student and a.teaching_assignment_id is null
    and a.date between t.starts_on and t.ends_on
  where t.id = p_term
$$;

-- Saat difinalkan: catat rekap kehadiran dan siapa yang memfinalkan.
create or replace function public.report_card_status()
returns trigger language plpgsql as $$
begin
  if new.status = 'final' and (tg_op = 'INSERT' or old.status <> 'final') then
    select sick, permit, absent into new.sick, new.permit, new.absent from public.term_attendance(new.term_id, new.student_id);
    new.finalized_at := now();
    new.finalized_by := auth.uid();
  elsif new.status = 'draft' then
    new.finalized_at := null;
    new.finalized_by := null;
  end if;
  return new;
end $$;
create trigger rc_status before insert or update on public.report_cards
  for each row execute function public.report_card_status();

alter table public.report_cards enable row level security;
create policy rc_read on public.report_cards for select
  using ((public.is_staff(school_id) and public.can_view_student(student_id))
         or (status = 'final' and public.term_published(term_id)
             and (public.is_student_self(student_id) or public.is_guardian_of(student_id))));
create policy rc_write on public.report_cards for all
  using (public.is_homeroom_of_class(class_id) or public.is_school_manager(school_id))
  with check (public.is_homeroom_of_class(class_id) or public.is_school_manager(school_id));

-- ---------------------------------------------------------------------
-- Hitung nilai rapor satu mapel × kelas
-- ---------------------------------------------------------------------
create or replace function public.compute_report_grades(p_term uuid, p_ta uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ta teaching_assignments; v_settings jsonb; v_kktp numeric; v_w numeric; v_n int := 0;
  r record; v_score numeric; v_desc text; v_hi record; v_lo record;
begin
  select * into v_ta from teaching_assignments where id = p_ta;
  if v_ta.id is null or not public.can_grade(p_ta) then raise exception 'Hanya guru pengampu mapel ini'; end if;
  if not exists (select 1 from terms where id = p_term and school_id = v_ta.school_id) then raise exception 'Semester tidak ditemukan'; end if;
  select settings into v_settings from schools where id = v_ta.school_id;
  v_kktp := coalesce(nullif(v_settings->>'kktp', '')::numeric, 75);
  v_w := coalesce(nullif(v_settings->>'report_sas_weight', '')::numeric, 50) / 100;

  for r in
    select e.student_id,
           avg(sc.score) filter (where a.kind = 'sumatif') as slm,
           avg(sc.score) filter (where a.kind = 'sas') as sas
    from enrollments e
    join students s on s.id = e.student_id and s.status = 'aktif'
    left join assessments a on a.teaching_assignment_id = p_ta and a.term_id = p_term
    left join assessment_scores sc on sc.assessment_id = a.id and sc.student_id = e.student_id
    where e.class_id = v_ta.class_id
    group by e.student_id
  loop
    v_score := case
      when r.slm is not null and r.sas is not null then round(r.slm * (1 - v_w) + r.sas * v_w)
      else round(coalesce(r.slm, r.sas)) end;
    if v_score is null then continue; end if;

    -- Capaian per TP: rata-rata semua penilaian yang mencakup TP tersebut.
    select t.description, avg(sc.score) as avg into v_hi
    from assessments a
    join assessment_scores sc on sc.assessment_id = a.id and sc.student_id = r.student_id
    join learning_objectives t on t.id = any (a.objective_ids)
    where a.teaching_assignment_id = p_ta and a.term_id = p_term
    group by t.id, t.code, t.description order by 2 desc, t.code limit 1;
    select t.description, avg(sc.score) as avg into v_lo
    from assessments a
    join assessment_scores sc on sc.assessment_id = a.id and sc.student_id = r.student_id
    join learning_objectives t on t.id = any (a.objective_ids)
    where a.teaching_assignment_id = p_ta and a.term_id = p_term
    group by t.id, t.code, t.description order by 2 asc, t.code limit 1;

    v_desc := null;
    if v_hi.description is not null then
      v_desc := 'Menunjukkan penguasaan yang ' || case when v_hi.avg >= 90 then 'sangat baik' when v_hi.avg >= v_kktp then 'baik' else 'cukup' end
             || ' dalam ' || v_hi.description || '.';
      if v_lo.description is distinct from v_hi.description then
        v_desc := v_desc || ' ' || case when v_lo.avg < v_kktp then 'Perlu bantuan dalam ' else 'Perlu peningkatan dalam ' end
               || v_lo.description || '.';
      end if;
    end if;

    insert into report_grades (school_id, term_id, teaching_assignment_id, student_id, score, description, updated_by)
    values (v_ta.school_id, p_term, p_ta, r.student_id, v_score, v_desc, auth.uid())
    on conflict (term_id, teaching_assignment_id, student_id) do update
      set score = excluded.score, description = excluded.description, updated_by = excluded.updated_by
      where report_grades.edited = false;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Terbitkan / buka terbitan rapor semester
-- ---------------------------------------------------------------------
create or replace function public.publish_term_reports(p_term uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_term terms; v_n int;
begin
  select * into v_term from terms where id = p_term;
  if v_term.id is null or not public.has_role(v_term.school_id, array['school_admin','principal']::app_role[]) then
    raise exception 'Hanya kepala sekolah atau admin sekolah';
  end if;
  if v_term.published_at is not null then raise exception 'Rapor semester ini sudah diterbitkan'; end if;
  select count(*) into v_n from report_cards where term_id = p_term and status = 'final';
  if v_n = 0 then raise exception 'Belum ada rapor yang difinalkan wali kelas'; end if;
  perform set_config('app.term_publish', 'on', true);
  update terms set published_at = now(), published_by = auth.uid() where id = p_term;

  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select distinct u.user_id, v_term.school_id, 'report.published',
         'Rapor ' || s.full_name || ' sudah terbit',
         'Rapor semester ' || v_term.name || ' bisa dilihat di menu Rapor.', 'report_cards', rc.id
  from report_cards rc
  join students s on s.id = rc.student_id
  cross join lateral (select s.user_id union select gl.guardian_id from guardian_links gl where gl.student_id = s.id) u(user_id)
  where rc.term_id = p_term and rc.status = 'final' and u.user_id is not null;
  return v_n;
end $$;

create or replace function public.unpublish_term_reports(p_term uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_term terms;
begin
  select * into v_term from terms where id = p_term;
  if v_term.id is null or not public.has_role(v_term.school_id, array['school_admin','principal']::app_role[]) then
    raise exception 'Hanya kepala sekolah atau admin sekolah';
  end if;
  perform set_config('app.term_publish', 'on', true);
  update terms set published_at = null, published_by = null where id = p_term;
end $$;

-- Hanya lewat fungsi di atas, agar notifikasi terkirim dan siapa yang menerbitkan tercatat.
create or replace function public.guard_term_publish()
returns trigger language plpgsql as $$
begin
  if (new.published_at, new.published_by) is distinct from (old.published_at, old.published_by)
     and coalesce(current_setting('app.term_publish', true), '') <> 'on' then
    raise exception 'Gunakan tombol Terbitkan rapor';
  end if;
  return new;
end $$;
create trigger terms_publish_guard before update on public.terms
  for each row execute function public.guard_term_publish();

-- ---------------------------------------------------------------------
-- Isi lengkap satu rapor (untuk tampilan & cetak)
-- ---------------------------------------------------------------------
create or replace function public.report_card_view(p_term uuid, p_student uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_term terms; v_student students; v_card report_cards; v_class classes; v_att record; v_school schools;
begin
  select * into v_term from terms where id = p_term;
  select * into v_student from students where id = p_student and school_id = v_term.school_id;
  if v_student.id is null then raise exception 'Rapor tidak ditemukan'; end if;
  if not ((public.is_staff(v_student.school_id) and public.can_view_student(p_student))
          or public.report_visible_to_family(p_term, p_student)) then
    raise exception 'Rapor belum diterbitkan';
  end if;
  select * into v_card from report_cards where term_id = p_term and student_id = p_student;
  select c.* into v_class from classes c
    where c.id = coalesce(v_card.class_id,
      (select e.class_id from enrollments e join classes c2 on c2.id = e.class_id
       where e.student_id = p_student and c2.academic_year_id = v_term.academic_year_id limit 1));
  select * into v_school from schools where id = v_student.school_id;
  if v_card.status = 'final' then
    select v_card.sick as sick, v_card.permit as permit, v_card.absent as absent into v_att;
  else
    select * into v_att from public.term_attendance(p_term, p_student);
  end if;

  return jsonb_build_object(
    'school', jsonb_build_object('name', v_school.name, 'npsn', v_school.npsn, 'address', v_school.address, 'logo_url', v_school.logo_url),
    'term', jsonb_build_object('id', v_term.id, 'name', v_term.name, 'semester', v_term.semester,
      'year', (select name from academic_years where id = v_term.academic_year_id),
      'report_date', v_term.report_date, 'report_place', v_term.report_place, 'published_at', v_term.published_at),
    'student', jsonb_build_object('id', v_student.id, 'full_name', v_student.full_name, 'nis', v_student.nis, 'nisn', v_student.nisn),
    'class', jsonb_build_object('id', v_class.id, 'name', v_class.name, 'grade_level', v_class.grade_level),
    'homeroom', (select full_name from profiles where id = v_class.homeroom_teacher_id),
    'principal', (select p.full_name from memberships m join profiles p on p.id = m.user_id
                  where m.school_id = v_student.school_id and m.role = 'principal' and m.is_active limit 1),
    'card', jsonb_build_object('status', coalesce(v_card.status, 'draft'), 'homeroom_note', v_card.homeroom_note,
      'promotion', v_card.promotion, 'extracurriculars', coalesce(v_card.extracurriculars, '[]'::jsonb),
      'sick', coalesce(v_att.sick, 0), 'permit', coalesce(v_att.permit, 0), 'absent', coalesce(v_att.absent, 0)),
    'kktp', coalesce(nullif(v_school.settings->>'kktp', '')::numeric, 75),
    'grades', coalesce((
      select jsonb_agg(jsonb_build_object('subject', sb.name, 'score', rg.score, 'description', rg.description)
                       order by sb.report_order, sb.name)
      from teaching_assignments ta
      join subjects sb on sb.id = ta.subject_id
      left join report_grades rg on rg.teaching_assignment_id = ta.id and rg.term_id = p_term and rg.student_id = p_student
      where ta.class_id = v_class.id), '[]'::jsonb)
  );
end $$;

-- Kemajuan pengisian rapor per kelas, untuk kepala sekolah & admin.
create or replace function public.term_progress(p_term uuid)
returns table (class_id uuid, class_name text, homeroom text, students int, subjects int, grades_filled int, finals int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, p.full_name,
    (select count(*) from enrollments e join students s on s.id = e.student_id and s.status = 'aktif' where e.class_id = c.id)::int,
    (select count(*) from teaching_assignments ta where ta.class_id = c.id)::int,
    (select count(*) from report_grades rg join teaching_assignments ta on ta.id = rg.teaching_assignment_id
      where ta.class_id = c.id and rg.term_id = p_term and rg.score is not null)::int,
    (select count(*) from report_cards rc where rc.class_id = c.id and rc.term_id = p_term and rc.status = 'final')::int
  from terms t
  join classes c on c.academic_year_id = t.academic_year_id
  left join profiles p on p.id = c.homeroom_teacher_id
  where t.id = p_term and public.is_school_manager(t.school_id)
  order by c.grade_level, c.name
$$;
