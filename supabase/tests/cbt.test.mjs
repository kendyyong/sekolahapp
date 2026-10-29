// Tes ujian online (CBT): pembuatan soal, token, pengerjaan murid, penilaian otomatis & uraian, kirim ke rapor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db, exam, attemptAndi, attemptBela, term;
const q = {};

before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

const one = async (uid, sql, params) => (await as(db, uid, sql, params))[0];

test('ujian hanya untuk paket yang memuat modul cbt dan hanya terlihat guru pengampu', async () => {
  await db.query(`insert into subjects (id, school_id, code, name) values ('00000000-0000-0000-0000-00000000f0b1', $1, 'BIN', 'Bahasa Indonesia')`, [S.B]);
  await db.query(`insert into teaching_assignments (id, school_id, class_id, subject_id, teacher_id) values
    ('00000000-0000-0000-0000-0000000b0001', $1, '00000000-0000-0000-0000-0000000001b0', '00000000-0000-0000-0000-00000000f0b1', $2)`, [S.B, U.adminB]);
  await assert.rejects(
    as(db, U.adminB, `insert into exams (school_id, teaching_assignment_id, title, starts_at, ends_at, duration_minutes)
                      values ($1, '00000000-0000-0000-0000-0000000b0001', 'UTS', now(), now() + interval '1 day', 60)`, [S.B]),
    /Ujian online \(CBT\) belum termasuk paket/);

  ({ id: exam } = await one(U.guru1,
    `insert into exams (school_id, teaching_assignment_id, title, starts_at, ends_at, duration_minutes, token, show_review)
     values ($1, $2, 'Ulangan Pecahan', now() + interval '1 hour', now() + interval '2 hours', 30, 'ABC12', true) returning id`,
    [S.A, S.taMtk7A]));
  assert.equal((await as(db, U.guru2, 'select id from exams where id = $1', [exam])).length, 0);
  assert.equal((await as(db, U.andi, 'select id from exams where id = $1', [exam])).length, 0);
  await assert.rejects(as(db, U.guru1, 'update exams set is_published = true where id = $1', [exam]), /Tambahkan soal dulu/);
});

test('bentuk soal dan kunci jawaban divalidasi sesuai jenisnya', async () => {
  const add = (kind, prompt, options, answer, points = 1) => one(U.guru1,
    `insert into exam_questions (exam_id, school_id, position, kind, prompt, options, answer, points)
     values ($1, $2, (select count(*) from exam_questions where exam_id = $1), $3, $4, $5, $6, $7) returning id`,
    [exam, S.A, kind, prompt, options && JSON.stringify(options), answer === undefined ? null : JSON.stringify(answer), points]);
  await assert.rejects(add('pg', '1/2 + 1/4 = ?', ['3/4'], 0), /Pilihan jawaban 2 sampai 8/);
  await assert.rejects(add('pg', '1/2 + 1/4 = ?', ['3/4', '2/6'], 5), /Pilih satu kunci/);
  await assert.rejects(add('pg_kompleks', 'Pilih', ['a', 'b'], [0, 0]), /Kunci jawaban tidak valid/);
  await assert.rejects(add('isian', 'Isi', null, []), /1 sampai 10 jawaban/);
  q.pg = (await add('pg', '1/2 + 1/4 = ?', ['3/4', '2/6', '1/8', '2/4'], 0, 2)).id;
  q.pgk = (await add('pg_kompleks', 'Pecahan senilai 1/2', ['2/4', '3/6', '2/3'], [0, 1], 2)).id;
  q.bs = (await add('benar_salah', '0,5 sama dengan 1/2', null, true)).id;
  q.isian = (await add('isian', 'Bentuk desimal 1/4', null, ['0,25', '0.25'])).id;
  q.uraian = (await add('uraian', 'Jelaskan cara menjumlahkan pecahan', null, 'abaikan', 3)).id;
  const [{ answer }] = await as(db, U.guru1, 'select answer from exam_questions where id = $1', [q.uraian]);
  assert.equal(answer, null);
  // Murid tidak bisa membaca soal & kunci langsung.
  assert.equal((await as(db, U.andi, 'select id from exam_questions where exam_id = $1', [exam])).length, 0);
});

test('menerbitkan ujian memberi tahu murid kelas itu; murid melihat jadwal tanpa token', async () => {
  await as(db, U.guru1, 'update exams set is_published = true where id = $1', [exam]);
  const [{ n }] = await db.query(`select count(*)::int n from notifications where kind = 'exam.scheduled' and ref_id = $1`, [exam]).then((r) => r.rows);
  assert.equal(n, 3);   // Andi, Bela, Citra di VII-A
  const { e } = await one(U.andi, 'select cbt_my_exams() e');
  assert.equal(e.length, 1);
  assert.equal(e[0].has_token, true);
  assert.equal(e[0].token, undefined);
  assert.equal(e[0].question_count, 5);
  assert.deepEqual((await one(U.dodi, 'select cbt_my_exams() e')).e, []);   // VII-B
});

test('mulai ujian: jadwal, token, dan melanjutkan pengerjaan yang sama', async () => {
  await assert.rejects(as(db, U.andi, `select cbt_start($1, 'ABC12')`, [exam]), /belum dibuka/);
  await db.query(`update exams set starts_at = now() - interval '5 minutes' where id = $1`, [exam]);
  await assert.rejects(as(db, U.andi, `select cbt_start($1, 'SALAH')`, [exam]), /Token ujian salah/);
  await assert.rejects(as(db, U.dodi, `select cbt_start($1, 'ABC12')`, [exam]), /tidak ditemukan/);
  ({ cbt_start: attemptAndi } = await one(U.andi, `select cbt_start($1, ' abc12 ')`, [exam]));
  const { cbt_start: again } = await one(U.andi, `select cbt_start($1, null)`, [exam]);
  assert.equal(again, attemptAndi);
  // Batas waktu = durasi 30 menit (lebih awal dari jam tutup).
  const [{ mins }] = (await db.query(`select round(extract(epoch from deadline_at - started_at) / 60) mins from exam_attempts where id = $1`, [attemptAndi])).rows;
  assert.equal(Number(mins), 30);
  // Murid tidak bisa membaca pengerjaan (berisi skor per soal) langsung.
  assert.equal((await as(db, U.andi, 'select id from exam_attempts')).length, 0);
});

test('lembar soal tanpa kunci; jawaban tersimpan dan divalidasi', async () => {
  const { p } = await one(U.andi, 'select cbt_paper($1) p', [attemptAndi]);
  assert.equal(p.questions.length, 5);
  assert.ok(!JSON.stringify(p).includes('"answer":0') && !JSON.stringify(p).includes('0,25'));
  const pg = p.questions.find((x) => x.id === q.pg);
  assert.deepEqual(pg.options.map((o) => o.i).sort(), [0, 1, 2, 3]);
  assert.equal(pg.options.find((o) => o.i === 0).text, '3/4');
  await assert.rejects(as(db, U.andi, 'select cbt_answer($1, $2, $3)', [attemptAndi, q.pg, '9']), /Format jawaban/);
  await assert.rejects(as(db, U.bela, 'select cbt_answer($1, $2, $3)', [attemptAndi, q.pg, '0']), /tidak ditemukan/);
  const save = (qid, a, flag = null) => as(db, U.andi, 'select cbt_answer($1, $2, $3, $4)', [attemptAndi, qid, JSON.stringify(a), flag]);
  await save(q.pg, 1);
  await save(q.pg, 0, true);           // ganti jawaban + tandai ragu-ragu
  await save(q.pgk, [1, 0]);
  await save(q.bs, false);
  await save(q.isian, '  0,25 ');
  await save(q.uraian, 'Samakan penyebutnya lalu jumlahkan pembilangnya.');
  const { p: again } = await one(U.andi, 'select cbt_paper($1) p', [attemptAndi]);
  const back = again.questions.find((x) => x.id === q.pg);
  assert.equal(back.answer, 0);
  assert.equal(back.flagged, true);
  await as(db, U.andi, 'select cbt_log_leave($1)', [attemptAndi]);
});

test('dikumpulkan → nilai otomatis; uraian menunggu guru', async () => {
  await as(db, U.andi, 'select cbt_submit($1)', [attemptAndi]);
  assert.equal((await one(U.andi, 'select cbt_answer($1, $2, $3) ok', [attemptAndi, q.pg, '1'])).ok, false);
  let { e } = await one(U.andi, 'select cbt_my_exams() e');
  assert.ok(e[0].submitted_at);
  assert.equal(e[0].needs_review, true);
  assert.equal(e[0].score, null);    // ditahan sampai uraian dinilai
  // pg 2 + pgk 2 + bs 0 + isian 1 = 5 dari total bobot 9 (uraian belum dinilai)
  const { r } = await one(U.guru1, 'select cbt_result($1) r', [attemptAndi]);
  assert.equal(Number(r.score), 55.56);
  assert.equal(r.leave_count, 1);
  assert.equal(r.review.length, 5);
  await assert.rejects(as(db, U.guru1, 'select cbt_grade($1, $2, 5)', [attemptAndi, q.uraian]), /0 sampai 3/);
  await assert.rejects(as(db, U.guru2, 'select cbt_grade($1, $2, 2)', [attemptAndi, q.uraian]), /guru pengampu/);
  await as(db, U.guru1, 'select cbt_grade($1, $2, 3)', [attemptAndi, q.uraian]);
  ({ e } = await one(U.andi, 'select cbt_my_exams() e'));
  assert.equal(Number(e[0].score), 88.89);
  // Pembahasan baru terbuka setelah jam ujian ditutup.
  let { r: mine } = await one(U.andi, 'select cbt_result($1) r', [attemptAndi]);
  assert.equal(mine.review, null);
  assert.equal(Number(mine.score), 88.89);
});

test('kunci diperbaiki → nilai dihitung ulang; soal terkunci setelah dikerjakan', async () => {
  await as(db, U.guru1, `update exam_questions set answer = 'false' where id = $1`, [q.bs]);
  const [{ score }] = (await db.query('select score from exam_attempts where id = $1', [attemptAndi])).rows;
  assert.equal(Number(score), 100);
  await assert.rejects(as(db, U.guru1, `insert into exam_questions (exam_id, school_id, kind, prompt, answer) values ($1, $2, 'benar_salah', 'x', 'true')`, [exam, S.A]),
    /tidak bisa ditambah/);
  await assert.rejects(as(db, U.guru1, 'delete from exam_questions where id = $1', [q.bs]), /tidak bisa dihapus/);
  await assert.rejects(as(db, U.guru1, 'delete from exams where id = $1', [exam]), /tidak bisa dihapus/);
});

test('waktu habis → dikumpulkan otomatis', async () => {
  ({ cbt_start: attemptBela } = await one(U.bela, `select cbt_start($1, 'ABC12')`, [exam]));
  await as(db, U.bela, 'select cbt_answer($1, $2, $3)', [attemptBela, q.pg, '0']);
  await db.query(`update exam_attempts set started_at = now() - interval '40 minutes', deadline_at = now() - interval '10 minutes' where id = $1`, [attemptBela]);
  assert.equal((await one(U.bela, 'select cbt_answer($1, $2, $3) ok', [attemptBela, q.pg, '1'])).ok, false);
  const [{ submitted_at, score }] = (await db.query('select submitted_at, score from exam_attempts where id = $1', [attemptBela])).rows;
  assert.ok(submitted_at);
  assert.equal(Number(score), 22.22);   // 2 dari 9
});

test('pembahasan untuk murid setelah ujian ditutup', async () => {
  await db.query(`update exams set ends_at = now() - interval '1 minute' where id = $1`, [exam]);
  const { r } = await one(U.andi, 'select cbt_result($1) r', [attemptAndi]);
  assert.equal(r.review.length, 5);
  assert.equal(r.review.find((x) => x.id === q.isian).key[0], '0,25');
  await assert.rejects(as(db, U.citra, `select cbt_start($1, 'ABC12')`, [exam]), /sudah berakhir/);
});

test('nilai dikirim ke Penilaian (E-Rapor) dan bisa dikirim ulang', async () => {
  ({ id: term } = await one(U.adminA,
    `insert into terms (school_id, academic_year_id, name, semester, starts_on, ends_on)
     values ($1, '00000000-0000-0000-0000-0000000000e1', 'Ganjil', 1, '2026-07-13', '2026-12-19') returning id`, [S.A]));
  const { n } = await one(U.guru1, `select cbt_send_to_grades($1, $2, 'sumatif') n`, [exam, term]);
  assert.equal(n, 2);
  const rows = (await db.query(`select s.student_id, s.score from exams e join assessment_scores s on s.assessment_id = e.assessment_id
                                  where e.id = $1 order by s.score desc`, [exam])).rows;
  assert.deepEqual(rows.map((x) => [x.student_id, Number(x.score)]), [[S.andi, 100], [S.bela, 22.22]]);
  // Mengulang ujian Bela lalu kirim ulang: nilainya hilang dari penilaian.
  await as(db, U.guru1, 'select cbt_reset_attempt($1)', [attemptBela]);
  const [{ k }] = (await db.query(`select count(*)::int k from notifications where kind = 'exam.reset' and user_id = $1`, [U.bela])).rows;
  assert.equal(k, 1);
  await as(db, U.guru1, `select cbt_send_to_grades($1, $2, 'sumatif')`, [exam, term]);
  const [{ c }] = (await db.query(`select count(*)::int c from exams e join assessment_scores s on s.assessment_id = e.assessment_id where e.id = $1`, [exam])).rows;
  assert.equal(c, 1);
  await assert.rejects(as(db, U.guru2, `select cbt_send_to_grades($1, $2, 'sumatif')`, [exam, term]), /guru pengampu/);
});
