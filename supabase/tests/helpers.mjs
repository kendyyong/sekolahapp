// Pembantu tes: menjalankan SQL sebagai pengguna tertentu, meniru JWT Supabase.
import pg from 'pg';
import { readFileSync } from 'node:fs';

export const U = {
  platform: '00000000-0000-0000-0000-000000000001',
  adminA: '00000000-0000-0000-0000-0000000000a1',
  kepsekA: '00000000-0000-0000-0000-0000000000a2',
  guru1: '00000000-0000-0000-0000-0000000000a3',   // wali VII-A, guru MTK, orang tua Bela
  guru2: '00000000-0000-0000-0000-0000000000a4',   // wali VII-B, guru IPA
  tuA: '00000000-0000-0000-0000-0000000000a5',
  bkA: '00000000-0000-0000-0000-0000000000a6',
  andi: '00000000-0000-0000-0000-0000000000b1',
  bela: '00000000-0000-0000-0000-0000000000b2',
  citra: '00000000-0000-0000-0000-0000000000b3',
  dodi: '00000000-0000-0000-0000-0000000000b4',
  ortuAndi: '00000000-0000-0000-0000-0000000000c1',
  adminB: '00000000-0000-0000-0000-0000000000d1',
  muridB: '00000000-0000-0000-0000-0000000000d2',
};
export const S = {
  A: '00000000-0000-0000-0000-00000000aaaa',
  B: '00000000-0000-0000-0000-00000000bbbb',
  andi: '00000000-0000-0000-0000-000000005001',
  bela: '00000000-0000-0000-0000-000000005002',
  citra: '00000000-0000-0000-0000-000000005003',
  dodi: '00000000-0000-0000-0000-000000005004',
  muridB: '00000000-0000-0000-0000-000000005101',
  class7A: '00000000-0000-0000-0000-0000000007a0',
  class7B: '00000000-0000-0000-0000-0000000007b0',
  taMtk7A: '00000000-0000-0000-0000-0000000a0001',
  taIpa7A: '00000000-0000-0000-0000-0000000a0002',
  feeSpp: '00000000-0000-0000-0000-0000000fee01',
};

const config = {
  host: process.env.PGHOST ?? '/tmp/pg',
  port: Number(process.env.PGPORT ?? 54322),
  user: 'postgres',
  database: 'sekolahapp_test',
};

// Setiap berkas tes memulai dari data uji yang bersih.
export async function freshDb() {
  const admin = new pg.Client({ ...config, database: 'postgres' });
  await admin.connect();
  await admin.query('drop database if exists sekolahapp_test with (force)');
  await admin.query("create database sekolahapp_test template sekolahapp_template");
  await admin.end();
  const client = new pg.Client(config);
  await client.connect();
  await client.query(readFileSync(new URL('./fixtures.sql', import.meta.url), 'utf8'));
  return client;
}

// Menjalankan fn dalam transaksi sebagai pengguna `uid` (role authenticated).
export async function as(client, uid, sql, params = []) {
  await client.query('begin');
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await client.query('set local role authenticated');
    const res = await client.query(sql, params);
    await client.query('commit');
    return res.rows;
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}

export async function asService(client, sql, params = []) {
  await client.query('begin');
  try {
    await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    await client.query('set local role service_role');
    const res = await client.query(sql, params);
    await client.query('commit');
    return res.rows;
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}
