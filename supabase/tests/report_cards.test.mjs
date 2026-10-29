// Tes e-rapor: penilaian, nilai rapor otomatis, rapor wali kelas, penerbitan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db;
let term, tp1, tp2;
before(async () => {
  db = await freshDb();
  [{ id: term }] = await as(db, U.adminA,
    `insert into terms (school_id, academic_year_id, name, semester, starts_on, ends_on, report_date, report_place)
     select $1, id, 'Ganjil', 1, '2026-07-13', '2026-12-19', '2026-12-19', 'Bandung' from academic_years where school_id = $1 and is_active
     returning id`, [S.A]);
});
after(async () => { await db?.end(); });

const subjectMtk = async () => (await as(db, U.guru1, 'select subject_id from teaching_assignments where id = $1', [S.taMtk7A]))[0].subject_id;
const assess = async (kind, title, objectives, scores) => {
  const [{ id }] = await as(db, U.guru1,
    `insert into assessments (school_id, teaching_assignment_id, term_id, kind, title, objective_ids)
     values ($1, $2, $3, $4, $5, $6) returning id`, [S.A, S.taMtk7A, term, kind, title, objectives]);
  for (const [student, score] of Object.entries(scores)) {
    await as(db, U.guru1, 'insert into assessment_scores (assessment_id, student_id, school_id, score) values ($1, $2, $3, $4)',
      [id, S[student], S.A, score]);
  }
  return id;
};

test('guru mapel menulis TP & nilai; guru lain tidak bisa', async () => {
  const subject = await subjectMtk();
  [{ id: tp1 }] = await as(db, U.guru1,
    `insert into learning_objectives (school_id, subject_id, grade_level, code, description) values ($1, $2, 7, 'TP 1', 'menjumlahkan pecahan') returning id`,
    [S.A, subject]);
  [{ id: tp2 }] = await as(db, U.guru1,
    `insert into learning_objectives (school_id, subject_id, grade_level, code, description) values ($1, $2, 7, 'TP 2', 'menyelesaikan persamaan linear') returning id`,
    [S.A, subject]);
  await assert.rejects(
    as(db, U.guru2, `insert into learning_objectives (school_id, subject_id, grade_level, code, description) values ($1, $2, 7, 'TP 9', 'x')`, [S.A, subject]),
    /row-level security/);
  await assert.rejects(
    as(db, U.guru2, `insert into assessments (school_id, teaching_assignment_id, term_id, kind, title) values ($1, $2, $3, 'sumatif', 'Curang')`,
      [S.A, S.taMtk7A, term]),
    /row-level security/);

  await assess('sumatif', 'Sumatif Pecahan', [tp1], { andi: 92, bela: 80, citra: 60 });
  await assess('sumatif', 'Sumatif Persamaan', [tp2], { andi: 70, bela: 84, citra: 76 });
  await assess('sas', 'Sumatif Akhir Semester', [tp1, tp2], { andi: 85, bela: 70 });
});

test('nilai rapor = rata-rata sumatif & SAS, dengan deskripsi dari TP', async () => {
  const [{ n }] = await as(db, U.guru1, 'select compute_report_grades($1, $2) n', [term, S.taMtk7A]);
  assert.equal(n, 3);
  const rows = await as(db, U.guru1,
    'select student_id, score::int, description from report_grades where term_id = $1 order by score desc', [term]);
  const by = Object.fromEntries(rows.map((r) => [r.student_id, r]));
  // Andi: rata-rata sumatif 81, SAS 85 → (81 + 85) / 2 = 83.
  assert.equal(by[S.andi].score, 83);
  // TP1: (92 + 85) / 2 = 88.5 → baik; TP2: (70 + 85) / 2 = 77.5 ≥ KKTP 75 → perlu peningkatan.
  assert.equal(by[S.andi].description,
    'Menunjukkan penguasaan yang baik dalam menjumlahkan pecahan. Perlu peningkatan dalam menyelesaikan persamaan linear.');
  // Citra belum ikut SAS: nilai rapor dari sumatif saja = 68; TP1 60 < 75 → perlu bantuan.
  assert.equal(by[S.citra].score, 68);
  assert.match(by[S.citra].description, /Perlu bantuan dalam menjumlahkan pecahan/);

  // Nilai yang diubah guru tidak ditimpa saat dihitung ulang.
  await as(db, U.guru1, `update report_grades set score = 90, description = 'Sangat tekun.', edited = true where student_id = $1 and term_id = $2`, [S.bela, term]);
  await as(db, U.guru1, 'select compute_report_grades($1, $2)', [term, S.taMtk7A]);
  const [bela] = await as(db, U.guru1, 'select score::int, description from report_grades where student_id = $1 and term_id = $2', [S.bela, term]);
  assert.deepEqual(bela, { score: 90, description: 'Sangat tekun.' });
  await assert.rejects(as(db, U.guru2, 'select compute_report_grades($1, $2)', [term, S.taMtk7A]), /Hanya guru pengampu/);
});

test('murid & orang tua belum bisa melihat nilai rapor sebelum terbit', async () => {
  assert.equal((await as(db, U.ortuAndi, 'select * from report_grades')).length, 0);
  assert.equal((await as(db, U.andi, 'select * from report_grades')).length, 0);
  await assert.rejects(as(db, U.ortuAndi, 'select report_card_view($1, $2)', [term, S.andi]), /belum diterbitkan/);
  // Nilai harian (penilaian) memang terlihat oleh murid sendiri.
  assert.equal((await as(db, U.andi, 'select * from assessment_scores')).length, 3);
});

test('wali kelas memfinalkan rapor; rekap ketidakhadiran diambil otomatis', async () => {
  await as(db, U.guru1,
    `insert into student_attendance (school_id, class_id, student_id, date, status, method) values
     ($1, $2, $3, '2026-08-03', 'sakit', 'manual'), ($1, $2, $3, '2026-08-04', 'alpa', 'manual'), ($1, $2, $3, '2027-01-10', 'alpa', 'manual')`,
    [S.A, S.class7A, S.andi]);
  await as(db, U.guru1,
    `insert into report_cards (school_id, term_id, student_id, class_id, homeroom_note, extracurriculars, status)
     values ($1, $2, $3, $4, 'Pertahankan prestasimu.', '[{"name":"Pramuka","grade":"Baik"}]', 'final')`,
    [S.A, term, S.andi, S.class7A]);
  const [rc] = await as(db, U.guru1, 'select sick, permit, absent, finalized_by from report_cards where student_id = $1', [S.andi]);
  assert.deepEqual(rc, { sick: 1, permit: 0, absent: 1, finalized_by: U.guru1 });
  // Wali kelas lain tidak bisa menulis rapor kelas VII-A.
  await assert.rejects(
    as(db, U.guru2, `insert into report_cards (school_id, term_id, student_id, class_id) values ($1, $2, $3, $4)`, [S.A, term, S.bela, S.class7A]),
    /row-level security/);
});

test('terbit: orang tua diberi tahu & bisa melihat; data terkunci', async () => {
  await assert.rejects(as(db, U.adminA, 'update terms set published_at = now() where id = $1', [term]), /Terbitkan rapor/);
  await assert.rejects(as(db, U.guru1, 'select publish_term_reports($1)', [term]), /kepala sekolah/);
  const [{ n }] = await as(db, U.kepsekA, 'select publish_term_reports($1) n', [term]);
  assert.equal(n, 1);

  const notes = await as(db, U.ortuAndi, `select title from notifications where kind = 'report.published'`);
  assert.equal(notes.length, 1);
  const [{ v }] = await as(db, U.ortuAndi, 'select report_card_view($1, $2) v', [term, S.andi]);
  assert.equal(v.student.full_name, 'Andi');
  assert.equal(v.card.sick, 1);
  assert.equal(v.card.extracurriculars[0].name, 'Pramuka');
  const mtk = v.grades.find((g) => g.subject === 'Matematika');
  assert.equal(Number(mtk.score), 83);
  // Bela belum difinalkan wali kelas → tetap tersembunyi; Andi tidak bisa melihat rapor Bela.
  await assert.rejects(as(db, U.bela, 'select report_card_view($1, $2)', [term, S.bela]), /belum diterbitkan/);
  await assert.rejects(as(db, U.andi, 'select report_card_view($1, $2)', [term, S.bela]), /belum diterbitkan/);

  await assert.rejects(as(db, U.guru1, 'update assessment_scores set score = 100 where student_id = $1', [S.andi]), /sudah diterbitkan/);
  await assert.rejects(as(db, U.guru1, `update report_grades set score = 100 where student_id = $1`, [S.andi]), /sudah diterbitkan/);
  await as(db, U.kepsekA, 'select unpublish_term_reports($1)', [term]);
  await as(db, U.guru1, `update report_grades set score = 84, edited = true where student_id = $1`, [S.andi]);
});

test('paket tanpa modul penilaian menolak e-rapor', async () => {
  const [{ id: termB }] = await as(db, U.adminB,
    `insert into terms (school_id, academic_year_id, name, starts_on, ends_on)
     select $1, id, 'Ganjil', '2026-07-13', '2026-12-19' from academic_years where school_id = $1 returning id`, [S.B]);
  const [{ id: subj }] = await as(db, U.adminB, `insert into subjects (school_id, code, name) values ($1, 'MTK', 'Matematika') returning id`, [S.B]);
  await assert.rejects(
    as(db, U.adminB, `insert into learning_objectives (school_id, subject_id, grade_level, code, description) values ($1, $2, 1, 'TP 1', 'x')`, [S.B, subj]),
    /Penilaian & rapor belum termasuk paket/);
  assert.ok(termB);
});
