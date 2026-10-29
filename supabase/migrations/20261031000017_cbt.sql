-- =====================================================================
-- SekolahApp · 0017 · Ujian online (CBT)
-- Guru membuat ujian untuk satu mapel di satu kelas: jadwal, durasi,
-- token, acak soal & pilihan. Soal: pilihan ganda, pilihan ganda
-- kompleks, benar/salah, isian singkat, dan uraian (dinilai guru).
-- Murid mengerjakan lewat RPC saja: kunci jawaban dan nilai per soal
-- tidak pernah terbaca murid selama ujian berlangsung. Nilai bisa
-- dikirim ke Penilaian (E-Rapor) sebagai formatif/sumatif.
-- =====================================================================

update public.plans set modules = array_append(modules, 'cbt')
 where tier in ('pro', 'enterprise') and not ('cbt' = any(modules));

create or replace function public.module_label(p_module text)
returns text language sql immutable as $$
  select case p_module
    when 'staff' then 'Absen & cuti guru'
    when 'finance' then 'SPP & pembayaran'
    when 'grades' then 'Penilaian & rapor'
    when 'counseling' then 'BK & catatan sikap'
    when 'dashboard' then 'Dasbor kepala sekolah'
    when 'foundation' then 'Dasbor yayasan'
    when 'ppdb' then 'PPDB online'
    when 'cbt' then 'Ujian online (CBT)'
    else p_module end
$$;

-- ---------------------------------------------------------------------
-- Ujian
-- ---------------------------------------------------------------------
create table public.exams (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools(id) on delete cascade,
  teaching_assignment_id uuid not null references public.teaching_assignments(id) on delete cascade,
  title                  text not null check (length(title) between 3 and 150),
  instructions           text check (length(instructions) <= 4000),
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  duration_minutes       smallint not null check (duration_minutes between 5 and 600),
  token                  text check (token ~ '^[A-Z0-9]{4,10}$'),   -- dibacakan guru di kelas; kosong = tanpa token
  shuffle_questions      boolean not null default true,
  shuffle_options        boolean not null default true,
  show_score             boolean not null default true,   -- murid melihat nilai akhir setelah selesai
  show_review            boolean not null default false,  -- murid melihat pembahasan setelah ujian ditutup
  is_published           boolean not null default false,
  assessment_id          uuid references public.assessments(id) on delete set null,
  created_by             uuid references public.profiles(id) default auth.uid(),
  created_at             timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.exams (teaching_assignment_id, starts_at desc);
create trigger exams_same_school before insert or update on public.exams
  for each row execute function public.assert_same_school('teaching_assignments', 'teaching_assignment_id');
create trigger exams_module before insert on public.exams
  for each row execute function public.require_module('cbt');

create type public.exam_question_kind as enum ('pg', 'pg_kompleks', 'benar_salah', 'isian', 'uraian');

create table public.exam_questions (
  id          uuid primary key default gen_random_uuid(),
  exam_id     uuid not null references public.exams(id) on delete cascade,
  school_id   uuid not null references public.schools(id) on delete cascade,
  position    integer not null default 0,
  kind        public.exam_question_kind not null,
  prompt      text not null check (length(prompt) between 1 and 5000),
  image_path  text,                        -- bucket exam-media: <school>/<exam>/<berkas>
  options     jsonb,                       -- ["teks A", "teks B", ...] untuk pg & pg_kompleks
  answer      jsonb,                       -- pg: indeks; pg_kompleks: [indeks]; benar_salah: true/false; isian: ["jawaban"]; uraian: null
  points      numeric(6,2) not null default 1 check (points > 0 and points <= 100),
  explanation text check (length(explanation) <= 4000),
  created_at  timestamptz not null default now()
);
create index on public.exam_questions (exam_id, position);
create trigger exam_questions_same_school before insert or update on public.exam_questions
  for each row execute function public.assert_same_school('exams', 'exam_id');

create table public.exam_attempts (
  id             uuid primary key default gen_random_uuid(),
  exam_id        uuid not null references public.exams(id) on delete cascade,
  school_id      uuid not null references public.schools(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  started_at     timestamptz not null default now(),
  deadline_at    timestamptz not null,
  submitted_at   timestamptz,
  question_order uuid[] not null,
  option_orders  jsonb not null default '{}'::jsonb,   -- {question_id: [indeks asli sesuai urutan tampil]}
  answers        jsonb not null default '{}'::jsonb,   -- {question_id: jawaban}; indeks pilihan selalu indeks asli
  flagged        uuid[] not null default '{}',         -- soal yang ditandai ragu-ragu
  manual_points  jsonb not null default '{}'::jsonb,   -- {question_id: skor} uraian dari guru
  points         jsonb,                                -- {question_id: skor} hasil penilaian
  score          numeric(5,2),                         -- 0–100
  needs_review   boolean not null default false,       -- ada uraian yang belum dinilai
  leave_count    integer not null default 0,           -- berapa kali murid meninggalkan halaman ujian
  unique (exam_id, student_id)
);
create index on public.exam_attempts (student_id);

-- Guru pengampu (atau pengelola sekolah) yang boleh mengatur ujian ini.
create or replace function public.can_manage_exam(p_exam uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from exams e where e.id = p_exam and public.can_grade(e.teaching_assignment_id))
$$;

-- Murid yang terdaftar di kelas ujian ini (akun saat ini).
create or replace function public.cbt_my_student(p_exam uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id from exams e
    join teaching_assignments ta on ta.id = e.teaching_assignment_id
    join enrollments en on en.class_id = ta.class_id
    join students s on s.id = en.student_id
   where e.id = p_exam and s.user_id = auth.uid()
   limit 1
$$;

-- Ujian hanya bisa diterbitkan bila sudah ada soal; mapel/kelas tidak bisa dipindah.
create or replace function public.guard_exam()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.teaching_assignment_id <> old.teaching_assignment_id then
    raise exception 'Mapel dan kelas ujian tidak bisa diganti. Buat ujian baru.';
  end if;
  if new.is_published and not exists (select 1 from exam_questions where exam_id = new.id) then
    raise exception 'Tambahkan soal dulu sebelum menerbitkan ujian';
  end if;
  return new;
end $$;
create trigger exams_guard before insert or update on public.exams
  for each row execute function public.guard_exam();

create or replace function public.guard_exam_delete()
returns trigger language plpgsql as $$
begin
  -- Terhapus ikut sekolah/mapel (cascade) tetap diizinkan.
  if pg_trigger_depth() = 1 and exists (select 1 from exam_attempts where exam_id = old.id) then
    raise exception 'Ujian yang sudah dikerjakan murid tidak bisa dihapus. Batalkan terbitnya saja.';
  end if;
  return old;
end $$;
create trigger exams_guard_delete before delete on public.exams
  for each row execute function public.guard_exam_delete();

-- Pemberitahuan ke murid saat ujian diterbitkan.
create or replace function public.notify_exam_published()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_subject text;
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    select sb.name into v_subject from teaching_assignments ta join subjects sb on sb.id = ta.subject_id
     where ta.id = new.teaching_assignment_id;
    insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
    select s.user_id, new.school_id, 'exam.scheduled', 'Ujian ' || v_subject || ': ' || new.title,
           'Dibuka ' || to_char(new.starts_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB, durasi '
             || new.duration_minutes || ' menit',
           'exams', new.id
      from enrollments e join students s on s.id = e.student_id
     where e.class_id = public.class_of_ta(new.teaching_assignment_id) and s.user_id is not null;
  end if;
  return new;
end $$;
create trigger exams_notify after insert or update of is_published on public.exams
  for each row execute function public.notify_exam_published();

-- Bentuk soal & kunci jawaban harus sesuai jenisnya.
create or replace function public.guard_exam_question()
returns trigger language plpgsql as $$
declare v_n int; v_bad boolean;
begin
  if tg_op <> 'INSERT' then
    if pg_trigger_depth() = 1 and exists (select 1 from exam_attempts where exam_id = old.exam_id)
       and (tg_op = 'DELETE' or new.kind <> old.kind) then
      raise exception 'Ujian sudah dikerjakan murid: soal tidak bisa dihapus atau diganti jenisnya. Kunci jawaban dan bobot masih bisa diperbaiki.';
    end if;
    if tg_op = 'DELETE' then return old; end if;
  elsif exists (select 1 from exam_attempts where exam_id = new.exam_id) then
    raise exception 'Ujian sudah dikerjakan murid: soal tidak bisa ditambah';
  end if;

  if new.kind in ('pg', 'pg_kompleks') then
    if jsonb_typeof(new.options) is distinct from 'array' then raise exception 'Pilihan jawaban wajib diisi'; end if;
    v_n := jsonb_array_length(new.options);
    if v_n < 2 or v_n > 8 then raise exception 'Pilihan jawaban 2 sampai 8'; end if;
    if exists (select 1 from jsonb_array_elements(new.options) o
                where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' or length(o #>> '{}') > 1000) then
      raise exception 'Setiap pilihan jawaban harus berisi teks';
    end if;
    if new.kind = 'pg' then
      if jsonb_typeof(new.answer) is distinct from 'number' or (new.answer)::text !~ '^\d+$' or (new.answer)::int >= v_n then
        raise exception 'Pilih satu kunci jawaban';
      end if;
    else
      if jsonb_typeof(new.answer) is distinct from 'array' or jsonb_array_length(new.answer) = 0 then
        raise exception 'Pilih minimal satu kunci jawaban';
      end if;
      select bool_or(jsonb_typeof(x) <> 'number' or x::text !~ '^\d+$' or x::int >= v_n) into v_bad from jsonb_array_elements(new.answer) x;
      if v_bad or (select count(distinct x) from jsonb_array_elements(new.answer) x) <> jsonb_array_length(new.answer) then
        raise exception 'Kunci jawaban tidak valid';
      end if;
    end if;
  else
    new.options := null;
    if new.kind = 'benar_salah' and jsonb_typeof(new.answer) is distinct from 'boolean' then
      raise exception 'Pilih kunci Benar atau Salah';
    elsif new.kind = 'isian' then
      if jsonb_typeof(new.answer) is distinct from 'array' or jsonb_array_length(new.answer) not between 1 and 10
         or exists (select 1 from jsonb_array_elements(new.answer) x where jsonb_typeof(x) <> 'string' or btrim(x #>> '{}') = '') then
        raise exception 'Isi 1 sampai 10 jawaban yang diterima';
      end if;
    elsif new.kind = 'uraian' then
      new.answer := null;
    end if;
  end if;
  return new;
end $$;
create trigger exam_questions_guard before insert or update or delete on public.exam_questions
  for each row execute function public.guard_exam_question();

alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;

-- Tabel ujian, soal, dan jawaban hanya dibaca guru pengampu & pengelola.
-- Murid memakai cbt_my_exams / cbt_paper / cbt_result sehingga token,
-- kunci jawaban, dan skor per soal tidak bocor.
create policy exams_read on public.exams for select using (public.can_grade(teaching_assignment_id));
create policy exams_write on public.exams for all
  using (public.can_grade(teaching_assignment_id)) with check (public.can_grade(teaching_assignment_id));
create policy exam_questions_rw on public.exam_questions for all
  using (public.can_manage_exam(exam_id)) with check (public.can_manage_exam(exam_id));
create policy exam_attempts_read on public.exam_attempts for select using (public.can_manage_exam(exam_id));

-- ---------------------------------------------------------------------
-- Gambar soal
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('exam-media', 'exam-media', false, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Murid boleh melihat gambar soal sejak ujian dibuka.
create or replace function public.can_view_exam_media(p_exam uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_exam(p_exam)
      or exists (select 1 from exams e where e.id = p_exam and e.is_published and now() >= e.starts_at
                   and public.cbt_my_student(e.id) is not null)
$$;

create policy "exam media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'exam-media' and public.can_manage_exam(public.try_uuid((storage.foldername(name))[2]))
              and exists (select 1 from public.exams e where e.id = public.try_uuid((storage.foldername(name))[2])
                            and e.school_id = public.try_uuid((storage.foldername(name))[1])));
create policy "exam media read" on storage.objects for select to authenticated
  using (bucket_id = 'exam-media' and public.can_view_exam_media(public.try_uuid((storage.foldername(name))[2])));
create policy "exam media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exam-media' and public.can_manage_exam(public.try_uuid((storage.foldername(name))[2])));

-- ---------------------------------------------------------------------
-- Penilaian otomatis
-- ---------------------------------------------------------------------
create or replace function public.cbt_norm(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.cbt_is_correct(q public.exam_questions, a jsonb)
returns boolean language sql immutable as $$
  select case q.kind
    when 'pg' then jsonb_typeof(a) = 'number' and a = q.answer
    when 'pg_kompleks' then jsonb_typeof(a) = 'array'
      and (select array_agg(x::int order by x::int) from jsonb_array_elements_text(a) x)
        = (select array_agg(x::int order by x::int) from jsonb_array_elements_text(q.answer) x)
    when 'benar_salah' then a = q.answer
    when 'isian' then jsonb_typeof(a) = 'string'
      and exists (select 1 from jsonb_array_elements_text(q.answer) k where public.cbt_norm(k) = public.cbt_norm(a #>> '{}'))
    else false end
$$;

-- Menghitung skor satu pengerjaan yang sudah dikumpulkan.
create or replace function public.cbt_score_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t exam_attempts; q exam_questions; v_ans jsonb; v_got numeric;
  v_pts jsonb := '{}'::jsonb; v_total numeric := 0; v_max numeric := 0; v_pending boolean := false;
begin
  select * into t from exam_attempts where id = p_attempt for update;
  if t.submitted_at is null then return; end if;
  for q in select * from exam_questions where exam_id = t.exam_id loop
    v_max := v_max + q.points;
    v_ans := t.answers -> q.id::text;
    if q.kind = 'uraian' then
      v_got := (t.manual_points ->> q.id::text)::numeric;
      if v_got is null then
        if coalesce(btrim(v_ans #>> '{}'), '') = '' then v_got := 0; else v_pending := true; end if;
      end if;
    else
      v_got := case when public.cbt_is_correct(q, v_ans) then q.points else 0 end;
    end if;
    if v_got is not null then
      v_pts := v_pts || jsonb_build_object(q.id::text, v_got);
      v_total := v_total + v_got;
    end if;
  end loop;
  update exam_attempts set points = v_pts, needs_review = v_pending,
         score = case when v_max > 0 then round(v_total / v_max * 100, 2) else 0 end
   where id = p_attempt;
end $$;

-- Mengumpulkan pengerjaan (oleh murid, atau otomatis saat waktu habis).
create or replace function public.cbt_finish(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update exam_attempts set submitted_at = least(now(), deadline_at)
   where id = p_attempt and submitted_at is null;
  perform public.cbt_score_attempt(p_attempt);
end $$;

-- Pengerjaan yang waktunya sudah habis dikumpulkan otomatis (diberi kelonggaran 1 menit untuk jaringan lambat).
create or replace function public.cbt_close_expired(p_exam uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not public.can_manage_exam(p_exam) then raise exception 'Hanya guru pengampu yang bisa menutup ujian'; end if;
  for r in select id from exam_attempts where exam_id = p_exam and submitted_at is null and deadline_at + interval '1 minute' < now() loop
    perform public.cbt_finish(r.id); n := n + 1;
  end loop;
  return n;
end $$;

-- Kunci jawaban atau bobot diperbaiki → nilai semua pengerjaan dihitung ulang.
create or replace function public.rescore_exam_question()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.answer is distinct from old.answer or new.points <> old.points then
    for r in select id from exam_attempts where exam_id = new.exam_id and submitted_at is not null loop
      perform public.cbt_score_attempt(r.id);
    end loop;
  end if;
  return null;
end $$;
create trigger exam_questions_rescore after update on public.exam_questions
  for each row execute function public.rescore_exam_question();

-- ---------------------------------------------------------------------
-- RPC murid
-- ---------------------------------------------------------------------
-- Pengerjaan milik murid saat ini; waktu habis → dikumpulkan otomatis.
create or replace function public.cbt_own_attempt(p_attempt uuid)
returns public.exam_attempts language plpgsql security definer set search_path = public as $$
declare t exam_attempts;
begin
  select a.* into t from exam_attempts a join students s on s.id = a.student_id
   where a.id = p_attempt and s.user_id = auth.uid();
  if t.id is null then raise exception 'Pengerjaan ujian tidak ditemukan'; end if;
  if t.submitted_at is null and t.deadline_at + interval '1 minute' < now() then
    perform public.cbt_finish(t.id);
    select * into t from exam_attempts where id = p_attempt;
  end if;
  return t;
end $$;

-- Daftar ujian untuk murid: jadwal, status pengerjaan, dan nilai bila boleh dilihat.
create or replace function public.cbt_my_exams()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select a.id from exam_attempts a join students s on s.id = a.student_id
            where s.user_id = auth.uid() and a.submitted_at is null and a.deadline_at + interval '1 minute' < now() loop
    perform public.cbt_finish(r.id);
  end loop;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'subject', sb.name, 'class', c.name, 'teacher', p.full_name,
      'starts_at', e.starts_at, 'ends_at', e.ends_at, 'duration_minutes', e.duration_minutes,
      'has_token', e.token is not null, 'question_count', (select count(*) from exam_questions q where q.exam_id = e.id),
      'attempt_id', a.id, 'started_at', a.started_at, 'deadline_at', a.deadline_at, 'submitted_at', a.submitted_at,
      'score', case when e.show_score and a.submitted_at is not null and not a.needs_review then a.score end,
      'needs_review', coalesce(a.needs_review, false),
      'review_open', e.show_review and a.submitted_at is not null and now() > e.ends_at
    ) order by e.starts_at desc)
    from exams e
      join teaching_assignments ta on ta.id = e.teaching_assignment_id
      join subjects sb on sb.id = ta.subject_id
      join classes c on c.id = ta.class_id
      join enrollments en on en.class_id = ta.class_id
      join students s on s.id = en.student_id and s.user_id = auth.uid()
      left join profiles p on p.id = ta.teacher_id
      left join exam_attempts a on a.exam_id = e.id and a.student_id = s.id
    where e.is_published and public.school_has_module(e.school_id, 'cbt')), '[]'::jsonb);
end $$;

-- Mulai (atau lanjutkan) mengerjakan ujian.
create or replace function public.cbt_start(p_exam uuid, p_token text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare e exams; v_student uuid; t exam_attempts; v_id uuid; v_order uuid[]; v_opts jsonb := '{}'::jsonb; q record;
begin
  select * into e from exams where id = p_exam and is_published;
  v_student := public.cbt_my_student(p_exam);
  if e.id is null or v_student is null then raise exception 'Ujian tidak ditemukan'; end if;
  if not public.school_has_module(e.school_id, 'cbt') then raise exception 'Ujian online belum termasuk paket sekolah'; end if;

  select * into t from exam_attempts where exam_id = p_exam and student_id = v_student;
  if t.id is not null then
    -- Lanjutkan di perangkat mana pun tanpa token ulang; yang waktunya habis langsung dikumpulkan.
    if t.submitted_at is null and t.deadline_at + interval '1 minute' < now() then perform public.cbt_finish(t.id); end if;
    return t.id;
  end if;

  if now() < e.starts_at then raise exception 'Ujian belum dibuka'; end if;
  if now() >= e.ends_at then raise exception 'Waktu ujian sudah berakhir'; end if;
  if e.token is not null and upper(btrim(coalesce(p_token, ''))) <> e.token then
    raise exception 'Token ujian salah. Tanyakan token ke guru pengawas.';
  end if;

  select array_agg(id order by case when e.shuffle_questions then random() end, position, created_at) into v_order
    from exam_questions where exam_id = p_exam;
  if v_order is null then raise exception 'Ujian ini belum punya soal'; end if;
  for q in select id, jsonb_array_length(options) n from exam_questions
            where exam_id = p_exam and kind in ('pg', 'pg_kompleks') loop
    v_opts := v_opts || jsonb_build_object(q.id::text, (
      select jsonb_agg(i order by case when e.shuffle_options then random() end, i) from generate_series(0, q.n - 1) i));
  end loop;

  insert into exam_attempts (exam_id, school_id, student_id, deadline_at, question_order, option_orders)
  values (p_exam, e.school_id, v_student, least(now() + make_interval(mins => e.duration_minutes), e.ends_at), v_order, v_opts)
  returning id into v_id;
  return v_id;
end $$;

-- Lembar ujian: soal (tanpa kunci) sesuai urutan acak milik murid, beserta jawabannya sejauh ini.
create or replace function public.cbt_paper(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t exam_attempts; v_exam jsonb;
begin
  t := public.cbt_own_attempt(p_attempt);
  select jsonb_build_object('id', e.id, 'title', e.title, 'instructions', e.instructions, 'subject', sb.name,
                            'class', c.name, 'duration_minutes', e.duration_minutes, 'ends_at', e.ends_at)
    into v_exam
    from exams e join teaching_assignments ta on ta.id = e.teaching_assignment_id
    join subjects sb on sb.id = ta.subject_id join classes c on c.id = ta.class_id
   where e.id = t.exam_id;
  return jsonb_build_object(
    'attempt', jsonb_build_object('id', t.id, 'started_at', t.started_at, 'deadline_at', t.deadline_at,
                                  'submitted_at', t.submitted_at, 'server_now', now()),
    'exam', v_exam,
    'questions', case when t.submitted_at is null then (
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'no', o.n, 'kind', q.kind, 'prompt', q.prompt, 'image_path', q.image_path,
        'options', (select jsonb_agg(jsonb_build_object('i', i::int, 'text', q.options -> i::int) order by k)
                      from jsonb_array_elements_text(t.option_orders -> q.id::text) with ordinality x(i, k)),
        'answer', t.answers -> q.id::text,
        'flagged', q.id = any(t.flagged)
      ) order by o.n)
      from unnest(t.question_order) with ordinality o(qid, n) join exam_questions q on q.id = o.qid) end);
end $$;

-- Menyimpan jawaban satu soal (dipanggil setiap murid memilih/mengetik).
-- false = waktu habis dan jawaban sudah dikumpulkan (tidak dilempar sebagai galat agar pengumpulan otomatis tersimpan).
create or replace function public.cbt_answer(p_attempt uuid, p_question uuid, p_answer jsonb, p_flagged boolean default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare t exam_attempts; q exam_questions; v_ok boolean;
begin
  t := public.cbt_own_attempt(p_attempt);
  if t.submitted_at is not null then return false; end if;
  select * into q from exam_questions where id = p_question and exam_id = t.exam_id;
  if q.id is null then raise exception 'Soal tidak ditemukan'; end if;
  if p_answer is null or p_answer = 'null'::jsonb then
    v_ok := true;
  else
    v_ok := case q.kind
      when 'pg' then jsonb_typeof(p_answer) = 'number' and p_answer::text ~ '^\d+$' and p_answer::int < jsonb_array_length(q.options)
      when 'pg_kompleks' then jsonb_typeof(p_answer) = 'array' and jsonb_array_length(p_answer) <= jsonb_array_length(q.options)
        and not exists (select 1 from jsonb_array_elements(p_answer) x
                         where jsonb_typeof(x) <> 'number' or x::text !~ '^\d+$' or x::int >= jsonb_array_length(q.options))
      when 'benar_salah' then jsonb_typeof(p_answer) = 'boolean'
      when 'isian' then jsonb_typeof(p_answer) = 'string' and length(p_answer #>> '{}') <= 500
      when 'uraian' then jsonb_typeof(p_answer) = 'string' and length(p_answer #>> '{}') <= 10000
    end;
  end if;
  if not v_ok then raise exception 'Format jawaban tidak sesuai jenis soal'; end if;
  update exam_attempts set
    answers = case when p_answer is null or p_answer = 'null'::jsonb then answers - p_question::text
                   else answers || jsonb_build_object(p_question::text, p_answer) end,
    flagged = case when p_flagged is null then flagged
                   when p_flagged then array_append(array_remove(flagged, p_question), p_question)
                   else array_remove(flagged, p_question) end
   where id = t.id;
  return true;
end $$;

create or replace function public.cbt_submit(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t exam_attempts;
begin
  t := public.cbt_own_attempt(p_attempt);
  perform public.cbt_finish(t.id);
end $$;

-- Murid berpindah aplikasi/tab saat ujian: dicatat untuk guru pengawas.
create or replace function public.cbt_log_leave(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t exam_attempts;
begin
  t := public.cbt_own_attempt(p_attempt);
  if t.submitted_at is null then update exam_attempts set leave_count = leave_count + 1 where id = t.id; end if;
end $$;

-- Hasil & pembahasan. Murid: nilai bila guru mengizinkan; pembahasan setelah ujian ditutup.
-- Guru pengampu selalu melihat semuanya.
create or replace function public.cbt_result(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t exam_attempts; e exams; v_staff boolean; v_score boolean; v_review boolean;
begin
  select * into t from exam_attempts where id = p_attempt;
  if t.id is null then raise exception 'Pengerjaan ujian tidak ditemukan'; end if;
  v_staff := public.can_manage_exam(t.exam_id);
  if not v_staff then
    t := public.cbt_own_attempt(p_attempt);
  elsif t.submitted_at is null and t.deadline_at + interval '1 minute' < now() then
    perform public.cbt_finish(t.id);
    select * into t from exam_attempts where id = p_attempt;
  end if;
  select * into e from exams where id = t.exam_id;
  v_score := v_staff or (e.show_score and t.submitted_at is not null and not t.needs_review);
  v_review := v_staff or (e.show_review and t.submitted_at is not null and now() > e.ends_at);
  return jsonb_build_object(
    'attempt_id', t.id, 'exam_id', e.id, 'title', e.title, 'ends_at', e.ends_at,
    'student', (select jsonb_build_object('id', s.id, 'full_name', s.full_name, 'nis', s.nis) from students s where s.id = t.student_id),
    'started_at', t.started_at, 'submitted_at', t.submitted_at, 'leave_count', t.leave_count,
    'needs_review', t.needs_review,
    'score', case when v_score then t.score end,
    'answered', (select count(*) from jsonb_object_keys(t.answers)),
    'total', cardinality(t.question_order),
    'review', case when v_review and t.submitted_at is not null then (
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'no', o.n, 'kind', q.kind, 'prompt', q.prompt, 'image_path', q.image_path,
        'options', q.options, 'key', q.answer, 'explanation', q.explanation, 'max', q.points,
        'answer', t.answers -> q.id::text, 'points', t.points -> q.id::text,
        'manual', t.manual_points -> q.id::text
      ) order by o.n)
      from unnest(t.question_order) with ordinality o(qid, n) join exam_questions q on q.id = o.qid) end);
end $$;

-- ---------------------------------------------------------------------
-- RPC guru
-- ---------------------------------------------------------------------
-- Nilai soal uraian (atau mengosongkannya kembali dengan null).
create or replace function public.cbt_grade(p_attempt uuid, p_question uuid, p_points numeric)
returns void language plpgsql security definer set search_path = public as $$
declare t exam_attempts; q exam_questions;
begin
  select * into t from exam_attempts where id = p_attempt;
  if t.id is null or not public.can_manage_exam(t.exam_id) then raise exception 'Hanya guru pengampu yang bisa menilai'; end if;
  if t.submitted_at is null then raise exception 'Murid belum mengumpulkan jawaban'; end if;
  select * into q from exam_questions where id = p_question and exam_id = t.exam_id;
  if q.kind is distinct from 'uraian' then raise exception 'Hanya soal uraian yang dinilai manual'; end if;
  if p_points is not null and (p_points < 0 or p_points > q.points) then
    raise exception 'Skor soal ini 0 sampai %', q.points;
  end if;
  update exam_attempts set manual_points = case when p_points is null then manual_points - p_question::text
                                                else manual_points || jsonb_build_object(p_question::text, p_points) end
   where id = p_attempt;
  perform public.cbt_score_attempt(p_attempt);
end $$;

-- Mengulang ujian seorang murid (misal listrik padam): pengerjaannya dihapus.
create or replace function public.cbt_reset_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t exam_attempts; e exams;
begin
  select * into t from exam_attempts where id = p_attempt;
  if t.id is null or not public.can_manage_exam(t.exam_id) then raise exception 'Hanya guru pengampu yang bisa mengulang ujian murid'; end if;
  select * into e from exams where id = t.exam_id;
  delete from exam_attempts where id = p_attempt;
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select s.user_id, t.school_id, 'exam.reset', 'Ujian diulang: ' || e.title,
         case when now() < e.ends_at then 'Guru mengizinkan Anda mengerjakan ulang. Mulai lagi sebelum '
                || to_char(e.ends_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') || ' WIB.'
              else 'Guru menghapus pengerjaan Anda. Perpanjang jadwal ujian agar bisa dikerjakan ulang.' end,
         'exams', e.id
    from students s where s.id = t.student_id and s.user_id is not null;
end $$;

-- Mengirim nilai ujian ke Penilaian (E-Rapor). Murid yang tidak ikut tidak diberi nilai.
create or replace function public.cbt_send_to_grades(p_exam uuid, p_term uuid, p_kind public.assessment_kind)
returns integer language plpgsql security definer set search_path = public as $$
declare e exams; v_assessment uuid; v_pending int; v_n int;
begin
  select * into e from exams where id = p_exam;
  if e.id is null or not public.can_manage_exam(p_exam) then raise exception 'Hanya guru pengampu yang bisa mengirim nilai'; end if;
  perform public.cbt_close_expired(p_exam);
  if exists (select 1 from exam_attempts where exam_id = p_exam and submitted_at is null) then
    raise exception 'Masih ada murid yang sedang mengerjakan';
  end if;
  select count(*) into v_pending from exam_attempts where exam_id = p_exam and needs_review;
  if v_pending > 0 then raise exception 'Masih ada % jawaban uraian yang belum dinilai', v_pending; end if;
  if not exists (select 1 from terms where id = p_term and school_id = e.school_id) then raise exception 'Semester tidak ditemukan'; end if;

  v_assessment := e.assessment_id;
  if v_assessment is not null and not exists (select 1 from assessments where id = v_assessment and term_id = p_term) then
    delete from assessments where id = v_assessment;   -- pindah semester: penilaian lama dihapus
    v_assessment := null;
  end if;
  if v_assessment is null then
    insert into assessments (school_id, teaching_assignment_id, term_id, kind, title, held_on)
    values (e.school_id, e.teaching_assignment_id, p_term, p_kind, e.title, (e.starts_at at time zone 'Asia/Jakarta')::date)
    returning id into v_assessment;
    update exams set assessment_id = v_assessment where id = p_exam;
  else
    update assessments set kind = p_kind, title = e.title where id = v_assessment and (kind <> p_kind or title <> e.title);
  end if;

  insert into assessment_scores (assessment_id, student_id, school_id, score)
  select v_assessment, student_id, school_id, score from exam_attempts where exam_id = p_exam and score is not null
  on conflict (assessment_id, student_id) do update set score = excluded.score;
  get diagnostics v_n = row_count;
  delete from assessment_scores s where s.assessment_id = v_assessment
     and not exists (select 1 from exam_attempts a where a.exam_id = p_exam and a.student_id = s.student_id);
  return v_n;
end $$;

revoke execute on function public.cbt_score_attempt(uuid), public.cbt_finish(uuid), public.cbt_own_attempt(uuid)
  from public, anon, authenticated;
revoke execute on function public.cbt_my_exams(), public.cbt_start(uuid, text), public.cbt_paper(uuid),
  public.cbt_answer(uuid, uuid, jsonb, boolean), public.cbt_submit(uuid), public.cbt_log_leave(uuid), public.cbt_result(uuid),
  public.cbt_grade(uuid, uuid, numeric), public.cbt_reset_attempt(uuid), public.cbt_close_expired(uuid),
  public.cbt_send_to_grades(uuid, uuid, public.assessment_kind)
  from public, anon;
grant execute on function public.cbt_my_exams(), public.cbt_start(uuid, text), public.cbt_paper(uuid),
  public.cbt_answer(uuid, uuid, jsonb, boolean), public.cbt_submit(uuid), public.cbt_log_leave(uuid), public.cbt_result(uuid),
  public.cbt_grade(uuid, uuid, numeric), public.cbt_reset_attempt(uuid), public.cbt_close_expired(uuid),
  public.cbt_send_to_grades(uuid, uuid, public.assessment_kind)
  to authenticated;
