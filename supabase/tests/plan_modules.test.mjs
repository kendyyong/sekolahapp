// Tes fitur sesuai paket: modul berbayar dan batas jumlah murid.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

const setPlan = (school, plan) => as(db, U.platform, 'update schools set plan = $2 where id = $1', [school, plan]);

test('modul sekolah mengikuti paket', async () => {
  const [{ m }] = await as(db, U.adminB, 'select school_modules($1) m', [S.B]);
  assert.deepEqual(m, ['core', 'staff']);
  const [{ a, b }] = await as(db, U.adminA, `select school_has_module($1, 'finance') a, school_has_module($2, 'finance') b`, [S.A, S.B]);
  assert.equal(a, true);
  assert.equal(b, false);
});

test('paket Dasar: SPP & BK ditolak, absen guru boleh', async () => {
  await as(db, U.platform, `insert into memberships (school_id, user_id, role) values ($1, $2, 'finance')`, [S.B, U.adminB]);
  await assert.rejects(
    as(db, U.adminB, `insert into fee_types (school_id, code, name, category, is_monthly, default_amount) values ($1, 'SPP', 'SPP', 'spp', true, 100000)`, [S.B]),
    /SPP & pembayaran belum termasuk paket/);
  await assert.rejects(
    as(db, U.adminB, `insert into behavior_records (school_id, student_id, kind, points, description) values ($1, $2, 'prestasi', 5, 'Juara')`, [S.B, S.muridB]),
    /BK & catatan sikap/);
  await as(db, U.adminB, 'select staff_check_in($1)', [S.B]);
});

test('turun paket: data lama tetap terbaca, data baru ditolak', async () => {
  const before = await as(db, U.tuA, 'select count(*)::int n from fee_types where school_id = $1', [S.A]);
  await setPlan(S.A, 'basic');
  const afterRows = await as(db, U.tuA, 'select count(*)::int n from fee_types where school_id = $1', [S.A]);
  assert.equal(afterRows[0].n, before[0].n);
  await assert.rejects(
    as(db, U.tuA, `select generate_monthly_invoices($1, current_date)`, [S.A]),
    /SPP & pembayaran belum termasuk paket/);
  await setPlan(S.A, 'pro');
});

test('paket Gratis maksimal 100 murid aktif', async () => {
  await setPlan(S.B, 'free');
  // Sudah ada 1 murid aktif di sekolah B.
  await as(db, U.adminB,
    `insert into students (school_id, full_name) select $1, 'Murid ' || g from generate_series(1, 99) g`, [S.B]);
  await assert.rejects(
    as(db, U.adminB, `insert into students (school_id, full_name) values ($1, 'Murid 101')`, [S.B]),
    /Gratis maksimal 100 murid aktif/);
  // Murid lulus tidak dihitung, tetapi tidak bisa diaktifkan lagi selama penuh.
  await as(db, U.adminB, `insert into students (school_id, full_name, status) values ($1, 'Alumni', 'lulus')`, [S.B]);
  await assert.rejects(
    as(db, U.adminB, `update students set status = 'aktif' where school_id = $1 and full_name = 'Alumni'`, [S.B]),
    /maksimal 100/);
  await setPlan(S.B, 'basic');
  await as(db, U.adminB, `insert into students (school_id, full_name) values ($1, 'Murid 101')`, [S.B]);
});

test('dasbor yayasan hanya untuk yayasan yang berlangganan modul yayasan', async () => {
  const [{ id }] = await as(db, U.platform, `insert into foundations (name) values ('Yayasan Uji') returning id`);
  await as(db, U.platform, 'update schools set foundation_id = $1 where id in ($2, $3)', [id, S.A, S.B]);
  const [{ x }] = await as(db, U.platform, 'select foundation_has_module($1) x', [id]);
  assert.equal(x, false);
  await setPlan(S.A, 'enterprise');
  const [{ y }] = await as(db, U.platform, 'select foundation_has_module($1) y', [id]);
  assert.equal(y, true);
});

test('permintaan hapus akun: sekali per pengguna, admin sekolah & platform diberi tahu', async () => {
  const [r] = await as(db, U.ortuAndi, `select * from request_account_deletion('Anak sudah lulus')`);
  assert.equal(r.status, 'pending');
  await assert.rejects(as(db, U.ortuAndi, 'select request_account_deletion()'), /sedang diproses/);
  const [{ n }] = await as(db, U.adminA, `select count(*)::int n from notifications where kind = 'account.deletion_requested'`);
  assert.equal(n, 1);
  const [{ m }] = await as(db, U.platform, `select count(*)::int m from notifications where kind = 'account.deletion_requested'`);
  assert.equal(m, 1);
  // Pengguna lain & admin sekolah tidak bisa melihat atau memproses.
  assert.equal((await as(db, U.andi, 'select id from account_deletion_requests')).length, 0);
  await assert.rejects(as(db, U.adminA, 'select review_account_deletion($1, true)', [r.id]), /admin platform/);
  await as(db, U.platform, 'select review_account_deletion($1, false, $2)', [r.id, 'Masih ada tunggakan']);
  const [after] = await as(db, U.ortuAndi, 'select status from account_deletion_requests where id = $1', [r.id]);
  assert.equal(after.status, 'rejected');
  // Boleh mengajukan lagi setelah ditolak.
  await as(db, U.ortuAndi, 'select request_account_deletion()');
});
