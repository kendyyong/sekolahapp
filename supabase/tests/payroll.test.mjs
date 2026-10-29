// Tes penggajian: data pegawai & komponen, slip dihitung dari absensi dan jadwal mengajar, penyesuaian, persetujuan, pembayaran.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db, run, emp = {};
const one = async (uid, sql, params) => (await as(db, uid, sql, params))[0];
const slipOf = async (employee) => (await db.query('select * from payslips where run_id = $1 and employee_id = $2', [run, employee])).rows[0];

before(async () => {
  db = await freshDb();
  // Oktober 2026: Bu Sari hadir 3, terlambat 1, alpa 1; mengajar 80 menit/pekan (2 JP).
  await db.query(`insert into staff_attendance (school_id, user_id, date, status) values
    ($1, $2, '2026-10-01', 'hadir'), ($1, $2, '2026-10-02', 'hadir'), ($1, $2, '2026-10-05', 'hadir'),
    ($1, $2, '2026-10-06', 'terlambat'), ($1, $2, '2026-10-07', 'alpa'), ($1, $2, '2026-09-30', 'hadir')`, [S.A, U.guru1]);
  await db.query(`insert into schedules (school_id, teaching_assignment_id, day_of_week, starts_at, ends_at) values ($1, $2, 1, '07:00', '08:20')`,
    [S.A, S.taMtk7A]);
});
after(async () => { await db?.end(); });

test('TU menyusun pegawai & komponen; guru dan sekolah tanpa paket ditolak', async () => {
  for (const [name, kind, calc, rate, all] of [
    ['Uang transport', 'earning', 'per_attendance', 20000, true],
    ['Honor mengajar', 'earning', 'per_jp', 25000, true],
    ['Tunjangan wali kelas', 'earning', 'fixed', 300000, false],
    ['Potongan terlambat', 'deduction', 'per_late', 10000, true],
    ['Potongan alpa', 'deduction', 'per_absence', 50000, true],
    ['BPJS Kesehatan', 'deduction', 'percent_base', 1, true],
  ]) {
    const { id } = await one(U.tuA, `insert into payroll_components (school_id, name, kind, calc, rate, applies_to_all)
      values ($1, $2, $3, $4, $5, $6) returning id`, [S.A, name, kind, calc, rate, all]);
    emp[name] = id;
  }
  await assert.rejects(as(db, U.tuA, `insert into payroll_components (school_id, name, kind, calc, rate) values ($1, 'Salah', 'deduction', 'percent_base', 150)`,
    [S.A]), /check constraint/);
  ({ id: emp.sari } = await one(U.tuA, `insert into payroll_employees (school_id, user_id, full_name, position, status, base_salary, bank_name, bank_account)
    values ($1, $2, 'Sari Wulandari', 'Guru Matematika', 'gty', 3000000, 'BSI', '7123456789') returning id`, [S.A, U.guru1]));
  ({ id: emp.budi } = await one(U.tuA, `insert into payroll_employees (school_id, user_id, full_name, status, base_salary)
    values ($1, $2, 'Budi Santoso', 'gtt', 0) returning id`, [S.A, U.guru2]));
  ({ id: emp.satpam } = await one(U.tuA, `insert into payroll_employees (school_id, full_name, position, status, base_salary)
    values ($1, 'Pak Joko', 'Satpam', 'ptt', 1500000) returning id`, [S.A]));
  await as(db, U.tuA, `insert into payroll_employee_components (employee_id, component_id, school_id, rate) values ($1, $2, $3, 300000)`,
    [emp.sari, emp['Tunjangan wali kelas'], S.A]);

  await assert.rejects(as(db, U.tuA, `insert into payroll_employees (school_id, user_id, full_name) values ($1, $2, 'Andi')`, [S.A, U.andi]),
    /guru atau staf sekolah ini/);
  await assert.rejects(as(db, U.guru1, `insert into payroll_employees (school_id, full_name) values ($1, 'Siluman')`, [S.A]), /row-level security/);
  await assert.rejects(as(db, U.adminB, `insert into payroll_employees (school_id, full_name) values ($1, 'Guru B')`, [S.B]),
    /Penggajian belum termasuk paket/);
  // Guru hanya melihat datanya sendiri, tidak melihat komponen/nominal pegawai lain.
  assert.deepEqual((await as(db, U.guru1, 'select full_name from payroll_employees')).map((r) => r.full_name), ['Sari Wulandari']);
  assert.equal((await as(db, U.guru1, 'select employee_id from payroll_employee_components')).length, 0);
  assert.equal((await as(db, U.kepsekA, 'select id from payroll_employees')).length, 3);
});

test('slip dihitung dari absensi bulan itu, JP mengajar, dan komponen', async () => {
  await assert.rejects(as(db, U.guru1, `select payroll_create_run($1, '2026-10-15')`, [S.A]), /Hanya Tata Usaha/);
  ({ r: run } = await one(U.tuA, `select payroll_create_run($1, '2026-10-15', 'Gaji Oktober') r`, [S.A]));
  await assert.rejects(as(db, U.tuA, `select payroll_create_run($1, '2026-10-01')`, [S.A]), /Penggajian Oktober 2026 sudah dibuat/);

  const sari = await slipOf(emp.sari);
  assert.deepEqual(sari.attendance, { hadir: 3, terlambat: 1, izin: 0, sakit: 0, cuti: 0, dinas: 0, alpa: 1, jp_week: 2, jp: 8 });
  assert.deepEqual(sari.lines.map((l) => [l.name, Number(l.amount)]), [
    ['Gaji pokok', 3000000], ['Honor mengajar', 200000], ['Tunjangan wali kelas', 300000], ['Uang transport', 80000],
    ['BPJS Kesehatan', 30000], ['Potongan alpa', 50000], ['Potongan terlambat', 10000],
  ]);
  assert.equal(Number(sari.gross), 3580000);
  assert.equal(Number(sari.deductions), 90000);
  assert.equal(Number(sari.net), 3490000);
  // Guru honorer tanpa gaji pokok: hanya honor JP (IPA 7A tanpa jadwal → 0) → slip kosong.
  assert.equal(Number((await slipOf(emp.budi)).net), 0);
  const satpam = await slipOf(emp.satpam);
  assert.equal(Number(satpam.net), 1485000);
  assert.equal(satpam.position, 'Satpam');
});

test('penyesuaian (lembur, kasbon) hanya oleh TU saat draf', async () => {
  const { id } = await slipOf(emp.sari);
  await as(db, U.tuA, `select payroll_set_adjustments($1, '[{"label":"Lembur akreditasi","amount":100000},{"label":"Kasbon","amount":-200000}]')`, [id]);
  const s = await slipOf(emp.sari);
  assert.equal(Number(s.gross), 3680000);
  assert.equal(Number(s.deductions), 290000);
  assert.equal(Number(s.net), 3390000);
  await assert.rejects(as(db, U.tuA, `select payroll_set_adjustments($1, '[{"label":"X","amount":5}]')`, [id]), /Keterangan penyesuaian/);
  await assert.rejects(as(db, U.tuA, `select payroll_set_adjustments($1, '[{"label":"Bonus","amount":0}]')`, [id]), /tidak valid/);
  await assert.rejects(as(db, U.guru1, `select payroll_set_adjustments($1, '[]')`, [id]), /Hanya Tata Usaha/);
  // Slip tidak bisa diubah langsung, dan guru belum bisa melihat slip yang belum dibayar.
  assert.equal((await as(db, U.tuA, 'update payslips set net = 1 returning id')).length, 0);
  assert.equal((await as(db, U.guru1, 'select id from payslips')).length, 0);
  // Pegawai baru di tengah bulan ikut setelah "hitung ulang".
  await db.query(`insert into payroll_employees (school_id, full_name, base_salary) values ($1, 'Bu Ani', 1000000)`, [S.A]);
  assert.equal((await one(U.tuA, 'select payroll_refresh($1) n', [run])).n, 4);
  assert.equal(Number((await slipOf(emp.sari)).net), 3390000);   // penyesuaian tetap ada
});

test('disetujui kepala sekolah, dibayar TU, lalu pegawai melihat slipnya sendiri', async () => {
  await assert.rejects(as(db, U.tuA, 'select payroll_mark_paid($1, $2)', [run, 'transfer']), /harus disetujui kepala sekolah/);
  await assert.rejects(as(db, U.tuA, 'select payroll_approve($1)', [run]), /Hanya kepala sekolah/);
  await as(db, U.kepsekA, 'select payroll_approve($1)', [run]);
  assert.equal((await as(db, U.tuA, `select id from notifications where kind = 'payroll.approved'`)).length, 1);
  const { id } = await slipOf(emp.sari);
  await assert.rejects(as(db, U.tuA, `select payroll_set_adjustments($1, '[]')`, [id]), /sudah disetujui/);
  await assert.rejects(as(db, U.tuA, 'delete from payroll_runs where id = $1 returning id', [run]).then((r) => { if (!r.length) throw new Error('tidak terhapus'); }),
    /tidak terhapus/);
  // Buka kembali → ubah → setujui lagi.
  await as(db, U.tuA, 'select payroll_reopen($1)', [run]);
  await as(db, U.tuA, `select payroll_set_adjustments($1, '[{"label":"Lembur akreditasi","amount":100000}]')`, [id]);
  await as(db, U.kepsekA, 'select payroll_approve($1)', [run]);

  await assert.rejects(as(db, U.tuA, 'select payroll_mark_paid($1, $2)', [run, 'cek']), /tidak dikenal/);
  await as(db, U.tuA, `select payroll_mark_paid($1, 'transfer', '2026-10-28')`, [run]);
  await assert.rejects(as(db, U.tuA, 'select payroll_reopen($1)', [run]), /belum dibayar/);

  const mine = await as(db, U.guru1, 'select full_name, net from payslips');
  assert.deepEqual(mine.map((r) => [r.full_name, Number(r.net)]), [['Sari Wulandari', 3590000]]);
  assert.equal((await as(db, U.guru1, 'select period from payroll_runs')).length, 1);
  const note = await one(U.guru1, `select title, body from notifications where kind = 'payroll.paid'`);
  assert.equal(note.title, 'Slip gaji Oktober 2026');
  assert.match(note.body, /Rp3\.590\.000 sudah ditransfer/);
  assert.equal((await as(db, U.bkA, 'select id from payslips')).length, 0);
  assert.equal((await as(db, U.adminB, 'select id from payroll_runs')).length, 0);
  await assert.rejects(as(db, U.tuA, 'delete from payroll_employees where id = $1', [emp.sari]), /nonaktifkan saja/);
});
