-- =====================================================================
-- Identitas & merek sekolah
--   * Semua paket: logo, moto, visi, misi, kontak (kop surat & rapor).
--   * Paket Enterprise (modul whitelabel): warna utama dan nama aplikasi
--     sendiri yang tampil di web, aplikasi HP, dan halaman masuk sekolah.
-- =====================================================================

alter table public.schools
  add column if not exists motto       text check (char_length(motto) <= 160),
  add column if not exists vision      text check (char_length(vision) <= 1000),
  add column if not exists mission     text check (char_length(mission) <= 3000),
  add column if not exists email       text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists website     text check (char_length(website) <= 200),
  add column if not exists brand_color text check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists app_name    text check (char_length(app_name) between 2 and 40);

-- NIP dicetak di bawah tanda tangan rapor (kepala sekolah & wali kelas).
alter table public.profiles
  add column if not exists nip text check (nip ~ '^[0-9 .-]{8,30}$');

-- Warna & nama aplikasi sendiri hanya untuk paket yang memuat whitelabel.
-- Mengosongkan selalu boleh, supaya sekolah yang turun paket bisa kembali ke tampilan bawaan.
create or replace function public.guard_school_brand()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if ((new.brand_color is not null and new.brand_color is distinct from old.brand_color)
      or (new.app_name is not null and new.app_name is distinct from old.app_name))
     and not public.school_has_module(new.id, 'whitelabel')
     and not public.is_platform_admin()
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Warna dan nama aplikasi sendiri hanya tersedia di paket Enterprise.';
  end if;
  return new;
end $$;
create trigger schools_guard_brand before update on public.schools
  for each row execute function public.guard_school_brand();

-- Logo bisa diganti atau dihapus admin sekolah (sebelumnya hanya unggah).
create policy "assets read own" on storage.objects for select to authenticated
  using (bucket_id = 'school-assets'
         and public.has_role(public.try_uuid((storage.foldername(name))[1]), array['school_admin']::public.app_role[]));
create policy "assets update" on storage.objects for update to authenticated
  using (bucket_id = 'school-assets'
         and public.has_role(public.try_uuid((storage.foldername(name))[1]), array['school_admin']::public.app_role[]));
create policy "assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'school-assets'
         and public.has_role(public.try_uuid((storage.foldername(name))[1]), array['school_admin']::public.app_role[]));

-- Merek yang berlaku untuk satu sekolah: warna & nama aplikasi hanya bila paketnya whitelabel.
create or replace function public.school_brand(p_school uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', s.name, 'slug', s.slug, 'logo_url', s.logo_url, 'motto', s.motto,
    'brand_color', case when public.school_has_module(s.id, 'whitelabel') then s.brand_color end,
    'app_name', case when public.school_has_module(s.id, 'whitelabel') then s.app_name end)
  from schools s where s.id = p_school
$$;
revoke execute on function public.school_brand(uuid) from public, anon;
grant execute on function public.school_brand(uuid) to authenticated;

-- Halaman masuk khusus sekolah (/masuk/<slug>) dibuka sebelum login,
-- jadi hanya data merek yang memang tampil publik yang dikembalikan.
create or replace function public.school_public_profile(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.school_brand(s.id) from schools s where s.slug = lower(p_slug) and s.is_active
$$;
grant execute on function public.school_public_profile(text) to anon, authenticated;

-- Rapor memuat kop lengkap (logo, kontak, yayasan) dan NIP penanda tangan.
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
    'school', jsonb_build_object('name', v_school.name, 'npsn', v_school.npsn, 'address', v_school.address, 'logo_url', v_school.logo_url,
      'phone', v_school.phone, 'email', v_school.email, 'website', v_school.website, 'motto', v_school.motto,
      'foundation', (select name from foundations where id = v_school.foundation_id)),
    'term', jsonb_build_object('id', v_term.id, 'name', v_term.name, 'semester', v_term.semester,
      'year', (select name from academic_years where id = v_term.academic_year_id),
      'report_date', v_term.report_date, 'report_place', v_term.report_place, 'published_at', v_term.published_at),
    'student', jsonb_build_object('id', v_student.id, 'full_name', v_student.full_name, 'nis', v_student.nis, 'nisn', v_student.nisn),
    'class', jsonb_build_object('id', v_class.id, 'name', v_class.name, 'grade_level', v_class.grade_level),
    'homeroom', (select full_name from profiles where id = v_class.homeroom_teacher_id),
    'homeroom_nip', (select nip from profiles where id = v_class.homeroom_teacher_id),
    'principal', (select p.full_name from memberships m join profiles p on p.id = m.user_id
                  where m.school_id = v_student.school_id and m.role = 'principal' and m.is_active limit 1),
    'principal_nip', (select p.nip from memberships m join profiles p on p.id = m.user_id
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

