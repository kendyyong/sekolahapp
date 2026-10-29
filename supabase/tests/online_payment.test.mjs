// Tes penanda pembayaran online: tombol "Bayar online" hanya muncul bila akun pembayaran sekolah sudah aktif.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db;
const enabled = async (uid, school) => (await as(db, uid, 'select online_payment_enabled($1) ok', [school]))[0].ok;

before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

test('belum aktif sampai akun pembayaran sekolah berstatus live', async () => {
  await db.query('delete from school_payment_accounts');
  assert.equal(await enabled(U.ortuAndi, S.A), false);
  await db.query(`insert into school_payment_accounts (school_id, sub_account_id, status) values ($1, 'sub-a', 'pending')`, [S.A]);
  assert.equal(await enabled(U.ortuAndi, S.A), false);
  await db.query(`update school_payment_accounts set status = 'live' where school_id = $1`, [S.A]);
  assert.equal(await enabled(U.ortuAndi, S.A), true);
  assert.equal(await enabled(U.andi, S.A), true);
  // Orang tua tetap tidak bisa membaca rincian akun pembayaran.
  assert.equal((await as(db, U.ortuAndi, 'select * from school_payment_accounts')).length, 0);
  // Pengguna sekolah lain tidak mendapat informasi sekolah A.
  assert.equal(await enabled(U.adminB, S.A), false);
  await db.query(`update school_payment_accounts set status = 'suspended' where school_id = $1`, [S.A]);
  assert.equal(await enabled(U.ortuAndi, S.A), false);
});
