// Tes notifikasi WhatsApp: token, pengaturan kategori, antrean dari notifikasi, dan pengambilan antrean oleh Edge Function.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, asService, U, S } from './helpers.mjs';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

const notify = (user, kind, title = 'Judul', school = S.A) =>
  db.query(`insert into notifications (user_id, school_id, kind, title, body) values ($1, $2, $3, $4, 'isi') returning id`, [user, school, kind, title])
    .then((r) => r.rows[0].id);
const outbox = async () => (await db.query('select * from whatsapp_outbox order by created_at')).rows;

test('nomor WhatsApp dinormalkan', async () => {
  const { rows } = await db.query(`select wa_number('0812-3456-7890') a, wa_number('+62 812 3456 7890') b, wa_number('81234567890') c, wa_number('021') d, wa_number(null) e`);
  assert.deepEqual(rows[0], { a: '6281234567890', b: '6281234567890', c: '6281234567890', d: null, e: null });
});

test('token hanya bisa disimpan admin sekolah berpaket WhatsApp dan tidak bisa dibaca kembali', async () => {
  await assert.rejects(as(db, U.adminB, `select wa_set_token($1, 'tokenpanjang123')`, [S.B]), /Notifikasi WhatsApp belum termasuk paket/);
  await assert.rejects(as(db, U.guru1, `select wa_set_token($1, 'tokenpanjang123')`, [S.A]), /Hanya admin sekolah/);
  await assert.rejects(as(db, U.adminA, `select wa_set_token($1, 'pendek')`, [S.A]), /Token tidak valid/);
  await as(db, U.adminA, `select wa_set_token($1, 'tokenRahasia-AbCd')`, [S.A]);
  const [{ token_hint, is_enabled }] = await as(db, U.adminA, 'select token_hint, is_enabled from whatsapp_settings where school_id = $1', [S.A]);
  assert.equal(token_hint, 'AbCd');
  assert.equal(is_enabled, false);
  assert.equal((await as(db, U.adminA, 'select * from whatsapp_tokens')).length, 0);
  assert.equal((await as(db, U.kepsekA, 'select school_id from whatsapp_settings')).length, 1);   // kepsek boleh melihat
  assert.equal((await as(db, U.guru1, 'select school_id from whatsapp_settings')).length, 0);
  assert.equal((await as(db, U.kepsekA, 'update whatsapp_settings set is_enabled = true returning school_id')).length, 0);
  await as(db, U.adminA, `update whatsapp_settings set is_enabled = true, categories = array['kehadiran', 'tagihan', 'pengumuman'] where school_id = $1`, [S.A]);
  await assert.rejects(as(db, U.adminA, `update whatsapp_settings set categories = array['lain'] where school_id = $1`, [S.A]), /check/);
});

test('notifikasi kategori aktif masuk antrean bila penerima punya nomor dan tidak berhenti langganan', async () => {
  await db.query(`update profiles set phone = '0812 3456 7890' where id = $1`, [U.ortuAndi]);
  await notify(U.ortuAndi, 'attendance.absent', 'Anak Anda tercatat tidak hadir');
  await notify(U.ortuAndi, 'assignment.new');            // kategori akademik tidak diaktifkan
  await notify(U.ortuAndi, 'group.invited');             // tidak punya kategori WA
  await notify(U.andi, 'announcement');                  // Andi belum punya nomor HP
  let rows = await outbox();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phone, '6281234567890');
  assert.equal(rows[0].title, 'Anak Anda tercatat tidak hadir');
  await db.query(`update profiles set wa_opt_out = true where id = $1`, [U.ortuAndi]);
  await notify(U.ortuAndi, 'invoice.new');
  assert.equal((await outbox()).length, 1);
  await db.query(`update profiles set wa_opt_out = false where id = $1`, [U.ortuAndi]);
  await as(db, U.adminA, `update whatsapp_settings set is_enabled = false where school_id = $1`, [S.A]);
  await notify(U.ortuAndi, 'invoice.new');
  assert.equal((await outbox()).length, 1);
  await as(db, U.adminA, `update whatsapp_settings set is_enabled = true where school_id = $1`, [S.A]);
  // Admin & kepsek melihat log, orang tua tidak.
  assert.equal((await as(db, U.adminA, 'select id from whatsapp_outbox')).length, 1);
  assert.equal((await as(db, U.ortuAndi, 'select id from whatsapp_outbox')).length, 0);
});

test('Edge Function mengambil antrean beserta token; klien biasa tidak bisa', async () => {
  const id = await notify(U.ortuAndi, 'payment.paid', 'Pembayaran diterima');
  await assert.rejects(as(db, U.adminA, 'select * from wa_claim(null, 10)'), /permission denied/);
  // Mode webhook: hanya baris milik notifikasi itu.
  let rows = await asService(db, 'select * from wa_claim($1, 10)', [id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Pembayaran diterima');
  assert.equal(rows[0].api_token, 'tokenRahasia-AbCd');
  assert.equal(rows[0].school_name, 'SMP Harapan Bangsa');
  // Mode terjadwal: hanya antrean yang sudah lewat 1 menit (memberi kesempatan webhook lebih dulu).
  assert.equal((await asService(db, 'select * from wa_claim(null, 10)')).length, 0);
  await db.query(`update whatsapp_outbox set created_at = now() - interval '5 minutes'`);
  rows = await asService(db, 'select * from wa_claim(null, 10)');
  assert.equal(rows.length, 2);
  // Setelah 5 kali percobaan tidak diambil lagi.
  await db.query(`update whatsapp_outbox set attempts = 5`);
  assert.equal((await asService(db, 'select * from wa_claim(null, 10)')).length, 0);
});

test('menghapus token mematikan WhatsApp', async () => {
  await as(db, U.adminA, `select wa_set_token($1, '')`, [S.A]);
  const [{ token_hint, is_enabled }] = await as(db, U.adminA, 'select token_hint, is_enabled from whatsapp_settings where school_id = $1', [S.A]);
  assert.equal(token_hint, null);
  assert.equal(is_enabled, false);
  assert.equal((await db.query('select count(*)::int n from whatsapp_tokens')).rows[0].n, 0);
});
