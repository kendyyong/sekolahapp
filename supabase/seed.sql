-- Data demo untuk pengembangan lokal (supabase db reset). Semua kata sandi: sekolah123
-- JANGAN dijalankan di proyek produksi.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'platform@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Platform"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'admin@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Rina (Admin Sekolah)"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'kepsek@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Drs. Hendra Gunawan"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'sari@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sari Wulandari, S.Pd"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 'budi@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Budi Santoso, S.Si"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a5', 'authenticated', 'authenticated', 'tu@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Lestari (Tata Usaha)"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a7', 'authenticated', 'authenticated', 'kantin@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bu Rini (Kantin)"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000a6', 'authenticated', 'authenticated', 'bk@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Yuni Kartika, S.Psi"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b1', 'authenticated', 'authenticated', 'andi@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Andi Pratama"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'bela@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bela Anjani"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b3', 'authenticated', 'authenticated', 'citra@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Citra Lestari"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000b4', 'authenticated', 'authenticated', 'dodi@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Dodi Saputra"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'ortu.andi@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ibu Maya (Orang tua Andi)"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated', 'yayasan@demo.sekolahapp.id', extensions.crypt('sekolah123', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"H. Rahmat (Ketua Yayasan)"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now() from auth.users;

insert into public.platform_admins values ('00000000-0000-0000-0000-000000000001');

insert into public.foundations (id, name) values ('00000000-0000-0000-0000-0000000000ff', 'Yayasan Harapan Nusantara');
insert into public.foundation_admins (foundation_id, user_id) values ('00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-0000000000f1');

insert into public.schools (id, foundation_id, name, slug, level, plan, settings) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000ff', 'SMP Harapan Bangsa', 'smp-harapan-bangsa', 'SMP', 'enterprise',
   '{"school_start_time":"07:00","late_after_minutes":15,"geofence":null,"annual_leave_days":12,"student_leave_escalate_days":3,"invoice_due_day":10,"late_fee_amount":10000}'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000ff', 'SD Tunas Mekar', 'sd-tunas-mekar', 'SD', 'basic', default);

insert into public.memberships (school_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a1', 'school_admin'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a2', 'principal'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a3', 'teacher'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a3', 'guardian'),   -- guru sekaligus orang tua Bela
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a4', 'teacher'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a5', 'finance'),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a7', 'canteen'),
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

-- E-rapor: semester, TP, dan beberapa nilai contoh (belum dihitung menjadi nilai rapor).
insert into public.terms (id, school_id, academic_year_id, name, semester, starts_on, ends_on, report_date, report_place) values
  ('00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000e1', 'Ganjil', 1, '2026-07-13', '2026-12-19', '2026-12-19', 'Bandung'),
  ('00000000-0000-0000-0000-0000000e1002', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000e1', 'Genap', 2, '2027-01-04', '2027-06-19', '2027-06-19', 'Bandung');
update public.subjects set report_order = 4 where id = '00000000-0000-0000-0000-00000000f001';
update public.subjects set report_order = 5 where id = '00000000-0000-0000-0000-00000000f002';

insert into public.learning_objectives (id, school_id, subject_id, grade_level, code, description, created_by) values
  ('00000000-0000-0000-0000-0000000f0101', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-00000000f001', 7, 'TP 1', 'menjumlahkan dan mengurangkan pecahan', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000f0102', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-00000000f001', 7, 'TP 2', 'menyelesaikan persamaan linear satu variabel', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000f0201', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-00000000f002', 7, 'TP 1', 'mengklasifikasikan makhluk hidup berdasarkan ciri-cirinya', '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000f0202', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-00000000f002', 7, 'TP 2', 'menjelaskan wujud zat dan perubahannya', '00000000-0000-0000-0000-0000000000a4');

insert into public.assessments (id, school_id, teaching_assignment_id, term_id, kind, title, held_on, objective_ids, created_by) values
  ('00000000-0000-0000-0000-0000000a5001', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000e1001', 'formatif', 'Kuis pecahan', '2026-08-20', '{00000000-0000-0000-0000-0000000f0101}', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000a5002', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000e1001', 'sumatif', 'Sumatif bab pecahan', '2026-09-10', '{00000000-0000-0000-0000-0000000f0101}', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000a5003', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000e1001', 'sumatif', 'Sumatif bab persamaan linear', '2026-10-15', '{00000000-0000-0000-0000-0000000f0102}', '00000000-0000-0000-0000-0000000000a3');

insert into public.assessment_scores (assessment_id, student_id, school_id, score) values
  ('00000000-0000-0000-0000-0000000a5001', '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000aaaa', 85),
  ('00000000-0000-0000-0000-0000000a5001', '00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-00000000aaaa', 90),
  ('00000000-0000-0000-0000-0000000a5001', '00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-00000000aaaa', 70),
  ('00000000-0000-0000-0000-0000000a5002', '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000aaaa', 88),
  ('00000000-0000-0000-0000-0000000a5002', '00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-00000000aaaa', 92),
  ('00000000-0000-0000-0000-0000000a5002', '00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-00000000aaaa', 68),
  ('00000000-0000-0000-0000-0000000a5003', '00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-00000000aaaa', 74),
  ('00000000-0000-0000-0000-0000000a5003', '00000000-0000-0000-0000-000000005002', '00000000-0000-0000-0000-00000000aaaa', 86),
  ('00000000-0000-0000-0000-0000000a5003', '00000000-0000-0000-0000-000000005003', '00000000-0000-0000-0000-00000000aaaa', 79);

-- Kantin digital: satu kios dengan menu, saldo awal beberapa murid.
insert into public.canteen_stalls (id, school_id, name, operator_ids, commission_pct) values
  ('00000000-0000-0000-0000-0000000ca001', '00000000-0000-0000-0000-00000000aaaa', 'Kantin Bu Rini', '{00000000-0000-0000-0000-0000000000a7}', 10);
insert into public.canteen_items (school_id, stall_id, name, price, position) values
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000ca001', 'Nasi goreng', 8000, 1),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000ca001', 'Mi ayam', 7000, 2),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000ca001', 'Roti bakar', 5000, 3),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000ca001', 'Es teh', 3000, 4),
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000ca001', 'Air mineral', 3000, 5);
select public.canteen_post('00000000-0000-0000-0000-000000005001', 'topup', 50000, null, null, 'cash', null, null, 'Saldo awal');
select public.canteen_post('00000000-0000-0000-0000-000000005002', 'topup', 30000, null, null, 'cash', null, null, 'Saldo awal');

-- Penggajian: komponen umum, data pegawai, absensi guru Oktober 2026 (hari kerja).
insert into public.payroll_components (school_id, name, kind, calc, rate, applies_to_all, position) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Tunjangan jabatan', 'earning', 'fixed', 0, false, 0),
  ('00000000-0000-0000-0000-00000000aaaa', 'Tunjangan wali kelas', 'earning', 'fixed', 250000, false, 1),
  ('00000000-0000-0000-0000-00000000aaaa', 'Uang transport', 'earning', 'per_attendance', 15000, true, 2),
  ('00000000-0000-0000-0000-00000000aaaa', 'Honor mengajar', 'earning', 'per_jp', 25000, false, 3),
  ('00000000-0000-0000-0000-00000000aaaa', 'Potongan terlambat', 'deduction', 'per_late', 5000, true, 4),
  ('00000000-0000-0000-0000-00000000aaaa', 'Potongan alpa', 'deduction', 'per_absence', 50000, true, 5),
  ('00000000-0000-0000-0000-00000000aaaa', 'BPJS Kesehatan', 'deduction', 'percent_base', 1, true, 6);
insert into public.payroll_employees (id, school_id, user_id, full_name, position, status, nip, base_salary, bank_name, bank_account, account_holder) values
  ('00000000-0000-0000-0000-0000000e9001', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a2', 'Drs. Hendra Gunawan', 'Kepala Sekolah', 'gty', '198001012005011001', 4500000, 'BSI', '7100000001', 'Hendra Gunawan'),
  ('00000000-0000-0000-0000-0000000e9002', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a3', 'Sari Wulandari, S.Pd', 'Guru Matematika', 'gty', null, 3200000, 'BRI', '0123456789', 'Sari Wulandari'),
  ('00000000-0000-0000-0000-0000000e9003', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a4', 'Budi Santoso, S.Si', 'Guru IPA', 'gtt', null, 0, 'Mandiri', '1370000003', 'Budi Santoso'),
  ('00000000-0000-0000-0000-0000000e9004', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a5', 'Lestari', 'Tata Usaha', 'pty', null, 2800000, 'BSI', '7100000004', 'Lestari'),
  ('00000000-0000-0000-0000-0000000e9005', '00000000-0000-0000-0000-00000000aaaa', null, 'Joko Susilo', 'Satpam', 'ptt', null, 1800000, null, null, null);
insert into public.payroll_employee_components (employee_id, component_id, school_id, rate)
select e, c.id, c.school_id, r from public.payroll_components c
  join (values ('00000000-0000-0000-0000-0000000e9001'::uuid, 'Tunjangan jabatan', 1000000),
               ('00000000-0000-0000-0000-0000000e9002'::uuid, 'Tunjangan wali kelas', 250000),
               ('00000000-0000-0000-0000-0000000e9003'::uuid, 'Tunjangan wali kelas', 250000),
               ('00000000-0000-0000-0000-0000000e9003'::uuid, 'Honor mengajar', 30000)) v(e, n, r) on v.n = c.name
 where c.school_id = '00000000-0000-0000-0000-00000000aaaa';
insert into public.staff_attendance (school_id, user_id, date, status, check_in_at)
select '00000000-0000-0000-0000-00000000aaaa', u, d::date,
       case when u = '00000000-0000-0000-0000-0000000000a3' and extract(day from d) in (6, 20) then 'terlambat'
            when u = '00000000-0000-0000-0000-0000000000a4' and extract(day from d) = 14 then 'alpa'
            when u = '00000000-0000-0000-0000-0000000000a4' and extract(day from d) = 21 then 'sakit'
            else 'hadir' end::public.staff_attendance_status,
       d + interval '6 hours 50 minutes'
  from unnest(array['00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3',
                    '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a5']::uuid[]) u,
       generate_series('2026-10-01'::timestamp, '2026-10-28', '1 day') d
 where extract(isodow from d) < 6
on conflict do nothing;
