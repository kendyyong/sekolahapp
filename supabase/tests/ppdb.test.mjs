// Tes PPDB online: gelombang, formulir pendaftar, berkas, verifikasi, keputusan, pengumuman, dan daftar ulang.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, as, U, S } from './helpers.mjs';

let db;
const P1 = '00000000-0000-0000-0000-0000000000e1';   // calon wali murid, belum punya peran di sekolah mana pun
const P2 = '00000000-0000-0000-0000-0000000000e2';
let period, app1, app2;

before(async () => {
  db = await freshDb();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'ortu.baru@test.id', '{"full_name":"Bu Sari"}'), ($2, 'ortu.lain@test.id', '{"full_name":"Pak Lain"}')`, [P1, P2]);
});
after(async () => { await db?.end(); });

const anon = async (sql, params = []) => {
  await db.query('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await db.query('set local role anon');
    return (await db.query(sql, params)).rows;
  } finally { await db.query('rollback'); }
};

const DOCS = { 'Akta kelahiran': 'x', 'Kartu keluarga': 'x', 'Pas foto': 'x' };
const docsFor = (app) => Object.fromEntries(Object.keys(DOCS).map((k, i) => [k, `${S.A}/${app}/${i}.pdf`]));

test('gelombang PPDB hanya untuk paket yang memuat modul ppdb', async () => {
  await assert.rejects(
    as(db, U.adminB, `insert into admission_periods (school_id, title, school_year, grade_level, opens_on, closes_on)
                      values ($1, 'Gelombang 1', '2027/2028', 1, current_date, current_date + 30)`, [S.B]),
    /PPDB online belum termasuk paket/);
  [{ id: period }] = await as(db, U.adminA,
    `insert into admission_periods (school_id, title, school_year, grade_level, opens_on, closes_on, quota, fee_amount)
     values ($1, 'Gelombang 1', '2027/2028', 7, current_date - 1, current_date + 30, 1, 150000) returning id`, [S.A]);
  // Guru tidak bisa membuat gelombang.
  const r = await as(db, U.guru1, `update admission_periods set quota = 99 where id = $1 returning id`, [period]);
  assert.equal(r.length, 0);
});

test('halaman publik hanya menampilkan gelombang yang dipublikasikan', async () => {
  let [{ p }] = await anon(`select ppdb_public('smp-harapan-bangsa') p`);
  assert.equal(p.periods.length, 0);
  assert.equal(p.school.name, 'SMP Harapan Bangsa');
  await as(db, U.adminA, `update admission_periods set is_published = true where id = $1`, [period]);
  [{ p }] = await anon(`select ppdb_public('smp-harapan-bangsa') p`);
  assert.equal(p.periods.length, 1);
  assert.equal(p.periods[0].is_open, true);
  assert.equal(p.periods[0].fee_amount, 150000);
  const [{ p: none }] = await anon(`select ppdb_public('sd-tunas-mekar') p`);
  assert.equal(none, null);   // paket Dasar tidak punya PPDB
  // Tabelnya sendiri tertutup untuk pengunjung; data publik hanya lewat ppdb_public.
  assert.equal((await anon('select id from admission_periods')).length, 0);
});

test('pendaftar mengisi formulir draf; status & biaya tidak bisa diubah sendiri', async () => {
  [{ id: app1 }] = await as(db, P1,
    `insert into admission_applications (school_id, period_id, full_name, status, fee_status)
     values ($1, $2, 'Rina Sari', 'accepted', 'paid') returning id`, [S.B, period]);
  const [a] = await as(db, P1, 'select school_id, status, fee_status, applicant_id from admission_applications where id = $1', [app1]);
  assert.deepEqual(a, { school_id: S.A, status: 'draft', fee_status: 'unpaid', applicant_id: P1 });
  await assert.rejects(as(db, P1, `update admission_applications set status = 'accepted' where id = $1`, [app1]), /proses PPDB/);
  await as(db, P1, `update admission_applications set gender = 'P', birth_place = 'Bandung', birth_date = '2014-05-01',
                    address = 'Jl. Melati 1', parent_name = 'Sari', parent_phone = '0812 3456 7890', parent_relation = 'ibu' where id = $1`, [app1]);
  // Pendaftar lain dan guru tidak bisa melihat formulir ini; panitia bisa.
  assert.equal((await as(db, P2, 'select id from admission_applications')).length, 0);
  assert.equal((await as(db, U.guru1, 'select id from admission_applications')).length, 0);
  assert.equal((await as(db, U.tuA, 'select id from admission_applications')).length, 1);
});

test('berkas: pendaftar mengunggah ke foldernya sendiri; kirim butuh berkas lengkap', async () => {
  await assert.rejects(as(db, P1, 'select ppdb_submit($1)', [app1]), /Berkas belum diunggah: Akta kelahiran, Kartu keluarga, Pas foto/);
  for (const path of Object.values(docsFor(app1))) {
    await as(db, P1, `insert into storage.objects (bucket_id, name) values ('admission-docs', $1)`, [path]);
  }
  await assert.rejects(as(db, P2, `insert into storage.objects (bucket_id, name) values ('admission-docs', $1)`, [`${S.A}/${app1}/z.pdf`]), /row-level security/);
  assert.equal((await as(db, P2, `select name from storage.objects where bucket_id = 'admission-docs'`)).length, 0);
  assert.equal((await as(db, U.adminA, `select name from storage.objects where bucket_id = 'admission-docs'`)).length, 3);

  await as(db, P1, 'update admission_applications set documents = $2 where id = $1', [app1, docsFor(app1)]);
  const [{ n }] = await as(db, P1, 'select ppdb_submit($1) n', [app1]);
  assert.equal(n, 'PPDB-2027-0001');
  await assert.rejects(as(db, P1, `update admission_applications set full_name = 'Ganti' where id = $1`, [app1]), /sudah dikirim/);
  // Setelah dikirim berkas tidak bisa ditambah lagi.
  await assert.rejects(as(db, P1, `insert into storage.objects (bucket_id, name) values ('admission-docs', $1)`, [`${S.A}/${app1}/baru.pdf`]), /row-level security/);
  const notes = await as(db, U.tuA, `select title from notifications where kind = 'ppdb.submitted'`);
  assert.equal(notes.length, 1);
});

test('verifikasi menunggu biaya; dikembalikan untuk perbaikan lalu dikirim ulang', async () => {
  await assert.rejects(as(db, U.adminA, 'select ppdb_verify($1, true)', [app1]), /Biaya pendaftaran belum dibayar/);
  await assert.rejects(as(db, U.guru1, `select ppdb_record_fee($1, 'cash')`, [app1]), /Hanya admin sekolah atau TU/);
  await as(db, U.tuA, `select ppdb_record_fee($1, 'cash')`, [app1]);
  await as(db, U.adminA, `select ppdb_verify($1, false, 'Pas foto buram')`, [app1]);
  let [a] = await as(db, P1, 'select status, staff_note, fee_status, number from admission_applications where id = $1', [app1]);
  assert.deepEqual(a, { status: 'draft', staff_note: 'Pas foto buram', fee_status: 'paid', number: 'PPDB-2027-0001' });
  await as(db, P1, `update admission_applications set notes = 'Foto baru' where id = $1`, [app1]);
  await as(db, P1, 'select ppdb_submit($1)', [app1]);
  await as(db, U.adminA, 'select ppdb_verify($1, true)', [app1]);
  [a] = await as(db, P1, 'select status, number from admission_applications where id = $1', [app1]);
  assert.deepEqual(a, { status: 'verified', number: 'PPDB-2027-0001' });
});

test('keputusan tersembunyi sampai diumumkan; kuota dijaga', async () => {
  // Pendaftar kedua, biaya dibebaskan.
  [{ id: app2 }] = await as(db, P2,
    `insert into admission_applications (school_id, period_id, full_name, gender, birth_place, birth_date, address, parent_name, parent_phone)
     values ($1, $2, 'Bima', 'L', 'Bogor', '2014-02-02', 'Jl. Mawar', 'Lain', '081200000000') returning id`, [S.A, period]);
  await as(db, P2, 'update admission_applications set documents = $2 where id = $1', [app2, docsFor(app2)]);
  const [{ n }] = await as(db, P2, 'select ppdb_submit($1) n', [app2]);
  assert.equal(n, 'PPDB-2027-0002');
  await as(db, U.adminA, `select ppdb_record_fee($1, 'waived')`, [app2]);
  await as(db, U.adminA, 'select ppdb_verify($1, true)', [app2]);

  await as(db, U.kepsekA, `select ppdb_decide($1, 'accepted', 88.5, 'Nilai rapor baik')`, [app1]);
  await assert.rejects(as(db, U.adminA, 'select ppdb_announce($1)', [period]), /belum diberi keputusan/);
  await as(db, U.adminA, `select ppdb_decide($1, 'accepted')`, [app2]);
  assert.equal((await as(db, P1, 'select * from admission_reviews')).length, 0);
  const [a] = await as(db, P1, 'select status from admission_applications where id = $1', [app1]);
  assert.equal(a.status, 'verified');
  await assert.rejects(as(db, U.adminA, 'select ppdb_announce($1)', [period]), /melebihi kuota/);

  await as(db, U.adminA, `select ppdb_decide($1, 'waitlisted')`, [app2]);
  const [{ c }] = await as(db, U.adminA, 'select ppdb_announce($1) c', [period]);
  assert.equal(c, 2);
  const mine = await as(db, P1, 'select status from admission_applications');
  assert.deepEqual(mine, [{ status: 'accepted' }]);
  const [r] = await as(db, U.adminA, 'select score from admission_reviews where application_id = $1', [app1]);
  assert.equal(Number(r.score), 88.5);
  // Setelah diumumkan, keputusan baru langsung berlaku tapi tetap dibatasi kuota.
  await assert.rejects(as(db, U.adminA, `select ppdb_decide($1, 'accepted')`, [app2]), /Kuota gelombang ini \(1\) sudah penuh/);
  const res = await as(db, P1, `select title from notifications where user_id = auth.uid() and kind = 'ppdb.result'`);
  assert.equal(res.length, 1);
});

test('daftar ulang: pendaftar diterima menjadi murid dan orang tua menjadi wali', async () => {
  await assert.rejects(as(db, U.adminA, 'select ppdb_enroll($1)', [app2]), /Hanya pendaftar yang diterima/);
  const [{ sid }] = await as(db, U.adminA, `select ppdb_enroll($1, $2, '2027001') sid`, [app1, S.class7A]);
  const [s] = await as(db, P1, 'select full_name, nis, gender, birth_place from students where id = $1', [sid]);
  assert.deepEqual(s, { full_name: 'Rina Sari', nis: '2027001', gender: 'P', birth_place: 'Bandung' });
  const roles = await as(db, P1, 'select role from my_roles()');
  assert.deepEqual(roles.map((x) => x.role), ['guardian']);
  const [link] = await as(db, P1, 'select relation, is_primary from guardian_links where student_id = $1', [sid]);
  assert.deepEqual(link, { relation: 'ibu', is_primary: true });
  const [a] = await as(db, P1, 'select status, student_id from admission_applications where id = $1', [app1]);
  assert.deepEqual(a, { status: 'enrolled', student_id: sid });
  await assert.rejects(as(db, P1, 'select ppdb_withdraw($1)', [app1]), /tidak bisa dibatalkan/);
  await as(db, P2, 'select ppdb_withdraw($1)', [app2]);
});

test('pendaftaran ditolak bila gelombang ditutup', async () => {
  await as(db, U.adminA, `update admission_periods set closes_on = current_date - 1, opens_on = current_date - 10 where id = $1`, [period]);
  await assert.rejects(
    as(db, P2, `insert into admission_applications (school_id, period_id, full_name) values ($1, $2, 'Telat')`, [S.A, period]),
    /belum dibuka atau sudah ditutup/);
});
