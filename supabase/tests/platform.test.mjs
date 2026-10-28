// Tes platform: pendaftaran sekolah mandiri, ganti paket, ringkasan platform & yayasan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, asService, U, S } from './helpers.mjs';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

const NEW_USER = '00000000-0000-0000-0000-0000000000e1';

test('pengguna baru mendaftarkan sekolah: paket Gratis, jadi admin, tahun ajaran aktif', async () => {
  await db.query(`insert into auth.users (id, email) values ($1, 'baru@contoh.id')`, [NEW_USER]);
  const [{ id }] = await as(db, NEW_USER, `select register_school('SD Cahaya Ilmu', 'SD', '20100001') id`);
  const [school] = await as(db, NEW_USER, 'select name, plan, slug from schools where id = $1', [id]);
  assert.equal(school.plan, 'free');
  assert.match(school.slug, /^sd-cahaya-ilmu-[a-f0-9]{5}$/);
  const roles = await as(db, NEW_USER, 'select role from my_roles()');
  assert.deepEqual(roles.map((r) => r.role), ['school_admin']);
  const [year] = await as(db, NEW_USER, 'select is_active from academic_years where school_id = $1', [id]);
  assert.equal(year.is_active, true);
  // Admin platform diberi tahu.
  const [{ n }] = await as(db, U.platform, `select count(*) n from notifications where kind = 'school.registered'`);
  assert.equal(Number(n), 1);
  // NPSN yang sama ditolak.
  await assert.rejects(as(db, NEW_USER, `select register_school('SD Lain', 'SD', '20100001')`), /sudah terdaftar/);
});

test('admin sekolah tidak bisa mengubah paket sendiri; ajukan lalu disetujui admin platform', async () => {
  await assert.rejects(as(db, U.adminA, `update schools set plan = 'enterprise' where id = $1`, [S.A]), /admin platform/);
  await assert.rejects(as(db, U.guru1, `select request_plan_change($1, 'enterprise')`, [S.A]), /admin sekolah/);
  const [req] = await as(db, U.adminA, `select * from request_plan_change($1, 'enterprise', 'Butuh dasbor yayasan')`, [S.A]);
  assert.equal(req.status, 'pending');
  await assert.rejects(as(db, U.adminA, `select request_plan_change($1, 'basic')`, [S.A]), /menunggu/);
  await assert.rejects(as(db, U.adminA, `select review_plan_change($1, true)`, [req.id]), /admin platform/);
  await as(db, U.platform, `select review_plan_change($1, true, 'Disetujui')`, [req.id]);
  const [s] = await as(db, U.adminA, 'select plan from schools where id = $1', [S.A]);
  assert.equal(s.plan, 'enterprise');
  const [{ n }] = await as(db, U.adminA, `select count(*) n from notifications where kind = 'plan.reviewed'`);
  assert.equal(Number(n), 1);
});

test('admin sekolah tidak bisa memberi diri sendiri harga khusus', async () => {
  await assert.rejects(
    as(db, U.adminA, `update schools set settings = settings || '{"custom_price_per_student": 0}' where id = $1`, [S.A]),
    /admin platform/);
  // Pengaturan lain tetap boleh diubah.
  await as(db, U.adminA, `update schools set settings = settings || '{"late_after_minutes": 10}' where id = $1`, [S.A]);
  await as(db, U.platform, `update schools set settings = settings || '{"custom_price_per_student": 4500}' where id = $1`, [S.A]);
});

test('turun ke paket Gratis ditolak bila murid melebihi batas', async () => {
  await db.query(`insert into students (school_id, full_name) select $1, 'Murid ' || g from generate_series(1, 101) g`, [S.A]);
  const [req] = await as(db, U.adminA, `select * from request_plan_change($1, 'free')`, [S.A]);
  await assert.rejects(as(db, U.platform, `select review_plan_change($1, true)`, [req.id]), /melebihi batas/);
  await as(db, U.adminA, 'select cancel_plan_change($1)', [req.id]);
});

test('ringkasan platform hanya untuk admin platform', async () => {
  await assert.rejects(as(db, U.adminA, 'select platform_overview()'), /admin platform/);
  const [{ platform_overview: o }] = await as(db, U.platform, 'select platform_overview()');
  assert.ok(o.schools_active >= 3);
  assert.ok(o.mrr > 0);
  const schools = await as(db, U.platform, 'select name, students, admin_email from platform_schools()');
  assert.ok(schools.find((s) => s.name === 'SD Cahaya Ilmu' && s.admin_email === 'baru@contoh.id'));
  const [{ n }] = await as(db, U.platform, `select generate_platform_bills(date '2026-10-01') n`);
  assert.ok(n >= 2);
  const bills = await as(db, U.adminA, 'select gross_amount from platform_bills where school_id = $1', [S.A]);
  assert.equal(bills.length, 1);
});

test('admin yayasan melihat ringkasan semua sekolahnya, bukan yayasan lain', async () => {
  const [{ id: f }] = (await db.query(`insert into foundations (name) values ('Yayasan Harapan') returning id`)).rows;
  await asService(db, 'update schools set foundation_id = $1 where id = $2', [f, S.A]);
  await db.query('insert into foundation_admins (foundation_id, user_id) values ($1, $2)', [f, NEW_USER]);
  const rows = await as(db, NEW_USER, 'select name, students from foundation_overview($1)', [f]);
  assert.deepEqual(rows.map((r) => r.name), ['SMP Harapan Bangsa']);
  const [{ my_admin_scopes: scopes }] = await as(db, NEW_USER, 'select my_admin_scopes()');
  assert.equal(scopes.foundations[0].name, 'Yayasan Harapan');
  await assert.rejects(as(db, U.adminA, 'select * from foundation_overview($1)', [f]), /Tidak berwenang/);
});
