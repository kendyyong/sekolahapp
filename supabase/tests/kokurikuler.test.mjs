// Tes kokurikuler / P5: projek per kelas, penilaian BB–SB, kunci saat rapor terbit, dan bagian projek di rapor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db, term, project, p5;
before(async () => {
  db = await freshDb();
  [{ id: term }] = await as(db, U.adminA,
    `insert into terms (school_id, academic_year_id, name, semester, starts_on, ends_on)
     values ($1, '00000000-0000-0000-0000-0000000000e1', 'Ganjil', 1, '2026-07-13', '2026-12-19') returning id`, [S.A]);
});
after(async () => { await db?.end(); });

const one = async (uid, sql, params) => (await as(db, uid, sql, params))[0];
const newProject = (uid, fields = {}) => one(uid,
  `insert into kokurikuler_projects (school_id, term_id, framework, title, theme, class_ids, aspect_ids)
   values ($1, $2, $3, $4, 'Gaya Hidup Berkelanjutan', $5, $6) returning id`,
  [S.A, term, fields.framework ?? 'kokurikuler', fields.title ?? 'Kebun Sekolah', fields.classes ?? [S.class7A],
   fields.aspects ?? ['k.kolaborasi', 'k.kreativitas', 'k.kesehatan']]);

test('daftar dimensi tersedia untuk kedua kerangka', async () => {
  const rows = await as(db, U.andi, 'select framework, count(*)::int n from profile_aspects group by framework order by framework');
  assert.deepEqual(rows, [{ framework: 'kokurikuler', n: 8 }, { framework: 'p5', n: 20 }]);
});

test('guru membuat projek sebagai koordinator; kelas & dimensi divalidasi', async () => {
  ({ id: project } = await newProject(U.guru2));   // guru IPA, bukan wali VII-A
  const [{ coordinator_id }] = (await db.query('select coordinator_id from kokurikuler_projects where id = $1', [project])).rows;
  assert.equal(coordinator_id, U.guru2);
  await assert.rejects(as(db, U.guru1,
    `insert into kokurikuler_projects (school_id, term_id, title, class_ids, aspect_ids, coordinator_id)
     values ($1, $2, 'Titipan', $3, array['k.nalar'], $4)`, [S.A, term, [S.class7A], U.guru2]), /row-level security/);
  await assert.rejects(newProject(U.guru1, { aspects: ['p5.gotong.kolaborasi'] }), /tidak sesuai kerangka/);
  await assert.rejects(newProject(U.guru1, { classes: ['00000000-0000-0000-0000-000000000bad'] }), /tahun ajaran/);
  await assert.rejects(newProject(U.andi), /row-level security/);
  ({ id: p5 } = await newProject(U.adminA, { framework: 'p5', title: 'Pentas Budaya', classes: [S.class7A, S.class7B],
    aspects: ['p5.bineka.budaya', 'p5.gotong.kolaborasi'] }));
  assert.ok(p5);
  // Semua anggota sekolah bisa melihat daftar projek; sekolah lain tidak.
  assert.equal((await as(db, U.andi, 'select id from kokurikuler_projects')).length, 2);
  assert.equal((await as(db, U.adminB, 'select id from kokurikuler_projects')).length, 0);
  // Hanya koordinator / pengelola yang bisa mengubah projek.
  assert.equal((await as(db, U.guru1, `update kokurikuler_projects set title = 'Diubah' where id = $1 returning id`, [project])).length, 0);
});

test('koordinator & wali kelas menilai; nilai harus BB/MB/BSH/SB pada dimensi projek', async () => {
  await as(db, U.guru2, `insert into kokurikuler_results (project_id, student_id, school_id, levels, note)
    values ($1, $2, $3, '{"k.kolaborasi":"SB","k.kreativitas":"BSH"}', 'Memimpin kelompok menanam.')`, [project, S.andi, S.A]);
  await as(db, U.guru1, `insert into kokurikuler_results (project_id, student_id, school_id, levels)
    values ($1, $2, $3, '{"k.kolaborasi":"MB"}')`, [project, S.bela, S.A]);   // wali kelas VII-A
  await assert.rejects(as(db, U.guru2, `insert into kokurikuler_results (project_id, student_id, school_id, levels)
    values ($1, $2, $3, '{"k.kolaborasi":"A"}')`, [project, S.citra, S.A]), /BB, MB, BSH, atau SB/);
  await assert.rejects(as(db, U.guru2, `insert into kokurikuler_results (project_id, student_id, school_id, levels)
    values ($1, $2, $3, '{"k.nalar":"SB"}')`, [project, S.citra, S.A]), /BB, MB, BSH, atau SB/);
  await assert.rejects(as(db, U.guru2, `insert into kokurikuler_results (project_id, student_id, school_id)
    values ($1, $2, $3)`, [project, S.dodi, S.A]), /tidak terdaftar di kelas projek/);
  await assert.rejects(as(db, U.tuA, `insert into kokurikuler_results (project_id, student_id, school_id)
    values ($1, $2, $3)`, [project, S.citra, S.A]), /row-level security/);
  await assert.rejects(as(db, U.adminA, `update kokurikuler_projects set framework = 'p5', aspect_ids = array['p5.mandiri.diri'] where id = $1`, [project]),
    /tidak bisa diganti/);
  // Wali kelas hanya menilai murid kelasnya di projek lintas kelas.
  await assert.rejects(as(db, U.guru1, `insert into kokurikuler_results (project_id, student_id, school_id, levels)
    values ($1, $2, $3, '{"p5.bineka.budaya":"SB"}')`, [p5, S.dodi, S.A]), /row-level security/);
  await as(db, U.guru2, `insert into kokurikuler_results (project_id, student_id, school_id, levels)
    values ($1, $2, $3, '{"p5.bineka.budaya":"BSH"}')`, [p5, S.dodi, S.A]);
  // Lembar penilaian: koordinator melihat semua murid projek, wali kelas hanya kelasnya.
  const sheet = async (uid, id) => (await as(db, uid, 'select student_id, class_name, levels from kokurikuler_sheet($1)', [id]));
  assert.deepEqual((await sheet(U.guru2, project)).map((r) => r.levels?.['k.kolaborasi'] ?? null), ['SB', 'MB', null]);
  assert.deepEqual((await sheet(U.guru1, p5)).map((r) => r.class_name), ['VII-A', 'VII-A', 'VII-A']);
  assert.equal((await sheet(U.adminA, p5)).length, 4);
  assert.equal((await sheet(U.andi, p5)).length, 0);
  // Murid tidak bisa membaca nilai projek sebelum rapor terbit.
  assert.equal((await as(db, U.andi, 'select * from kokurikuler_results')).length, 0);
});

test('bagian projek di rapor tampil untuk keluarga setelah terbit dan nilainya terkunci', async () => {
  const [{ r: staff }] = await as(db, U.guru1, 'select kokurikuler_report($1, $2) r', [term, S.andi]);
  assert.equal(staff.length, 2);
  const kebun = staff.find((p) => p.title === 'Kebun Sekolah');
  assert.deepEqual(kebun.aspects.map((a) => [a.id, a.level]), [['k.kreativitas', 'BSH'], ['k.kolaborasi', 'SB'], ['k.kesehatan', null]]);
  assert.equal(kebun.note, 'Memimpin kelompok menanam.');
  // Dodi (VII-B) hanya ikut projek P5.
  const [{ r: dodi }] = await as(db, U.guru2, 'select kokurikuler_report($1, $2) r', [term, S.dodi]);
  assert.deepEqual(dodi.map((p) => p.framework), ['p5']);

  const [{ r: before }] = await as(db, U.ortuAndi, 'select kokurikuler_report($1, $2) r', [term, S.andi]);
  assert.deepEqual(before, []);
  await as(db, U.guru1, `insert into report_cards (school_id, term_id, student_id, class_id, status) values ($1, $2, $3, $4, 'final')`,
    [S.A, term, S.andi, S.class7A]);
  await as(db, U.kepsekA, 'select publish_term_reports($1)', [term]);
  const [{ r: after }] = await as(db, U.ortuAndi, 'select kokurikuler_report($1, $2) r', [term, S.andi]);
  assert.equal(after.length, 2);
  assert.equal((await as(db, U.andi, 'select student_id from kokurikuler_results')).length, 1);
  const [{ r: bela }] = await as(db, U.bela, 'select kokurikuler_report($1, $2) r', [term, S.bela]);
  assert.deepEqual(bela, []);   // rapor Bela belum final

  await assert.rejects(as(db, U.guru2, `update kokurikuler_results set note = 'x' where student_id = $1`, [S.andi]), /sudah diterbitkan/);
  await as(db, U.kepsekA, 'select unpublish_term_reports($1)', [term]);
  await as(db, U.guru2, `update kokurikuler_results set note = 'Diperbarui' where student_id = $1`, [S.andi]);
});

test('paket tanpa modul penilaian menolak projek', async () => {
  const [{ id: termB }] = await as(db, U.adminB,
    `insert into terms (school_id, academic_year_id, name, starts_on, ends_on)
     select $1, id, 'Ganjil', '2026-07-13', '2026-12-19' from academic_years where school_id = $1 returning id`, [S.B]);
  const [{ id: classB }] = (await db.query('select id from classes where school_id = $1 limit 1', [S.B])).rows;
  await assert.rejects(as(db, U.adminB,
    `insert into kokurikuler_projects (school_id, term_id, title, class_ids, aspect_ids) values ($1, $2, 'Projek', $3, array['k.nalar'])`,
    [S.B, termB, [classB]]), /Penilaian & rapor belum termasuk paket/);
});
