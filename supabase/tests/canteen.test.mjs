// Tes kantin digital: kios & kasir, isi saldo (tunai & lewat tagihan), jajan dengan kartu, batas harian, pembatalan, setoran.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, asService, U, S } from './helpers.mjs';

const KASIR = '00000000-0000-0000-0000-0000000000a7';
let db, stall, card;
const one = async (uid, sql, params) => (await as(db, uid, sql, params))[0];
const balance = async (student = S.andi) =>
  Number((await db.query('select balance from canteen_wallets where student_id = $1', [student])).rows[0]?.balance ?? 0);

before(async () => {
  db = await freshDb();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'kantin@a.test', '{"full_name":"Bu Kantin"}')`, [KASIR]);
  await db.query(`insert into memberships (school_id, user_id, role) values ($1, $2, 'canteen')`, [S.A, KASIR]);
  ({ card_token: card } = (await db.query('select card_token from students where id = $1', [S.andi])).rows[0]);
});
after(async () => { await db?.end(); });

test('TU membuat kios dengan petugas kasir; sekolah tanpa paket kantin ditolak', async () => {
  ({ id: stall } = await one(U.tuA, `insert into canteen_stalls (school_id, name, operator_ids, commission_pct)
    values ($1, 'Kios Bu Rini', $2, 10) returning id`, [S.A, [KASIR]]));
  await assert.rejects(as(db, U.tuA, `insert into canteen_stalls (school_id, name, operator_ids) values ($1, 'Kios Asing', $2)`,
    [S.A, [U.adminB]]), /pengguna aktif sekolah ini/);
  await assert.rejects(as(db, U.guru1, `insert into canteen_stalls (school_id, name) values ($1, 'Kios Guru')`, [S.A]), /row-level security/);
  await assert.rejects(as(db, U.adminB, `insert into canteen_stalls (school_id, name) values ($1, 'Kios B')`, [S.B]),
    /Kantin digital belum termasuk paket/);
  // Kasir mengelola menu kiosnya sendiri.
  await as(db, KASIR, `insert into canteen_items (school_id, stall_id, name, price) values ($1, $2, 'Nasi goreng', 8000), ($1, $2, 'Es teh', 3000)`, [S.A, stall]);
  assert.equal((await as(db, U.andi, 'select name from canteen_items')).length, 2);
});

test('isi saldo tunai di TU; orang tua diberi tahu; kasir & guru tidak bisa', async () => {
  await assert.rejects(as(db, KASIR, 'select canteen_cash($1, 50000)', [S.andi]), /Hanya Tata Usaha/);
  await assert.rejects(as(db, U.guru1, 'select canteen_cash($1, 50000)', [S.andi]), /Hanya Tata Usaha/);
  const { r } = await one(U.tuA, 'select (canteen_cash($1, 20000, false, $2)).balance_after r', [S.andi, 'Setoran awal']);
  assert.equal(Number(r), 20000);
  const notes = await as(db, U.ortuAndi, `select title, body from notifications where kind = 'canteen.topup'`);
  assert.equal(notes.length, 1);
  assert.match(notes[0].body, /Rp20\.000/);
  // Tabel saldo tidak bisa diubah langsung.
  assert.equal((await as(db, U.tuA, 'update canteen_wallets set balance = 999999 returning balance')).length, 0);
  await assert.rejects(as(db, U.tuA, `insert into canteen_ledger (school_id, student_id, kind, amount, balance_after) values ($1, $2, 'topup', 1, 1)`,
    [S.A, S.andi]), /row-level security/);
});

test('jajan dengan kartu atau NIS; saldo kurang & kartu dibekukan ditolak', async () => {
  const look = (await one(KASIR, 'select canteen_lookup($1, $2) r', [stall, `sekolahapp:card:${card}`])).r;
  assert.equal(look.full_name, 'Andi');
  assert.equal(look.spendable, 20000);
  const { r } = await one(KASIR, `select canteen_charge($1, $2, 11000, '[{"name":"Nasi goreng","price":8000,"qty":1},{"name":"Es teh","price":3000,"qty":1}]') r`,
    [stall, card]);
  assert.equal(r.balance_after, 9000);
  // Saldo < Rp10.000 → orang tua diberi tahu sekali.
  await as(db, KASIR, `select canteen_charge($1, '2601', 1000)`, [stall]);
  assert.equal((await as(db, U.ortuAndi, `select id from notifications where kind = 'canteen.low_balance'`)).length, 1);
  await assert.rejects(as(db, KASIR, 'select canteen_charge($1, $2, 50000)', [stall, card]), /Saldo Andi tidak cukup \(sisa Rp8\.000\)/);
  await assert.rejects(as(db, KASIR, `select canteen_charge($1, 'tidakada', 1000)`, [stall]), /tidak dikenal/);
  await assert.rejects(as(db, U.guru1, 'select canteen_charge($1, $2, 1000)', [stall, card]), /bukan kasir/);
  // Kartu murid sekolah lain tidak dikenali.
  const { card_token: cardB } = (await db.query('select card_token from students where id = $1', [S.muridB])).rows[0];
  await assert.rejects(as(db, KASIR, 'select canteen_charge($1, $2, 1000)', [stall, cardB]), /tidak dikenal/);

  await assert.rejects(as(db, U.guru2, 'select canteen_set_controls($1, null, true)', [S.andi]), /Hanya orang tua/);
  await as(db, U.ortuAndi, 'select canteen_set_controls($1, null, true)', [S.andi]);
  await assert.rejects(as(db, KASIR, 'select canteen_charge($1, $2, 1000)', [stall, card]), /dibekukan/);
  await as(db, U.ortuAndi, 'select canteen_set_controls($1, 15000, false)', [S.andi]);   // batas Rp15.000/hari
  assert.equal(await balance(), 8000);
});

test('batas harian dihitung dari jajan hari ini, pembatalan mengembalikan saldo', async () => {
  await as(db, U.tuA, 'select canteen_cash($1, 50000)', [S.andi]);
  assert.equal((await one(KASIR, 'select canteen_lookup($1, $2) r', [stall, card])).r.spendable, 3000);   // 15.000 - 12.000
  await assert.rejects(as(db, KASIR, 'select canteen_charge($1, $2, 5000)', [stall, card]), /batas jajan harian Rp15\.000 \(sisa hari ini Rp3\.000\)/);
  const [{ id }] = await as(db, KASIR, `select id from canteen_ledger where kind = 'purchase' and amount = -11000`);
  await as(db, KASIR, `select canteen_void($1, 'Salah input')`, [id]);
  await assert.rejects(as(db, KASIR, 'select canteen_void($1)', [id]), /sudah dibatalkan/);
  assert.equal(await balance(), 69000);
  assert.equal((await one(KASIR, 'select canteen_lookup($1, $2) r', [stall, card])).r.spendable, 14000);
  // Transaksi kemarin hanya bisa dibatalkan TU.
  const { r: e } = await one(KASIR, 'select canteen_charge($1, $2, 2000) r', [stall, card]);
  await db.query(`update canteen_ledger set created_at = now() - interval '1 day' where id = $1`, [e.entry_id]);
  await assert.rejects(as(db, KASIR, 'select canteen_void($1)', [e.entry_id]), /hanya bisa membatalkan transaksi hari ini/);
  await as(db, U.tuA, 'select canteen_void($1)', [e.entry_id]);
});

test('orang tua & kasir melihat riwayat sesuai haknya', async () => {
  assert.ok((await as(db, U.ortuAndi, 'select id from canteen_ledger')).length >= 6);
  assert.equal((await as(db, U.andi, 'select balance from canteen_wallets')).length, 1);
  assert.equal((await as(db, U.bela, 'select id from canteen_ledger')).length, 0);
  // Kasir hanya melihat transaksi kiosnya (tanpa isi saldo), bukan saldo murid.
  const kinds = new Set((await as(db, KASIR, 'select kind from canteen_ledger')).map((r) => r.kind));
  assert.deepEqual([...kinds].sort(), ['purchase', 'refund']);
  assert.equal((await as(db, KASIR, 'select * from canteen_wallets')).length, 0);
  assert.equal((await as(db, U.guru2, 'select id from canteen_ledger')).length, 0);
  // Daftar transaksi kios untuk kasir memuat nama murid & status pembatalan.
  const list = await as(db, KASIR, 'select * from canteen_stall_entries($1, current_date - 1, current_date)', [stall]);
  assert.ok(list.every((r) => r.student_name === 'Andi'));
  assert.equal(list.filter((r) => r.kind === 'purchase' && r.refunded).length, 2);
  assert.equal((await as(db, U.guru2, 'select * from canteen_stall_entries($1, current_date - 1, current_date)', [stall])).length, 0);
});

test('isi saldo lewat tagihan: lunas menambah saldo, refund menariknya kembali', async () => {
  await assert.rejects(as(db, U.ortuAndi, 'select canteen_request_topup($1, 5000)', [S.andi]), /Rp10\.000 sampai/);
  await assert.rejects(as(db, U.ortuAndi, 'select canteen_request_topup($1, 25000)', [S.bela]), /tidak ditemukan/);
  const { id: first } = await one(U.ortuAndi, 'select canteen_request_topup($1, 25000) id', [S.andi]);
  const { id: inv } = await one(U.ortuAndi, 'select canteen_request_topup($1, 30000) id', [S.andi]);
  const rows = (await db.query('select id, status, total, title from invoices where canteen_topup order by created_at')).rows;
  assert.deepEqual(rows.map((r) => [r.id === first, r.status]), [[true, 'void'], [false, 'unpaid']]);
  assert.equal(Number(rows[1].total), 30000);
  const before = await balance();
  const { pid } = await one(U.tuA, `select (record_manual_payment($1, 30000)).id pid`, [inv]);
  assert.equal(await balance(), before + 30000);
  assert.equal((await as(db, U.ortuAndi, `select id from notifications where kind = 'payment.paid'`)).length, 1);
  await db.query(`update payments set status = 'refunded' where id = $1`, [pid]);
  assert.equal(await balance(), before);
  const [{ kind, note }] = (await db.query(`select kind, note from canteen_ledger order by created_at desc limit 1`)).rows;
  assert.equal(kind, 'adjust');
  assert.match(note, /dibatalkan/);
});

test('permintaan isi saldo kedaluwarsa dibatalkan tugas harian tanpa denda', async () => {
  await db.query(`update schools set settings = settings || '{"late_fee_amount": 5000}' where id = $1`, [S.A]);
  const { id } = await one(U.ortuAndi, 'select canteen_request_topup($1, 20000) id', [S.andi]);
  await db.query(`update invoices set due_on = current_date - 2 where id = $1`, [id]);
  await asService(db, 'select apply_late_fees($1)', [S.A]);
  assert.equal(Number((await db.query('select late_fee from invoices where id = $1', [id])).rows[0].late_fee), 0);
  await assert.rejects(as(db, U.ortuAndi, 'select canteen_expire_topups($1)', [S.A]), /permission denied/);
  const [{ n }] = await asService(db, 'select canteen_expire_topups($1) n', [S.A]);
  assert.equal(n, 1);
});

test('setoran kios mengunci transaksi dan menghitung bagi hasil', async () => {
  await assert.rejects(as(db, KASIR, 'select canteen_settle($1, current_date)', [stall]), /Hanya Tata Usaha/);
  const s = await one(U.tuA, `select * from canteen_settle($1, current_date, 'Setor minggu 1')`, [stall]);
  // Penjualan bersih: 1.000 + 2.000 (lalu dibatalkan TU) + 11.000 (dibatalkan) → 1.000
  assert.deepEqual([Number(s.gross), Number(s.commission), Number(s.net)], [1000, 100, 900]);
  await assert.rejects(as(db, U.tuA, 'select canteen_settle($1, current_date)', [stall]), /Tidak ada penjualan/);
  const [{ id }] = await as(db, U.tuA, `select id from canteen_ledger where kind = 'purchase' and amount = -1000`);
  await assert.rejects(as(db, U.tuA, 'select canteen_void($1)', [id]), /sudah disetorkan/);
  assert.equal((await as(db, KASIR, 'select id from canteen_settlements')).length, 1);
  assert.equal((await as(db, U.ortuAndi, 'select id from canteen_settlements')).length, 0);
});
