// Tes identitas & merek sekolah: logo, moto, warna (whitelabel), dan halaman masuk publik.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

const anon = async (sql, params = []) => {
  await db.query('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await db.query('set local role anon');
    return (await db.query(sql, params)).rows;
  } finally { await db.query('rollback'); }
};

test('admin sekolah mengisi moto, visi, dan kontak; guru tidak bisa', async () => {
  await as(db, U.adminA, `update schools set motto = 'Cerdas, Santun, Berkarakter', vision = 'Unggul', email = 'tu@smpa.sch.id' where id = $1`, [S.A]);
  const [s] = await as(db, U.guru1, 'select motto, email from schools where id = $1', [S.A]);
  assert.equal(s.motto, 'Cerdas, Santun, Berkarakter');
  const r = await as(db, U.guru1, `update schools set motto = 'x' where id = $1 returning id`, [S.A]);
  assert.equal(r.length, 0);
  await assert.rejects(as(db, U.adminA, `update schools set email = 'bukan-email' where id = $1`, [S.A]), /check/);
});

test('warna & nama aplikasi hanya untuk paket Enterprise', async () => {
  await assert.rejects(
    as(db, U.adminA, `update schools set brand_color = '#0f766e' where id = $1`, [S.A]),
    /paket Enterprise/);
  await as(db, U.platform, `update schools set plan = 'enterprise' where id = $1`, [S.A]);
  await as(db, U.adminA, `update schools set brand_color = '#0f766e', app_name = 'SMP A Digital' where id = $1`, [S.A]);
  await assert.rejects(as(db, U.adminA, `update schools set brand_color = 'merah' where id = $1`, [S.A]), /check/);

  const [{ b }] = await as(db, U.ortuAndi, 'select school_brand($1) b', [S.A]);
  assert.equal(b.brand_color, '#0f766e');
  assert.equal(b.app_name, 'SMP A Digital');

  // Turun paket: warna tersimpan tapi tidak berlaku, dan boleh dikosongkan.
  await as(db, U.platform, `update schools set plan = 'pro' where id = $1`, [S.A]);
  const [{ b: b2 }] = await as(db, U.ortuAndi, 'select school_brand($1) b', [S.A]);
  assert.equal(b2.brand_color, null);
  assert.equal(b2.app_name, null);
  await as(db, U.adminA, `update schools set brand_color = null, app_name = null, motto = 'Tetap' where id = $1`, [S.A]);
});

test('halaman masuk publik hanya membuka data merek', async () => {
  const [{ slug }] = await as(db, U.adminA, 'select slug from schools where id = $1', [S.A]);
  const [{ p }] = await anon('select school_public_profile($1) p', [slug.toUpperCase()]);
  assert.equal(p.motto, 'Tetap');
  assert.deepEqual(Object.keys(p).sort(), ['app_name', 'brand_color', 'logo_url', 'motto', 'name', 'slug']);
  const [{ p: none }] = await anon(`select school_public_profile('tidak-ada') p`);
  assert.equal(none, null);
  await assert.rejects(anon('select school_brand($1)', [S.A]), /permission denied/);
  // Tabel sekolah sendiri tetap tertutup untuk pengunjung yang belum masuk.
  const rows = await anon('select phone from schools').catch(() => []);
  assert.equal(rows.length, 0);
});

test('logo: admin sekolah bisa mengganti & menghapus berkas sekolahnya saja', async () => {
  await as(db, U.adminA, `insert into storage.objects (bucket_id, name) values ('school-assets', $1)`, [`${S.A}/logo-1.png`]);
  const up = await as(db, U.adminA, `update storage.objects set name = $2 where name = $1 returning name`, [`${S.A}/logo-1.png`, `${S.A}/logo-2.png`]);
  assert.equal(up.length, 1);
  const otherDel = await as(db, U.adminB, `delete from storage.objects where name = $1 returning name`, [`${S.A}/logo-2.png`]);
  assert.equal(otherDel.length, 0);
  const del = await as(db, U.adminA, `delete from storage.objects where name = $1 returning name`, [`${S.A}/logo-2.png`]);
  assert.equal(del.length, 1);
  await assert.rejects(as(db, U.adminB, `insert into storage.objects (bucket_id, name) values ('school-assets', $1)`, [`${S.A}/x.png`]), /row-level security/);
});

test('NIP penanda tangan tampil di rapor', async () => {
  await as(db, U.kepsekA, `update profiles set nip = '19800101 200501 1 001' where id = auth.uid()`);
  const [{ t }] = await as(db, U.adminA,
    `insert into terms (school_id, academic_year_id, name, semester, starts_on, ends_on)
     select $1, id, 'Ganjil', 1, '2026-07-13', '2026-12-19' from academic_years where school_id = $1 and is_active returning id t`, [S.A]);
  const [{ v }] = await as(db, U.guru1, 'select report_card_view($1, $2) v', [t, S.andi]);
  assert.equal(v.principal_nip, '19800101 200501 1 001');
  assert.equal(v.school.motto, 'Tetap');
});
