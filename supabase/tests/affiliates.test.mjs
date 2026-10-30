// Tes program affiliator: pendaftaran, kode referral saat daftar sekolah, komisi dari tagihan lunas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, asService, U } from './helpers.mjs';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

const AFF = '00000000-0000-0000-0000-0000000000f1';
const OWNER = '00000000-0000-0000-0000-0000000000f2';
let aff;

test('pengguna mendaftar jadi affiliator, menunggu persetujuan admin platform', async () => {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'mitra@contoh.id', '{"full_name":"Rina Mitra"}'), ($2, 'kepala@contoh.id', '{"full_name":"Budi"}')`, [AFF, OWNER]);
  await assert.rejects(as(db, AFF, `select apply_affiliate('', 'BCA', '123', 'Rina')`), /HP/);
  [aff] = await as(db, AFF, `select * from apply_affiliate('081234567890', 'BCA', '1234567', 'Rina Mitra', 'Saya pengawas sekolah')`);
  assert.equal(aff.status, 'pending');
  assert.match(aff.code, /^RINAM[0-9A-F]{4}$/);
  assert.equal(Number(aff.commission_pct), 20);
  assert.equal(aff.commission_months, 12);
  const [{ n }] = await as(db, U.platform, `select count(*) n from notifications where kind = 'affiliate.applied'`);
  assert.equal(Number(n), 1);
  // Memanggil lagi hanya memperbarui data rekening, kode tetap.
  const [again] = await as(db, AFF, `select * from apply_affiliate('081234567890', 'BRI', '999', 'Rina Mitra')`);
  assert.equal(again.code, aff.code);
  assert.equal(again.bank_name, 'BRI');
  // Affiliator tidak bisa menyetujui diri sendiri atau mengubah persentase.
  await assert.rejects(as(db, AFF, `select review_affiliate($1, 'active')`, [aff.id]), /admin platform/);
  await as(db, AFF, `update affiliates set commission_pct = 90 where id = $1`, [aff.id]);
  const [row] = await as(db, AFF, 'select commission_pct, status from affiliates where id = $1', [aff.id]);
  assert.equal(Number(row.commission_pct), 20);
  // Kode belum aktif belum bisa dipakai.
  const [{ ok }] = await as(db, OWNER, 'select affiliate_code_valid($1) ok', [aff.code]);
  assert.equal(ok, false);
  await as(db, U.platform, `select review_affiliate($1, 'active')`, [aff.id]);
  const [{ my_admin_scopes: scopes }] = await as(db, AFF, 'select my_admin_scopes()');
  assert.equal(scopes.affiliate, 'active');
});

test('sekolah yang didaftarkan dengan kode affiliator tercatat sebagai referral', async () => {
  await assert.rejects(as(db, OWNER, `select register_school('SD Salah Kode', 'SD', null, null, null, 'XXXX9999')`), /tidak ditemukan/);
  const [{ id }] = await as(db, OWNER, `select register_school('SD Mitra Jaya', 'SD', null, null, null, lower($1)) id`, [aff.code]);
  const rows = await as(db, AFF, 'select name, plan, students from my_affiliate_schools()');
  assert.deepEqual(rows.map((r) => r.name), ['SD Mitra Jaya']);
  const [{ n }] = await as(db, AFF, `select count(*) n from notifications where kind = 'affiliate.school'`);
  assert.equal(Number(n), 1);
  // Affiliator lain/pengguna biasa tidak melihat referral orang lain.
  assert.equal((await as(db, OWNER, 'select * from affiliate_referrals')).length, 0);
  assert.equal((await as(db, U.adminA, 'select * from my_affiliate_schools()')).length, 0);
  // Affiliator yang mendaftarkan sekolahnya sendiri tidak mendapat referral.
  const [{ id: own }] = await as(db, AFF, `select register_school('SD Milik Rina', 'SD', null, null, null, $1) id`, [aff.code]);
  const [{ n: refs }] = await db.query('select count(*) n from affiliate_referrals where school_id = $1', [own]).then((r) => r.rows);
  assert.equal(Number(refs), 0);

  // Tagihan langganan lunas menghasilkan komisi 20%.
  await asService(db, `update schools set plan = 'basic' where id = $1`, [id]);
  await db.query(`insert into students (school_id, full_name) select $1, 'Murid ' || g from generate_series(1, 50) g`, [id]);
  const period = new Date().toISOString().slice(0, 7) + '-01';
  const [bill] = await as(db, U.platform, 'select * from compute_platform_bill($1, $2)', [id, period]);
  assert.equal(Number(bill.gross_amount), 150000);
  assert.equal((await as(db, AFF, 'select * from affiliate_commissions')).length, 0);
  await as(db, U.platform, `update platform_bills set status = 'paid' where id = $1`, [bill.id]);
  const [c] = await as(db, AFF, 'select amount, status from affiliate_commissions');
  assert.equal(Number(c.amount), 30000);
  assert.equal(c.status, 'pending');
  // Lunas dicabut: komisi batal; ditandai lunas lagi: aktif kembali.
  await as(db, U.platform, `update platform_bills set status = 'open' where id = $1`, [bill.id]);
  assert.equal((await as(db, AFF, 'select status from affiliate_commissions'))[0].status, 'void');
  await as(db, U.platform, `update platform_bills set status = 'paid' where id = $1`, [bill.id]);
  assert.equal((await as(db, AFF, 'select status from affiliate_commissions'))[0].status, 'pending');

  // Tagihan setelah masa komisi (12 bulan) tidak menghasilkan komisi.
  const late = new Date(); late.setMonth(late.getMonth() + 13);
  const [lateBill] = await as(db, U.platform, 'select * from compute_platform_bill($1, $2)', [id, late.toISOString().slice(0, 7) + '-01']);
  await as(db, U.platform, `update platform_bills set status = 'paid' where id = $1`, [lateBill.id]);
  assert.equal((await as(db, AFF, 'select * from affiliate_commissions')).length, 1);
});

test('admin platform membayar komisi dan mengatur referral sekolah', async () => {
  await assert.rejects(as(db, AFF, 'select pay_affiliate_commissions($1)', [aff.id]), /admin platform/);
  const [list] = await as(db, U.platform, 'select * from platform_affiliates()');
  assert.equal(Number(list.pending), 30000);
  assert.equal(list.schools, 1);
  const [{ total }] = await as(db, U.platform, `select pay_affiliate_commissions($1, 'TRF-001') total`, [aff.id]);
  assert.equal(Number(total), 30000);
  await assert.rejects(as(db, U.platform, 'select pay_affiliate_commissions($1)', [aff.id]), /Tidak ada komisi/);
  const [s] = await as(db, AFF, 'select earned, pending from my_affiliate_schools()');
  assert.equal(Number(s.earned), 30000);
  assert.equal(Number(s.pending), 0);
  // Komisi yang sudah ditransfer tidak ikut batal.
  const [{ id: bill }] = (await db.query(`select bill_id id from affiliate_commissions`)).rows;
  await as(db, U.platform, `update platform_bills set status = 'open' where id = $1`, [bill]);
  assert.equal((await as(db, AFF, 'select status from affiliate_commissions'))[0].status, 'paid');

  // Hubungkan sekolah lama secara manual, lalu lepaskan.
  const sA = '00000000-0000-0000-0000-00000000aaaa';
  await assert.rejects(as(db, U.adminA, 'select set_school_affiliate($1, $2)', [sA, aff.code]), /admin platform/);
  await as(db, U.platform, 'select set_school_affiliate($1, $2)', [sA, aff.code]);
  assert.equal((await as(db, AFF, 'select * from my_affiliate_schools()')).length, 2);
  await as(db, U.platform, 'select set_school_affiliate($1, null)', [sA]);
  assert.equal((await as(db, AFF, 'select * from my_affiliate_schools()')).length, 1);

  // Affiliator dibekukan: tidak ada komisi baru, kode tidak berlaku.
  await as(db, U.platform, `select review_affiliate($1, 'suspended', null, null, 'Pelanggaran')`, [aff.id]);
  await assert.rejects(as(db, OWNER, `select register_school('SD Lain Lagi', 'SD', null, null, null, $1)`, [aff.code]), /tidak ditemukan/);
});
