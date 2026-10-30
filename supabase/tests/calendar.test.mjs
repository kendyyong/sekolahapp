// Tes kalender pendidikan: hak kelola, sasaran agenda, notifikasi, pengingat H-1, hari libur di absensi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, asService, U, S } from './helpers.mjs';

let db, today;
const one = async (uid, sql, params) => (await as(db, uid, sql, params))[0];
const notifs = async (uid, kind) =>
  (await as(db, uid, 'select title, body from notifications where kind = $1 order by created_at', [kind]));
// Tanggal relatif hari ini (zona sekolah) agar tes tidak kedaluwarsa.
const day = (n) => {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ddmmyyyy = (iso) => iso.split('-').reverse().join('-');

before(async () => {
  db = await freshDb();
  ({ d: today } = (await db.query(`select school_today($1)::text d`, [S.A])).rows[0]);
});
after(async () => { await db?.end(); });

test('admin & kepala sekolah mengelola kalender; guru, murid, sekolah lain tidak bisa', async () => {
  const { id } = await one(U.adminA, `insert into calendar_events (school_id, title, kind, starts_on, ends_on, notify_members)
    values ($1, 'Asesmen Sumatif Akhir Semester', 'ujian', $2, $3, false) returning id`, [S.A, day(30), day(35)]);
  await as(db, U.kepsekA, `update calendar_events set description = 'Jadwal per mapel menyusul' where id = $1`, [id]);
  for (const uid of [U.guru1, U.tuA, U.andi, U.ortuAndi, U.adminB]) {
    await assert.rejects(as(db, uid, `insert into calendar_events (school_id, title, starts_on, ends_on) values ($1, 'X', $2, $2)`,
      [S.A, day(1)]), /row-level security/);
  }
  assert.equal((await as(db, U.guru1, `update calendar_events set title = 'Diubah' where id = $1 returning id`, [id])).length, 0);
  await assert.rejects(as(db, U.adminA, `insert into calendar_events (school_id, title, starts_on, ends_on) values ($1, 'Mundur', $2, $3)`,
    [S.A, day(5), day(4)]), /check constraint/);
  await assert.rejects(as(db, U.adminA, `insert into calendar_events (school_id, title, starts_on, ends_on, audience) values ($1, 'Kelas', $2, $2, 'class')`,
    [S.A, day(5)]), /check constraint/);
});

test('sasaran agenda menyaring siapa yang melihat', async () => {
  await as(db, U.adminA, `insert into calendar_events (school_id, title, kind, starts_on, ends_on, audience, notify_members) values
    ($1, 'Rapat guru', 'kegiatan', $2, $2, 'staff', false),
    ($1, 'Pembagian rapor', 'rapor', $3, $3, 'students', false)`, [S.A, day(10), day(40)]);
  const titles = async (uid) => (await as(db, uid, 'select title from calendar_events order by starts_on')).map((r) => r.title);
  assert.deepEqual(await titles(U.guru1), ['Rapat guru', 'Asesmen Sumatif Akhir Semester', 'Pembagian rapor']);
  assert.deepEqual(await titles(U.andi), ['Asesmen Sumatif Akhir Semester', 'Pembagian rapor']);
  assert.deepEqual(await titles(U.ortuAndi), ['Asesmen Sumatif Akhir Semester', 'Pembagian rapor']);
  assert.deepEqual(await titles(U.muridB), []);
});

test('agenda baru, diubah, dibatalkan dikirim ke penerima; pembuat tidak', async () => {
  const { id } = await one(U.adminA, `insert into calendar_events (school_id, title, kind, starts_on, ends_on, audience)
    values ($1, 'Class meeting', 'kegiatan', $2, $3, 'students') returning id`, [S.A, day(50), day(52)]);
  assert.deepEqual(await notifs(U.andi, 'calendar.new'),
    [{ title: 'Kalender sekolah: Class meeting', body: `Kegiatan sekolah · ${ddmmyyyy(day(50))} s.d. ${ddmmyyyy(day(52))}` }]);
  assert.equal((await notifs(U.ortuAndi, 'calendar.new')).length, 1);
  assert.equal((await notifs(U.tuA, 'calendar.new')).length, 0);       // sasaran murid & orang tua saja
  assert.equal((await notifs(U.adminA, 'calendar.new')).length, 0);

  await as(db, U.adminA, `update calendar_events set description = 'Bawa bekal' where id = $1`, [id]);
  assert.equal((await notifs(U.andi, 'calendar.changed')).length, 0);  // isi keterangan saja: tidak dikirim ulang
  await as(db, U.adminA, `update calendar_events set starts_on = $2, ends_on = $2 where id = $1`, [id, day(51)]);
  assert.deepEqual((await notifs(U.andi, 'calendar.changed')).map((n) => n.title), ['Jadwal diubah: Class meeting']);
  await as(db, U.adminA, `delete from calendar_events where id = $1`, [id]);
  assert.deepEqual((await notifs(U.bela, 'calendar.cancelled')).map((n) => n.title), ['Dibatalkan: Class meeting']);

  // Agenda lampau (mis. mengisi arsip) tidak mengirim notifikasi.
  await as(db, U.adminA, `insert into calendar_events (school_id, title, starts_on, ends_on) values ($1, 'Lampau', $2, $2)`, [S.A, day(-20)]);
  assert.equal((await notifs(U.andi, 'calendar.new')).length, 1);
  assert.equal((await one(U.andi, `select wa_category('calendar.reminder') c`)).c, 'pengumuman');
});

test('pengingat H-1 dikirim sekali per agenda, hanya oleh tugas harian', async () => {
  await as(db, U.adminA, `insert into calendar_events (school_id, title, kind, starts_on, ends_on, notify_members) values
    ($1, 'Penilaian Tengah Semester', 'ujian', $2, $3, true),
    ($1, 'Diam-diam', 'kegiatan', $2, $2, false)`, [S.A, day(1), day(3)]);
  await assert.rejects(as(db, U.adminA, 'select calendar_send_reminders($1)', [S.A]), /permission denied/);
  const [{ n }] = await asService(db, 'select calendar_send_reminders($1) n', [S.A]);
  assert.ok(n >= 10, `pengingat terkirim ke semua warga sekolah A (${n})`);
  assert.deepEqual((await notifs(U.andi, 'calendar.reminder')).map((x) => x.title), ['Besok: Penilaian Tengah Semester']);
  const [{ n: again }] = await asService(db, 'select calendar_send_reminders($1) n', [S.A]);
  assert.equal(again, 0);
});

test('hari libur: absensi murid ditolak, tutup absensi tidak menandai alpa, izin melewatinya', async () => {
  await as(db, U.adminA, `insert into calendar_events (school_id, title, kind, starts_on, ends_on) values
    ($1, 'Libur hari ini', 'libur', $2, $2), ($1, 'Libur khusus guru', 'libur', $3, $3)`, [S.A, today, day(1)])
    .then(() => as(db, U.adminA, `update calendar_events set audience = 'staff' where title = 'Libur khusus guru'`));

  assert.equal((await one(U.andi, 'select school_holiday($1) h', [S.A])).h, 'Libur hari ini');
  assert.equal((await one(U.muridB, 'select school_holiday($1) h', [S.A])).h, null);   // bukan warga sekolah A
  assert.equal((await one(U.guru1, 'select school_holiday($1, $2) h', [S.A, day(1)])).h, null); // libur guru tidak berlaku untuk murid

  await assert.rejects(as(db, U.guru1, 'select close_daily_attendance($1, $2)', [S.class7A, today]), /hari libur \(Libur hari ini\)/);
  await assert.rejects(as(db, U.andi, `select student_check_in($1, 'qr-7a')`, [S.class7A]), /hari libur/);
  const { card_token } = (await db.query('select card_token from students where id = $1', [S.bela])).rows[0];
  await assert.rejects(as(db, U.guru1, 'select card_scan($1)', [card_token]), /hari libur/);
  await assert.rejects(as(db, U.guru1, `insert into student_attendance (school_id, student_id, class_id, date, status)
    values ($1, $2, $3, $4, 'hadir')`, [S.A, S.citra, S.class7A, today]), /hari libur/);
  assert.equal((await db.query('select count(*)::int n from student_attendance where date = $1', [today])).rows[0].n, 0);
  assert.equal((await notifs(U.ortuAndi, 'attendance.absent')).length, 0);

  // Izin 3 hari yang mencakup libur: hari libur & Minggu dilewati.
  await as(db, U.adminA, `insert into calendar_events (school_id, title, kind, starts_on, ends_on, notify_members)
    values ($1, 'Cuti bersama', 'libur', $2, $2, false)`, [S.A, day(21)]);
  const { id } = await one(U.ortuAndi, `insert into student_leave_requests (school_id, student_id, kind, starts_on, ends_on, reason)
    values ($1, $2, 'sakit', $3, $4, 'Demam') returning id`, [S.A, S.andi, day(20), day(22)]);
  await as(db, U.guru1, 'select review_student_leave($1, true)', [id]);
  const expected = [day(20), day(22)].filter((d) => new Date(d + 'T00:00:00Z').getUTCDay() !== 0);
  const got = (await as(db, U.guru1, 'select date::text d from student_attendance where student_id = $1 and leave_request_id = $2 order by date',
    [S.andi, id])).map((r) => r.d);
  assert.deepEqual(got, expected);
});
