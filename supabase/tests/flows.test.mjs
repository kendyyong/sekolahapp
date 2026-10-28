// Tes alur utama: izin murid, cuti guru, kelompok kerja, tugas, SPP, absensi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, asService, U, S } from './helpers.mjs';

let db;
before(async () => { db = await freshDb(); });
after(async () => { await db?.end(); });

const notifCount = async (uid, kind) =>
  Number((await as(db, uid, 'select count(*) n from notifications where kind = $1', [kind]))[0].n);

test('izin murid: orang tua ajukan, wali kelas setujui, absensi otomatis', async () => {
  const [req] = await as(db, U.ortuAndi, `
    insert into student_leave_requests (school_id, student_id, kind, starts_on, ends_on, reason, attachment_path)
    values ($1, $2, 'sakit', '2026-11-02', '2026-11-03', 'Demam', $3) returning id, status`,
    [S.A, S.andi, `${S.A}/${S.andi}/surat.pdf`]);
  assert.equal(req.status, 'pending');
  assert.equal(await notifCount(U.guru1, 'leave.submitted'), 1);

  // Wali kelas lain (guru2) tidak boleh memutuskan.
  await assert.rejects(as(db, U.guru2, 'select review_student_leave($1, true)', [req.id]), /wali kelas/);
  // Orang tua tidak bisa mengubah status sendiri.
  const upd = await as(db, U.ortuAndi, `update student_leave_requests set status = 'approved' where id = $1 returning id`, [req.id]);
  assert.equal(upd.length, 0);

  await as(db, U.guru1, 'select review_student_leave($1, true, $2)', [req.id, 'Semoga lekas sembuh']);
  const att = await as(db, U.ortuAndi, 'select date::text, status from student_attendance where student_id = $1 order by date', [S.andi]);
  assert.deepEqual(att, [{ date: '2026-11-02', status: 'sakit' }, { date: '2026-11-03', status: 'sakit' }]);
  assert.equal(await notifCount(U.ortuAndi, 'leave.reviewed'), 1);
  await assert.rejects(as(db, U.guru1, 'select review_student_leave($1, false, $2)', [req.id, 'x']), /sudah diproses/);
});

test('izin ditolak wajib beralasan; izin panjang diteruskan ke BK', async () => {
  const [r1] = await as(db, U.guru1, `
    insert into student_leave_requests (school_id, student_id, kind, starts_on, ends_on, reason)
    values ($1, $2, 'izin', '2026-11-09', '2026-11-09', 'Acara keluarga') returning id`, [S.A, S.bela]);
  await assert.rejects(as(db, U.guru1, 'select review_student_leave($1, false)', [r1.id]), /Alasan penolakan/);

  const [r2] = await as(db, U.ortuAndi, `
    insert into student_leave_requests (school_id, student_id, kind, starts_on, ends_on, reason)
    values ($1, $2, 'sakit', '2026-11-16', '2026-11-21', 'Rawat inap') returning id`, [S.A, S.andi]);
  await as(db, U.guru1, 'select review_student_leave($1, true)', [r2.id]);
  assert.equal(await notifCount(U.bkA, 'leave.escalated'), 1);
});

test('cuti guru: kepsek setujui, kuota berkurang, guru pengganti diberi tahu', async () => {
  const [r] = await as(db, U.guru2, `
    insert into staff_leave_requests (school_id, kind, starts_on, ends_on, reason, substitute_id)
    values ($1, 'tahunan', '2026-12-01', '2026-12-03', 'Keperluan keluarga', $2) returning id`, [S.A, U.guru1]);
  assert.equal(await notifCount(U.kepsekA, 'staff_leave.submitted'), 1);
  await assert.rejects(as(db, U.adminA, 'select review_staff_leave($1, true)', [r.id]), /kepala sekolah/);
  await as(db, U.kepsekA, 'select review_staff_leave($1, true)', [r.id]);
  const [bal] = await as(db, U.guru2, 'select * from staff_leave_balance($1, $2, 2026)', [S.A, U.guru2]);
  assert.deepEqual(bal, { quota: 12, used: 3, remaining: 9 });
  assert.equal(await notifCount(U.guru1, 'staff_leave.substitute'), 1);
  const att = await as(db, U.guru2, `select count(*)::int n from staff_attendance where user_id = $1 and status = 'cuti'`, [U.guru2]);
  assert.equal(att[0].n, 3);

  // Melebihi kuota ditolak sistem.
  const [r2] = await as(db, U.guru2, `
    insert into staff_leave_requests (school_id, kind, starts_on, ends_on, reason)
    values ($1, 'tahunan', '2026-12-07', '2026-12-19', 'Liburan panjang') returning id`, [S.A]);
  await assert.rejects(as(db, U.kepsekA, 'select review_staff_leave($1, true)', [r2.id]), /tidak mencukupi/);
});

test('kelompok kerja: jabatan lengkap, diverifikasi guru, kas oleh bendahara', async () => {
  const [g] = await as(db, U.andi, `select * from create_work_group($1, 'Kelompok Pecahan', $2)`, [S.class7A, S.taMtk7A]);
  // Murid kelas lain tidak boleh diundang.
  await assert.rejects(as(db, U.andi, `select invite_group_member($1, $2, 'anggota')`, [g.id, S.dodi]), /bukan anggota kelas/);
  await as(db, U.andi, `select invite_group_member($1, $2, 'sekretaris')`, [g.id, S.bela]);
  // Bukan ketua tidak boleh mengundang.
  await assert.rejects(as(db, U.bela, `select invite_group_member($1, $2, 'bendahara')`, [g.id, S.citra]), /Ketua/);
  await as(db, U.andi, `select invite_group_member($1, $2, 'bendahara')`, [g.id, S.citra]);
  await assert.rejects(as(db, U.andi, 'select submit_work_group($1)', [g.id]), /belum dijawab/);
  await as(db, U.bela, 'select respond_group_invite($1, true)', [g.id]);
  await as(db, U.citra, 'select respond_group_invite($1, true)', [g.id]);
  await as(db, U.andi, 'select submit_work_group($1)', [g.id]);
  assert.equal(await notifCount(U.guru1, 'group.submitted'), 1);

  await assert.rejects(as(db, U.guru2, `select review_work_group($1, 'verified')`, [g.id]), /tidak berwenang/i);
  await as(db, U.guru1, `select review_work_group($1, 'verified')`, [g.id]);

  await assert.rejects(
    as(db, U.andi, `insert into group_ledger (group_id, school_id, direction, amount, description) values ($1, $2, 'masuk', 5000, 'Iuran')`, [g.id, S.A]),
    /row-level security/);
  await as(db, U.citra, `insert into group_ledger (group_id, school_id, direction, amount, description) values ($1, $2, 'masuk', 5000, 'Iuran')`, [g.id, S.A]);
  const ledger = await as(db, U.bela, 'select amount::int from group_ledger');
  assert.deepEqual(ledger, [{ amount: 5000 }]);
});

test('kelompok tanpa sekretaris/bendahara tidak bisa diajukan', async () => {
  const [g] = await as(db, U.bela, `select * from create_work_group($1, 'Kelompok Dua')`, [S.class7A]);
  await assert.rejects(as(db, U.bela, 'select submit_work_group($1)', [g.id]), /sekretaris, bendahara/);
});

test('tugas kelompok: satu pengumpulan untuk semua anggota, dinilai guru', async () => {
  const [a] = await as(db, U.guru1, `
    insert into assignments (school_id, teaching_assignment_id, kind, title, is_group, due_at)
    values ($1, $2, 'proyek', 'Proyek Pecahan', true, now() + interval '3 days') returning id`, [S.A, S.taMtk7A]);
  assert.equal(await notifCount(U.andi, 'assignment.new'), 1);
  // Guru lain tidak bisa membuat tugas di mapel ini.
  await assert.rejects(as(db, U.guru2, `
    insert into assignments (school_id, teaching_assignment_id, title) values ($1, $2, 'X')`, [S.A, S.taMtk7A]), /row-level security/);

  const subs = await as(db, U.bela, `select * from submit_assignment($1, 'Jawaban kelompok')`, [a.id]);
  assert.equal(subs.length, 3);
  const mine = await as(db, U.citra, 'select id, body from submissions where assignment_id = $1', [a.id]);
  assert.equal(mine[0].body, 'Jawaban kelompok');

  await assert.rejects(as(db, U.guru1, 'select grade_submission($1, 120)', [mine[0].id]), /antara 0 dan/);
  await as(db, U.guru1, `select grade_submission($1, 88, 'Bagus')`, [mine[0].id]);
  await assert.rejects(as(db, U.citra, `select * from submit_assignment($1, 'ubah')`, [a.id]), /sudah dinilai/);
});

test('tugas individu: murid kelas lain tidak bisa mengumpulkan', async () => {
  const [a] = await as(db, U.guru1, `
    insert into assignments (school_id, teaching_assignment_id, kind, title, due_at)
    values ($1, $2, 'pr', 'PR Hal. 12', now() - interval '1 hour') returning id`, [S.A, S.taMtk7A]);
  await assert.rejects(as(db, U.dodi, `select * from submit_assignment($1, 'x')`, [a.id]), /tidak terdaftar/);
  const [s] = await as(db, U.andi, `select * from submit_assignment($1, 'Jawaban saya')`, [a.id]);
  assert.equal(s.is_late, true);
});

test('SPP: tagihan bulanan, beasiswa, pembayaran tunai parsial lalu lunas', async () => {
  await assert.rejects(as(db, U.guru1, 'select generate_monthly_invoices($1, $2)', [S.A, '2026-11-01']), /Tata Usaha/);
  const [{ generate_monthly_invoices: n }] = await as(db, U.tuA, 'select generate_monthly_invoices($1, $2)', [S.A, '2026-11-15']);
  assert.equal(n, 4);
  // Dijalankan lagi tidak menggandakan.
  const [{ generate_monthly_invoices: n2 }] = await as(db, U.tuA, 'select generate_monthly_invoices($1, $2)', [S.A, '2026-11-01']);
  assert.equal(n2, 0);

  const [citra] = await as(db, U.tuA, 'select total::int, due_on::text from invoices where student_id = $1', [S.citra]);
  assert.deepEqual(citra, { total: 225000 + 25000, due_on: '2026-11-10' });

  const [inv] = await as(db, U.ortuAndi, 'select id, total::int, status from invoices where student_id = $1', [S.andi]);
  assert.equal(inv.total, 475000);
  assert.equal(await notifCount(U.ortuAndi, 'invoice.new'), 1);

  await assert.rejects(as(db, U.tuA, `select record_manual_payment($1, 500000)`, [inv.id]), /sisa tagihan/);
  await as(db, U.tuA, `select record_manual_payment($1, 200000)`, [inv.id]);
  let [st] = await as(db, U.ortuAndi, 'select status, paid_amount::int from invoices where id = $1', [inv.id]);
  assert.deepEqual(st, { status: 'partial', paid_amount: 200000 });
  await as(db, U.tuA, `select record_manual_payment($1, 275000, 'transfer')`, [inv.id]);
  [st] = await as(db, U.ortuAndi, 'select status from invoices where id = $1', [inv.id]);
  assert.equal(st.status, 'paid');
  const receipts = await as(db, U.ortuAndi, 'select receipt_number from payments where invoice_id = $1', [inv.id]);
  assert.ok(receipts.every((r) => /^KW\/\d{4}\/\d{2}\/\d{6}$/.test(r.receipt_number)));
  assert.equal(await notifCount(U.ortuAndi, 'payment.paid'), 2);

  // Pembayaran tidak bisa dihapus; tagihan lunas tidak bisa dibatalkan.
  await assert.rejects(as(db, U.tuA, `update invoices set status = 'void', void_reason = 'salah' where id = $1`, [inv.id]), /sudah dibayar/);
  await assert.rejects(as(db, U.tuA, `update invoices set status = 'paid' where student_id = $1`, [S.bela]), /dikelola sistem/);
});

test('pembayaran online lewat webhook (service role) melunasi tagihan', async () => {
  const [inv] = await as(db, U.tuA, 'select id, total::int from invoices where student_id = $1', [S.bela]);
  const [p] = await asService(db, `
    insert into payments (school_id, invoice_id, amount, service_fee, platform_fee, method, gateway, gateway_ref)
    values ($1, $2, $3, 5500, 6000, 'va', 'xendit', 'inv-test-1') returning id`, [S.A, inv.id, inv.total]);
  await asService(db, `update payments set status = 'paid' where id = $1`, [p.id]);
  const [st] = await as(db, U.guru1, 'select status from invoices where id = $1', [inv.id]);   // guru1 = orang tua Bela
  assert.equal(st.status, 'paid');

  const [bill] = await asService(db, 'select * from compute_platform_bill($1, $2)', [S.A, new Date()]);
  assert.equal(Number(bill.gross_amount), 4 * 6000);
  assert.equal(Number(bill.collected_by_split), 6000);
  assert.equal(Number(bill.amount_due), 18000);
});

test('absensi QR: kode salah ditolak, kode benar mencatat hadir', async () => {
  await assert.rejects(as(db, U.andi, `select student_check_in($1, 'salah')`, [S.class7A]), /QR tidak valid/);
  await assert.rejects(as(db, U.dodi, `select student_check_in($1, 'qr-7a')`, [S.class7A]), /tidak terdaftar/);
  const [r] = await as(db, U.bela, `select (student_check_in($1, 'qr-7a')).status`, [S.class7A]);
  assert.ok(['hadir', 'terlambat'].includes(r.status));
  const n = await as(db, U.guru1, `select close_daily_attendance($1, school_today($2)) n`, [S.class7A, S.A]);
  assert.equal(n[0].n, 2);   // Andi & Citra jadi alpa
  assert.ok(await notifCount(U.ortuAndi, 'attendance.absent') >= 1);
});

test('absensi QR menolak lokasi di luar geofence', async () => {
  await as(db, U.adminA, `update schools set settings = settings || '{"geofence":{"lat":-6.2,"lng":106.8,"radius_m":100}}' where id = $1`, [S.A]);
  await assert.rejects(as(db, U.guru1, 'select staff_check_in($1, -6.3, 106.8)', [S.A]), /luar area/);
  const [r] = await as(db, U.guru1, 'select (staff_check_in($1, -6.2003, 106.8001)).status', [S.A]);
  assert.ok(['hadir', 'terlambat'].includes(r.status));
  await as(db, U.guru1, 'select staff_check_out($1)', [S.A]);
});

test('arahan kepsek ke guru dan laporan balik', async () => {
  const [d] = await as(db, U.kepsekA, `insert into directives (school_id, title, body, due_on) values ($1, 'Susun RPP', 'Mohon kirim RPP semester genap', '2026-12-15') returning id`, [S.A]);
  await as(db, U.kepsekA, 'insert into directive_recipients (directive_id, user_id, school_id) values ($1, $2, $3)', [d.id, U.guru1, S.A]);
  // Murid tidak bisa dijadikan penerima arahan.
  await assert.rejects(as(db, U.kepsekA, 'insert into directive_recipients (directive_id, user_id, school_id) values ($1, $2, $3)', [d.id, U.andi, S.A]), /row-level security/);
  assert.equal(await notifCount(U.guru1, 'directive.new'), 1);
  assert.equal((await as(db, U.guru2, 'select * from directives')).length, 0);
  await as(db, U.guru1, `select report_directive($1, 'selesai', 'RPP sudah dikirim')`, [d.id]);
  assert.equal(await notifCount(U.kepsekA, 'directive.report'), 1);
});

test('dasbor kepala sekolah', async () => {
  const [{ principal_dashboard: d }] = await as(db, U.kepsekA, 'select principal_dashboard($1)', [S.A]);
  assert.equal(d.students_active, 4);
  assert.ok('arrears_amount' in d);
  await assert.rejects(as(db, U.guru1, 'select principal_dashboard($1)', [S.A]), /Tidak berwenang/);
});

test('pengumuman per kelas sampai ke murid dan orang tua kelas itu', async () => {
  await as(db, U.guru1, `insert into announcements (school_id, title, body, audience, class_id) values ($1, 'Kerja bakti', 'Jumat pagi', 'class', $2)`, [S.A, S.class7A]);
  assert.equal(await notifCount(U.ortuAndi, 'announcement'), 1);
  assert.equal(await notifCount(U.dodi, 'announcement'), 0);
  // Guru tidak bisa mengumumkan ke seluruh sekolah.
  await assert.rejects(as(db, U.guru1, `insert into announcements (school_id, title, body) values ($1, 'X', 'Y')`, [S.A]), /row-level security/);
  assert.equal((await as(db, U.dodi, 'select * from announcements')).length, 0);
});
