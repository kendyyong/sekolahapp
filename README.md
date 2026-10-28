# SekolahApp

Platform SaaS multi-sekolah: satu aplikasi untuk murid, orang tua, guru & wali kelas, Tata Usaha,
kepala sekolah, Guru BK, dan admin sekolah/yayasan. Rancangan produk lengkap:
<https://claude.ai/artifact/4ZF3EUppjrXkxwfBet9aPK>

## Isi repo

| Folder | Isi |
| --- | --- |
| `supabase/migrations` | Skema PostgreSQL + Row Level Security (isolasi data antarsekolah, hak akses per peran) |
| `supabase/functions` | Edge Functions (Deno): buat akun, pembayaran Xendit, webhook, tugas bulanan, push FCM |
| `supabase/tests` | Tes otomatis RLS & alur (izin, cuti, kelompok, tugas, SPP, absensi) |
| `supabase/seed.sql` | Data demo untuk pengembangan lokal |
| `apps/web` | Situs publik (harga, pendaftaran sekolah mandiri) dan dasbor web Next.js untuk semua peran, yayasan, dan pemilik platform |
| `apps/mobile` | Aplikasi HP Flutter untuk murid, orang tua, dan guru (lihat `apps/mobile/README.md`) |

## Menjalankan secara lokal

Butuh Node 20+, Docker, dan (opsional) Deno.

```bash
npm install
npx supabase start            # Postgres, Auth, Storage, Edge Runtime + migrasi + seed demo
npx supabase status -o env    # salin API_URL & ANON_KEY ke apps/web/.env.local (lihat .env.example)
npm run web:dev               # http://localhost:3000
```

Aplikasi HP: lihat [apps/mobile/README.md](apps/mobile/README.md).

Akun demo (kata sandi semua `sekolah123`):

| Email | Peran |
| --- | --- |
| `platform@demo.sekolahapp.id` | Pemilik platform: semua sekolah, paket, tagihan langganan |
| `yayasan@demo.sekolahapp.id` | Ketua Yayasan Harapan Nusantara (membawahi 2 sekolah demo) |
| `admin@demo.sekolahapp.id` | Admin Sekolah |
| `kepsek@demo.sekolahapp.id` | Kepala Sekolah |
| `sari@demo.sekolahapp.id` | Guru Matematika, wali kelas VII-A, sekaligus orang tua Bela |
| `budi@demo.sekolahapp.id` | Guru IPA, wali kelas VII-B |
| `tu@demo.sekolahapp.id` | Tata Usaha |
| `bk@demo.sekolahapp.id` | Guru BK |
| `andi@demo.sekolahapp.id` | Murid VII-A |
| `ortu.andi@demo.sekolahapp.id` | Orang tua Andi |

## Tes

```bash
# Tes database berjalan di PostgreSQL biasa (tanpa Docker), port 54329.
npm run db:test
# Tes perhitungan biaya pembayaran
cd supabase/functions && deno test _shared/
```

## Deploy ke Supabase Cloud (region Singapura)

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase functions deploy
npx supabase secrets set XENDIT_SECRET_KEY=... XENDIT_CALLBACK_TOKEN=... XENDIT_PLATFORM_ACCOUNT_ID=... \
  CRON_SECRET=... WEBHOOK_SECRET=... FCM_SERVICE_ACCOUNT='{"project_id":...}'
```

Lalu:
- Daftarkan `https://<ref>.supabase.co/functions/v1/payments-webhook` sebagai callback Invoice di dasbor Xendit.
- Jadwalkan `monthly-jobs` tiap hari pukul 01:00 WIB (pg_cron + pg_net) dengan header `x-cron-secret`.
- Buat Database Webhook pada `public.notifications` (INSERT) ke `push-dispatch` dengan header `x-webhook-secret`.
- Jangan jalankan `seed.sql` di produksi.

## Prinsip keamanan

- Setiap tabel milik sekolah membawa `school_id` dan dilindungi RLS; perubahan status penting
  (izin, cuti, kelompok, nilai, pembayaran) hanya lewat fungsi database yang memeriksa wewenang.
- Pembayaran tidak bisa dihapus; tagihan yang sudah dibayar tidak bisa dibatalkan; semua perubahan tercatat di `audit_log`.
- Kunci rahasia hanya disimpan sebagai secret Supabase, tidak pernah di repo.
