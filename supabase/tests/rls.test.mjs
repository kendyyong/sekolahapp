// Tes pengaman data: isolasi antarsekolah dan batas hak akses per peran.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

test('admin sekolah B tidak melihat murid sekolah A', async () => {
  const rows = await as(db, U.adminB, 'select id, school_id from students');
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.school_id === S.B));
});

test('admin sekolah A tidak bisa menambah murid ke sekolah B', async () => {
  await assert.rejects(
    as(db, U.adminA, `insert into students (school_id, full_name) values ($1, 'Penyusup')`, [S.B]),
    /row-level security/);
});

test('murid hanya melihat dirinya, bukan teman sekelas', async () => {
  const rows = await as(db, U.andi, 'select id from students');
  assert.deepEqual(rows.map((r) => r.id), [S.andi]);
});

test('murid melihat daftar teman sekelas lewat enrollments (untuk membentuk kelompok)', async () => {
  const rows = await as(db, U.andi, 'select student_id from enrollments where class_id = $1', [S.class7A]);
  assert.equal(rows.length, 3);
});

test('orang tua hanya melihat anaknya', async () => {
  const rows = await as(db, U.ortuAndi, 'select id from students');
  assert.deepEqual(rows.map((r) => r.id), [S.andi]);
});

test('guru melihat murid kelas yang diajar, tidak kelas lain', async () => {
  const rows = await as(db, U.guru1, 'select id from students order by nis');
  assert.deepEqual(rows.map((r) => r.id), [S.andi, S.bela, S.citra]);
  const rows2 = await as(db, U.guru2, 'select id from students order by nis');
  assert.equal(rows2.length, 4);   // guru2 mengajar VII-A dan VII-B
});

test('satu akun banyak peran: guru1 sekaligus orang tua', async () => {
  const roles = await as(db, U.guru1, 'select role from my_roles() order by role');
  assert.deepEqual(roles.map((r) => r.role).sort(), ['guardian', 'teacher']);
});

test('guru mapel tidak melihat tagihan murid yang bukan perwaliannya, TU melihat semua', async () => {
  await as(db, U.tuA, 'select generate_monthly_invoices($1, $2)', [S.A, '2026-11-01']);
  // guru2 mengajar IPA di VII-A dan VII-B, tapi hanya wali kelas VII-B (Dodi).
  const guru2 = await as(db, U.guru2, 'select student_id from invoices');
  assert.deepEqual(guru2.map((r) => r.student_id), [S.dodi]);
  const tu = await as(db, U.tuA, 'select id from invoices');
  assert.equal(tu.length, 4);
});

test('wali kelas melihat tagihan murid kelasnya saja', async () => {
  const rows = await as(db, U.guru1, 'select student_id from invoices');
  assert.ok(rows.length === 3);
});

test('catatan konseling hanya untuk BK dan kepala sekolah', async () => {
  await as(db, U.bkA, `insert into counseling_notes (school_id, student_id, topic, notes) values ($1, $2, 'Motivasi', 'Rahasia')`, [S.A, S.andi]);
  assert.equal((await as(db, U.guru1, 'select * from counseling_notes')).length, 0);
  assert.equal((await as(db, U.ortuAndi, 'select * from counseling_notes')).length, 0);
  assert.equal((await as(db, U.kepsekA, 'select * from counseling_notes')).length, 1);
});

test('guru hanya bisa mengubah link Zoom, bukan guru pengampu', async () => {
  await as(db, U.guru1, `update teaching_assignments set meeting_url = 'https://zoom.us/j/1' where id = $1`, [S.taMtk7A]);
  await assert.rejects(
    as(db, U.guru1, 'update teaching_assignments set teacher_id = $1 where id = $2', [U.guru2, S.taMtk7A]),
    /link kelas online/);
});

test('admin sekolah tidak bisa menaikkan paket langganan sendiri', async () => {
  await assert.rejects(as(db, U.adminA, `update schools set plan = 'enterprise' where id = $1`, [S.A]), /admin platform/);
  await as(db, U.adminA, `update schools set phone = '021-123' where id = $1`, [S.A]);
});

test('pembayaran tidak bisa dibuat langsung oleh orang tua', async () => {
  const [inv] = await as(db, U.ortuAndi, 'select id from invoices limit 1');
  await assert.rejects(
    as(db, U.ortuAndi, `insert into payments (school_id, invoice_id, amount, method, status) values ($1, $2, 475000, 'cash', 'paid')`, [S.A, inv.id]),
    /row-level security/);
});
