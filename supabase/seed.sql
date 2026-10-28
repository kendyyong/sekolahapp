-- Data demo untuk pengembangan lokal (supabase db reset). Semua kata sandi: sekolah123
-- JANGAN dijalankan di proyek produksi.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'platform@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Platform"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Rina (Admin Sekolah)"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'kepsek@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Drs. Hendra Gunawan"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'sari@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sari Wulandari, S.Pd"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 'budi@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Budi Santoso, S.Si"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a5', 'authenticated', 'authenticated', 'tu@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Lestari (Tata Usaha)"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a6', 'authenticated', 'authenticated', 'bk@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Yuni Kartika, S.Psi"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'andi@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Andi Pratama"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'bela@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bela Anjani"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'citra@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Citra Lestari"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b4', 'authenticated', 'authenticated', 'dodi@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Dodi Saputra"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'ortu.andi@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ibu Maya (Orang tua Andi)"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now() from auth.users;

insert into public.platform_admins values ('00000000-0000-0000-0000-000000000001');

insert into public.schools (id, name, slug, level, plan, settings) values
  ('00000000-0000-0000-0000-00000000aaaa', 'SMP Harapan Bangsa', 'smp-harapan-bangsa', 'SMP', 'pro',
   '{"school_start_time":"07:00","late_after_minutes":15,"geofence":null,"annual_leave_days":12,"student_leave_escalate_days":3,"invoice_due_day":10,"late_fee_amount":10000}'),
  ('00000000-0000-0000-0000-00000000bbbb', 'SD Tunas Mekar', 'sd-tunas-mekar', 'SD', 'basic', default);

insert into public.memberships (school_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a1', 'school_admin'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a2', 'principal'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a3', 'teacher'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a3', 'guardian'),   -- guru sekaligus orang tua Bela
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a4', 'teacher'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a5', 'finance'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a6', 'counselor'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000b1', 'student'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000b2', 'student'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000b3', 'student'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000b4', 'student'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000c1', 'guardian');

insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_active) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000aaaa', '2026/2027', '2026-07-13', '2027-06-30', true),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000bbbb', '2026/2027', '2026-07-13', '2027-06-30', true);

insert into public.classes (id, school_id, academic_year_id, name, grade_level, homeroom_teacher_id, qr_secret) values
  ('00000000-0000-0000-0000-0000000007a0', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000e1', 'VII-A', 7, '00000000-0000-0000-0000-0000000000a3', 'qr-7a'),
  ('00000000-0000-0000-0000-0000000007b0', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000e1', 'VII-B', 7, '00000000-0000-0000-0000-0000000000a4', 'qr-7b'),
  ('00000000-0000-0000-0000-0000000001b0', '00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000e2', '1-A', 1, null, 'qr-1a');

insert into public.students (id, school_id, user_id, nis, full_name, gender) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000b1', '2601', 'Andi Pratama', 'L'),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000b2', '2602', 'Bela Anjani', 'P'),
  ('00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000b3', '2603', 'Citra Lestari', 'P'),
  ('00000000-0000-0000-0000-000000005004', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000b4', '2604', 'Dodi Saputra', 'L');

insert into public.enrollments (school_id, class_id, student_id, roll_number) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000007a0', '00000000-0000-0000-0000-000000005001', 1),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000007a0', '00000000-0000-0000-0000-000000005002', 2),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000007a0', '00000000-0000-0000-0000-000000005003', 3),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000007b0', '00000000-0000-0000-0000-000000005004', 1);

insert into public.guardian_links (student_id, guardian_id, school_id, relation, is_primary) values
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000aaaa', 'ibu', true),
  ('00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000aaaa', 'ibu', true);

insert into public.subjects (id, school_id, code, name) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000aaaa', 'MTK', 'Matematika'),
  ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000aaaa', 'IPA', 'Ilmu Pengetahuan Alam');

insert into public.teaching_assignments (id, school_id, class_id, subject_id, teacher_id) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000007a0', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000007a0', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000007b0', '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000a4');

insert into public.fee_types (id, school_id, code, name, category, is_monthly, default_amount) values
  ('00000000-0000-0000-0000-0000000fee01', '00000000-0000-0000-0000-00000000aaaa', 'SPP', 'SPP', 'spp', true, 450000),
  ('00000000-0000-0000-0000-0000000fee02', '00000000-0000-0000-0000-00000000aaaa', 'KOMPUTER', 'Iuran Lab Komputer', 'iuran', true, 25000);

insert into public.student_discounts (school_id, student_id, fee_type_id, kind, value, reason, valid_from) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-0000000fee01', 'percent', 50, 'Beasiswa prestasi', '2026-07-01');

-- Jadwal, tugas, kelas online, pengumuman contoh.
insert into public.schedules (school_id, teaching_assignment_id, day_of_week, starts_at, ends_at, room) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000a0001', 1, '07:15', '08:35', 'R. 7A'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000a0001', 3, '09:00', '10:20', 'R. 7A'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000a0002', 2, '07:15', '08:35', 'Lab IPA'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000a0003', 4, '10:30', '11:50', 'Lab IPA');

update public.teaching_assignments set meeting_url = 'https://zoom.us/j/1234567890' where id = '00000000-0000-0000-0000-0000000a0001';

insert into public.school_payment_accounts (school_id, sub_account_id, status) values
  ('00000000-0000-0000-0000-00000000aaaa', 'xendit-sub-account-demo', 'pending');

insert into public.assignments (school_id, teaching_assignment_id, kind, title, description, due_at, created_by) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000a0001', 'pr', 'Latihan Pecahan Hal. 42',
   'Kerjakan soal nomor 1–10, tulis langkah penyelesaian.', now() + interval '3 days', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000a0002', 'proyek', 'Model Tata Surya',
   'Tugas kelompok: buat model tata surya dari bahan bekas.', now() + interval '10 days', '00000000-0000-0000-0000-0000000000a4');
update public.assignments set is_group = true where title = 'Model Tata Surya';

insert into public.announcements (school_id, title, body, audience, created_by) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Pembagian Rapor Tengah Semester',
   'Pembagian rapor tengah semester dilaksanakan Sabtu, 14 November 2026 pukul 08.00 di kelas masing-masing.', 'all',
   '00000000-0000-0000-0000-0000000000a2');
