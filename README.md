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

## Sekolah tanpa ponsel murid

Ponsel murid bersifat opsional. Admin sekolah memilih mode di **Pengaturan Sekolah → Penggunaan aplikasi oleh murid**:

| Mode | Murid | Absen | Tugas |
| --- | --- | --- | --- |
| Penuh (bawaan) | Memakai aplikasi | QR kelas, kartu, atau guru | Online atau kertas |
| Absen lewat kartu/guru | Memakai aplikasi | Kartu atau guru saja | Online atau kertas |
| Murid tanpa aplikasi | Tidak login | Kartu atau guru | Kertas; info & nilai ke orang tua |

- **Kartu pelajar** dicetak dari `/admin/kartu` (A4, ukuran KTP). QR berisi token acak; kartu hilang bisa diganti dan kartu lama langsung tidak berlaku.
- **Kios absen** di `/kios` untuk tablet gerbang atau laptop piket, memakai pemindai QR USB/Bluetooth (mode keyboard) atau kamera. Guru juga bisa memakai **Kios kartu pelajar** di aplikasi HP. Orang tua menerima notifikasi saat anak tiba dan pulang.
- **Tugas kertas** dicatat dan dinilai guru di Tugas & PR → Catat tugas kertas, dengan foto jawaban opsional.

## E-rapor (Kurikulum Merdeka)

Tersedia di paket Pro ke atas (modul `grades`). Alurnya:

1. **Admin sekolah** (`/admin/rapor`) membuat semester (tanggal, tanggal & tempat rapor), mengatur KKTP dan bobot sumatif akhir semester, serta urutan mapel di rapor.
2. **Guru mapel** (`/guru/nilai`) menulis Tujuan Pembelajaran (TP), membuat penilaian formatif/sumatif/SAS beserta nilainya, lalu menekan *Hitung nilai rapor*. Nilai akhir = rata-rata sumatif lingkup materi dan SAS sesuai bobot; deskripsi capaian diambil dari TP tertinggi dan terendah. Guru boleh mengubah nilai/deskripsi dan perubahannya tidak ditimpa.
3. **Wali kelas** (`/guru/rapor`) memantau kelengkapan nilai, mengisi catatan, ekstrakurikuler, dan kenaikan kelas, lalu memfinalkan. Ketidakhadiran diambil otomatis dari absensi harian. Leger nilai bisa diunduh sebagai Excel.
4. **Kepala sekolah/admin** menerbitkan rapor. Orang tua dan murid diberi notifikasi, melihat rapor di web (`/ortu/rapor`, `/murid/rapor`) atau aplikasi HP, dan bisa mencetak/menyimpan PDF A4 dari `/rapor`. Setelah terbit, nilai semester itu terkunci sampai terbitan dibuka kembali.

## Tes

```bash
# Tes database berjalan di PostgreSQL biasa (tanpa Docker), port 54329.
npm run db:test
# Tes perhitungan biaya pembayaran
cd supabase/functions && deno test _shared/
```

## Deploy ke Supabase Cloud (region Singapura)

Panduan lengkap dari nol sampai Play Store (Supabase, Vercel, email, Xendit, Firebase, kunci rilis Android): [docs/go-live.md](docs/go-live.md). Ringkasnya:

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
