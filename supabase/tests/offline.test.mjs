// Tes mode tanpa ponsel: kartu QR di kios, tugas kertas, dan pengaturan aplikasi murid.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

const tokenOf = async (student) =>
  (await db.query('select card_token from students where id = $1', [student])).rows[0].card_token;
const scan = (uid, code, dir = 'in') => as(db, uid, 'select card_scan($1, $2) r', [code, dir]).then(([x]) => x.r);
const notifs = async (uid, kind) =>
  (await as(db, uid, 'select title, body from notifications where kind = $1 order by created_at', [kind]));

test('setiap murid punya token kartu acak yang unik', async () => {
  const rows = (await db.query('select card_token from students')).rows;
  assert.ok(rows.every((r) => /^[a-f0-9]{32}$/.test(r.card_token)));
  assert.equal(new Set(rows.map((r) => r.card_token)).size, rows.length);
});

test('kios: guru memindai kartu, absen tercatat dan orang tua diberi tahu', async () => {
  const token = await tokenOf(S.andi);
  const r = await scan(U.guru2, `sekolahapp:card:${token}`);   // guru kelas lain pun boleh (guru piket)
  assert.equal(r.full_name, 'Andi');
  assert.equal(r.class_name, 'VII-A');
  assert.ok(['hadir', 'terlambat'].includes(r.status));
  assert.equal(r.duplicate, false);
  const [att] = await as(db, U.guru1, `select method, checked_in_at from student_attendance where student_id = $1`, [S.andi]);
  assert.equal(att.method, 'card');
  assert.ok(att.checked_in_at);
  const n = await notifs(U.ortuAndi, 'attendance.arrived');
  assert.equal(n.length, 1);
  assert.match(n[0].title, /Andi tiba di sekolah/);

  // Pindai ulang tidak menggandakan notifikasi.
  const again = await scan(U.guru2, token);
  assert.equal(again.duplicate, true);
  assert.equal((await notifs(U.ortuAndi, 'attendance.arrived')).length, 1);

  // Pulang.
  const out = await scan(U.tuA, token, 'out');
  assert.ok(out.checked_out_at);
  assert.equal((await notifs(U.ortuAndi, 'attendance.left')).length, 1);
});

test('kios: pulang sebelum masuk ditolak; murid & sekolah lain tidak bisa memindai', async () => {
  const bela = await tokenOf(S.bela);
  await assert.rejects(scan(U.guru1, bela, 'out'), /belum absen masuk/);
  await assert.rejects(as(db, U.andi, 'select card_scan($1)', [bela]), /Kartu tidak dikenal/);
  await assert.rejects(as(db, U.ortuAndi, 'select card_scan($1)', [bela]), /Kartu tidak dikenal/);
  await assert.rejects(as(db, U.adminB, 'select card_scan($1)', [bela]), /Kartu tidak dikenal/);
  await assert.rejects(scan(U.guru1, 'tidak-ada'), /Kartu tidak dikenal/);
});

test('kios: murid yang sudah ditandai alpa lalu datang menjadi terlambat', async () => {
  await as(db, U.guru1, `select close_daily_attendance($1, school_today($2))`, [S.class7A, S.A]);
  const r = await scan(U.guru1, await tokenOf(S.citra));
  assert.equal(r.status, 'terlambat');
});

test('kartu hilang: admin mengganti token, kartu lama tidak berlaku', async () => {
  const old = await tokenOf(S.dodi);
  await assert.rejects(as(db, U.guru2, 'select reset_student_card($1)', [S.dodi]), /admin sekolah/);
  const [{ t }] = await as(db, U.adminA, 'select reset_student_card($1) t', [S.dodi]);
  assert.notEqual(t, old);
  await assert.rejects(scan(U.guru2, old), /Kartu tidak dikenal/);
  assert.equal((await scan(U.guru2, t)).full_name, 'Dodi');
});

test('mode tanpa absen mandiri: QR kelas oleh murid ditolak', async () => {
  await as(db, U.adminA, `update schools set settings = settings || '{"student_app_mode":"no_self_checkin"}' where id = $1`, [S.A]);
  await assert.rejects(as(db, U.bela, `select student_check_in($1, 'qr-7a')`, [S.class7A]), /kartu atau guru/);
  await assert.rejects(
    as(db, U.adminA, `update schools set settings = settings || '{"student_app_mode":"aneh"}' where id = $1`, [S.A]),
    /tidak dikenal/);
});

test('tugas kertas: guru mencatat nilai, orang tua diberi tahu; aplikasi murid mati menolak kumpul online', async () => {
  await as(db, U.adminA, `update schools set settings = settings || '{"student_app_mode":"off"}' where id = $1`, [S.A]);
  const [a] = await as(db, U.guru1,
    `insert into assignments (school_id, teaching_assignment_id, title, max_score) values ($1, $2, 'Latihan Pecahan', 100) returning id`,
    [S.A, S.taMtk7A]);
  // Orang tua menerima info tugas baru karena aplikasi murid dimatikan.
  const fresh = await notifs(U.ortuAndi, 'assignment.new');
  assert.ok(fresh.some((n) => /Andi: Latihan Pecahan/.test(n.title)));

  await assert.rejects(as(db, U.andi, `select submit_assignment($1, 'jawaban')`, [a.id]), /Kumpulkan tugas ke guru/);
  await assert.rejects(
    as(db, U.guru2, `select record_offline_submissions($1, $2)`, [a.id, JSON.stringify([{ student_id: S.andi, score: 80 }])]),
    /guru mapel/);
  await assert.rejects(
    as(db, U.guru1, `select record_offline_submissions($1, $2)`, [a.id, JSON.stringify([{ student_id: S.dodi, score: 80 }])]),
    /tidak terdaftar/);
  await assert.rejects(
    as(db, U.guru1, `select record_offline_submissions($1, $2)`, [a.id, JSON.stringify([{ student_id: S.andi, score: 101 }])]),
    /antara 0 dan 100/);

  const [{ n }] = await as(db, U.guru1, `select record_offline_submissions($1, $2) n`, [a.id, JSON.stringify([
    { student_id: S.andi, score: 85, feedback: 'Rapi' },
    { student_id: S.bela, score: null },                      // dikumpulkan, belum dinilai
  ])]);
  assert.equal(n, 2);
  const subs = await as(db, U.guru1, 'select student_id, mode, score from submissions where assignment_id = $1 order by student_id', [a.id]);
  assert.deepEqual(subs.map((s) => [s.mode, s.score === null ? null : Number(s.score)]), [['offline', 85], ['offline', null]]);
  const graded = await notifs(U.ortuAndi, 'submission.graded');
  assert.equal(graded.length, 1);
  assert.match(graded[0].title, /Andi · Latihan Pecahan: 85/);

  // Nilai diperbarui tanpa menghapus catatan sebelumnya.
  await as(db, U.guru1, `select record_offline_submissions($1, $2)`, [a.id, JSON.stringify([{ student_id: S.bela, score: 90 }])]);
  const [bela] = await as(db, U.guru1, 'select score from submissions where assignment_id = $1 and student_id = $2', [a.id, S.bela]);
  assert.equal(Number(bela.score), 90);
});
