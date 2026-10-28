-- =====================================================================
-- SekolahApp · 0011 · Mode tanpa ponsel
-- Kartu pelajar ber-QR + absen lewat kios, tugas kertas dinilai guru,
-- dan pengaturan sekolah tentang penggunaan aplikasi oleh murid.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pengaturan: settings->>'student_app_mode'
--   'full'            murid absen sendiri dan mengerjakan tugas di aplikasi (bawaan)
--   'no_self_checkin' murid tetap memakai aplikasi, tetapi absen hanya lewat kartu/guru
--   'off'             murid tidak memakai aplikasi; info tugas & nilai dikirim ke orang tua
-- ---------------------------------------------------------------------
create or replace function public.student_app_mode(p_school uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select settings->>'student_app_mode' from schools where id = p_school), 'full')
$$;

create or replace function public.guard_student_app_mode()
returns trigger language plpgsql as $$
begin
  if new.settings ? 'student_app_mode'
     and new.settings->>'student_app_mode' not in ('full', 'no_self_checkin', 'off') then
    raise exception 'Mode aplikasi murid tidak dikenal';
  end if;
  return new;
end $$;
create trigger schools_student_app_mode before insert or update of settings on public.schools
  for each row execute function public.guard_student_app_mode();

-- ---------------------------------------------------------------------
-- Kartu pelajar: token acak di QR (tidak bisa ditebak dari NIS)
-- ---------------------------------------------------------------------
alter table public.students
  add column card_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index students_card_token_key on public.students (card_token);

-- Kartu hilang: buat token baru, kartu lama otomatis tidak berlaku.
create or replace function public.reset_student_card(p_student uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_school uuid; v_token text;
begin
  select school_id into v_school from students where id = p_student;
  if v_school is null or not public.has_role(v_school, array['school_admin']::app_role[]) then
    raise exception 'Hanya admin sekolah yang dapat mengganti kartu';
  end if;
  update students set card_token = replace(gen_random_uuid()::text, '-', '')
   where id = p_student returning card_token into v_token;
  return v_token;
end $$;

-- ---------------------------------------------------------------------
-- Absen lewat kartu di kios (tablet gerbang/kelas, laptop + pemindai USB, atau HP guru)
-- ---------------------------------------------------------------------
alter type public.attendance_method add value if not exists 'card';
alter table public.student_attendance add column checked_out_at timestamptz;

create or replace function public.card_scan(p_code text, p_direction text default 'in')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_token text := lower(regexp_replace(trim(p_code), '^sekolahapp:card:', '', 'i'));
  s students; v_class uuid; v_class_name text; v_today date; v_row student_attendance;
  v_dup boolean := false; v_time text; v_title text;
begin
  if p_direction not in ('in', 'out') then raise exception 'Arah absen tidak dikenal'; end if;
  select * into s from students where card_token = v_token;
  if s.id is null then raise exception 'Kartu tidak dikenal'; end if;
  if not public.has_role(s.school_id, array['school_admin','principal','teacher','counselor','finance']::app_role[]) then
    raise exception 'Kartu tidak dikenal';   -- jangan bocorkan murid sekolah lain
  end if;
  if s.status <> 'aktif' then raise exception '% tidak berstatus aktif', s.full_name; end if;
  v_class := public.current_class_of(s.id);
  if v_class is null then raise exception '% belum terdaftar di kelas tahun ajaran aktif', s.full_name; end if;
  select name into v_class_name from classes where id = v_class;
  v_today := public.school_today(s.school_id);

  select * into v_row from student_attendance
   where student_id = s.id and date = v_today and teaching_assignment_id is null for update;

  if p_direction = 'in' then
    if v_row.id is null then
      insert into student_attendance (school_id, student_id, class_id, date, status, method, checked_in_at, recorded_by)
      values (s.school_id, s.id, v_class, v_today,
              case when public.is_late_now(s.school_id) then 'terlambat' else 'hadir' end::attendance_status,
              'card', now(), auth.uid())
      returning * into v_row;
    elsif v_row.checked_in_at is not null then
      v_dup := true;
    elsif v_row.status = 'alpa' then
      -- Absensi kelas sudah ditutup tetapi murid ternyata datang: jadi terlambat.
      update student_attendance set status = 'terlambat', method = 'card', checked_in_at = now(), recorded_by = auth.uid()
       where id = v_row.id returning * into v_row;
    else
      -- Sudah dicatat guru (hadir/izin/sakit): status dipertahankan, jam tiba dicatat.
      update student_attendance set checked_in_at = now() where id = v_row.id returning * into v_row;
    end if;
  else
    if v_row.id is null or v_row.checked_in_at is null and v_row.status not in ('hadir', 'terlambat') then
      raise exception '% belum absen masuk hari ini', s.full_name;
    end if;
    if v_row.checked_out_at is not null then
      v_dup := true;
    else
      update student_attendance set checked_out_at = now() where id = v_row.id returning * into v_row;
    end if;
  end if;

  if not v_dup then
    v_time := to_char(now() at time zone coalesce((select timezone from schools where id = s.school_id), 'Asia/Jakarta'), 'HH24:MI');
    v_title := case when p_direction = 'in' then s.full_name || ' tiba di sekolah'
                    else s.full_name || ' pulang sekolah' end;
    insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
    select g.guardian_id, s.school_id,
           case when p_direction = 'in' then 'attendance.arrived' else 'attendance.left' end,
           v_title,
           'Tercatat pukul ' || v_time ||
             case when p_direction = 'in' and v_row.status = 'terlambat' then ' (terlambat).' else '.' end,
           'students', s.id
    from guardian_links g where g.student_id = s.id;
  end if;

  return jsonb_build_object(
    'student_id', s.id, 'full_name', s.full_name, 'nis', s.nis, 'photo_url', s.photo_url,
    'class_name', v_class_name, 'direction', p_direction, 'status', v_row.status,
    'checked_in_at', v_row.checked_in_at, 'checked_out_at', v_row.checked_out_at, 'duplicate', v_dup);
end $$;

-- Absen mandiri murid ditolak bila sekolah mewajibkan kartu/guru.
create or replace function public.guard_student_self_checkin()
returns trigger language plpgsql as $$
begin
  if new.method in ('qr', 'geo') and public.student_app_mode(new.school_id) <> 'full' then
    raise exception 'Sekolah Anda mewajibkan absen lewat kartu atau guru';
  end if;
  return new;
end $$;
create trigger student_attendance_self_checkin before insert on public.student_attendance
  for each row execute function public.guard_student_self_checkin();

-- ---------------------------------------------------------------------
-- Tugas dikumpulkan di kertas: guru mencatat dan menilai
-- ---------------------------------------------------------------------
alter table public.submissions
  add column mode text not null default 'online' check (mode in ('online', 'offline')),
  add column recorded_by uuid references public.profiles(id);

-- Pengumpulan online oleh murid ditolak bila aplikasi murid dimatikan sekolah.
create or replace function public.guard_online_submission()
returns trigger language plpgsql as $$
begin
  if new.mode = 'online' and public.student_app_mode(new.school_id) = 'off' then
    raise exception 'Sekolah Anda tidak memakai aplikasi untuk murid. Kumpulkan tugas ke guru.';
  end if;
  return new;
end $$;
create trigger submissions_online_guard before insert on public.submissions
  for each row execute function public.guard_online_submission();

-- p_rows: [{"student_id": uuid, "score": angka|null, "feedback": teks|null, "attachments": [...]}]
-- Murid yang sudah mengumpulkan online hanya diberi nilai; isi jawabannya tidak ditimpa.
create or replace function public.record_offline_submissions(p_assignment uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare a assignments; v_class uuid; r jsonb; v_student uuid; v_score numeric; v_fb text;
        v_sub submissions; v_count int := 0; v_user uuid; v_name text;
begin
  select * into a from assignments where id = p_assignment;
  if a.id is null then raise exception 'Tugas tidak ditemukan'; end if;
  if not public.is_teacher_of_ta(a.teaching_assignment_id) then
    raise exception 'Hanya guru mapel yang dapat mencatat tugas';
  end if;
  v_class := public.class_of_ta(a.teaching_assignment_id);

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_student := (r->>'student_id')::uuid;
    v_score := nullif(r->>'score', '')::numeric;
    v_fb := nullif(trim(r->>'feedback'), '');
    if not exists (select 1 from enrollments where class_id = v_class and student_id = v_student) then
      raise exception 'Murid tidak terdaftar di kelas tugas ini';
    end if;
    if v_score is not null and (v_score < 0 or v_score > a.max_score) then
      raise exception 'Nilai harus antara 0 dan %', a.max_score;
    end if;

    insert into submissions (school_id, assignment_id, student_id, mode, recorded_by, attachments, submitted_at, is_late,
                             score, feedback, graded_by, graded_at)
    values (a.school_id, a.id, v_student, 'offline', auth.uid(), coalesce(r->'attachments', '[]'::jsonb), now(),
            a.due_at is not null and now() > a.due_at,
            v_score, v_fb, case when v_score is not null then auth.uid() end, case when v_score is not null then now() end)
    on conflict (assignment_id, student_id) do update
       set attachments = case when submissions.mode = 'offline' and jsonb_array_length(excluded.attachments) > 0
                              then excluded.attachments else submissions.attachments end,
           score = coalesce(excluded.score, submissions.score),
           feedback = coalesce(excluded.feedback, submissions.feedback),
           graded_by = case when excluded.score is not null then auth.uid() else submissions.graded_by end,
           graded_at = case when excluded.score is not null and excluded.score is distinct from submissions.score
                            then now() else submissions.graded_at end
    returning * into v_sub;
    v_count := v_count + 1;

    if v_score is not null then
      select user_id, full_name into v_user, v_name from students where id = v_student;
      insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
      select uid, a.school_id, 'submission.graded',
             case when uid = v_user then 'Nilai ' || a.title || ': ' || v_score
                  else 'Nilai ' || v_name || ' · ' || a.title || ': ' || v_score end,
             coalesce(v_fb, ''), 'assignments', a.id
      from (select v_user uid where v_user is not null
            union select guardian_id from guardian_links where student_id = v_student) t;
    end if;
  end loop;
  return v_count;
end $$;

-- Guru boleh mengunggah foto jawaban kertas ke folder murid di kelasnya.
create policy "submission files upload by teacher" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and exists (
    select 1 from public.assignments a
    where a.id = public.try_uuid((storage.foldername(name))[2])
      and public.is_teacher_of_ta(a.teaching_assignment_id)));

-- ---------------------------------------------------------------------
-- Tugas baru juga dikirim ke orang tua bila murid tidak memakai aplikasi
-- (belum punya akun, atau sekolah mematikan aplikasi murid).
-- ---------------------------------------------------------------------
create or replace function public.notify_new_assignment_guardians()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_subject text; v_off boolean;
begin
  select sb.name into v_subject from teaching_assignments ta join subjects sb on sb.id = ta.subject_id
   where ta.id = new.teaching_assignment_id;
  v_off := public.student_app_mode(new.school_id) = 'off';
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select distinct g.guardian_id, new.school_id, 'assignment.new',
         v_subject || ' untuk ' || s.full_name || ': ' || new.title,
         case when new.due_at is null then 'Tugas baru'
              else 'Tenggat ' || to_char(new.due_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY HH24:MI') end,
         'assignments', new.id
  from enrollments e join students s on s.id = e.student_id
  join guardian_links g on g.student_id = s.id
  where e.class_id = public.class_of_ta(new.teaching_assignment_id) and (s.user_id is null or v_off);
  return new;
end $$;
create trigger assignments_notify_guardians after insert on public.assignments
  for each row execute function public.notify_new_assignment_guardians();
