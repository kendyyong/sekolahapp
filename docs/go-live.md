# Panduan go-live SekolahApp

Urutan yang disarankan, dari nol sampai sekolah pertama bisa memakai aplikasi. Kerjakan berurutan: beberapa langkah membutuhkan alamat atau kunci dari langkah sebelumnya.

| # | Langkah | Hasil yang dibutuhkan langkah berikutnya |
|---|---------|------------------------------------------|
| 1 | Proyek Supabase produksi | URL proyek, anon key, service role key |
| 2 | Web di Vercel + domain | Alamat situs, misalnya `https://sekolahapp.id` |
| 3 | Pengaturan Auth & email | Email konfirmasi dan lupa kata sandi terkirim |
| 4 | Xendit (sandbox dulu) | Secret key, callback token, ID akun platform |
| 5 | Firebase (notifikasi push) | `google-services.json`, service account |
| 6 | Aplikasi Android & Play Store | APK/AAB bertanda tangan |
| 7 | Data hukum & pemeriksaan akhir | Siap menerima sekolah |

---

## 1. Supabase produksi

1. Buat proyek baru di [supabase.com](https://supabase.com), region **Southeast Asia (Singapore)**. Simpan kata sandi database di pengelola kata sandi.
2. Untuk produksi pakai paket **Pro**. Proyek Free dijeda setelah seminggu tidak aktif dan tidak punya backup harian.
3. Kirim migrasi dan Edge Functions. Cara termudah tanpa memasang apa pun di komputer, lewat GitHub Actions:

   1. Buat token akun di [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).
   2. Di GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret**, isi tiga rahasia:
      `SUPABASE_ACCESS_TOKEN` (token tadi), `SUPABASE_DB_PASSWORD` (kata sandi database proyek), dan
      `SUPABASE_PROJECT_REF` (bagian depan alamat `https://<ref>.supabase.co`).
   3. Tab **Actions → Deploy Supabase → Run workflow**. Jalankan dulu dengan mode `cek` untuk melihat daftar migrasi,
      lalu sekali lagi dengan mode `jalankan`.

   Atau dari komputer sendiri:

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push            # semua migrasi di supabase/migrations
   npx supabase functions deploy   # admin-users, monthly-jobs, payments-create, payments-webhook, push-dispatch
   ```

   Jangan menjalankan `seed.sql` di produksi (isinya akun demo dengan kata sandi yang diketahui umum).

4. Rahasia Edge Functions (isi setelah langkah 4 dan 5, boleh diulang kapan saja):

   ```bash
   npx supabase secrets set \
     XENDIT_SECRET_KEY=xnd_development_... \
     XENDIT_CALLBACK_TOKEN=... \
     XENDIT_PLATFORM_ACCOUNT_ID=... \
     CRON_SECRET=$(openssl rand -hex 32) \
     WEBHOOK_SECRET=$(openssl rand -hex 32) \
     FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
   ```

   Catat nilai `CRON_SECRET` dan `WEBHOOK_SECRET`; keduanya dipakai di poin 6 dan 7.

5. **Admin platform pertama.** Daftar dulu lewat web (langkah 2), lalu di SQL Editor:

   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'email-anda@domain.com';
   ```

6. **Tugas harian** (tagihan SPP bulanan, denda, tagihan langganan). Aktifkan ekstensi `pg_cron` dan `pg_net` (Database → Extensions), lalu di SQL Editor:

   ```sql
   select vault.create_secret('<CRON_SECRET>', 'cron_secret');

   select cron.schedule('monthly-jobs', '0 18 * * *',  -- 18:00 UTC = 01:00 WIB
     $$ select net.http_post(
          url     := 'https://<ref>.supabase.co/functions/v1/monthly-jobs',
          headers := jsonb_build_object(
                       'Content-Type', 'application/json',
                       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
          body    := '{}'::jsonb) $$);
   ```

7. **Notifikasi push.** Database → Webhooks → Create:
   - Tabel `public.notifications`, event **Insert**
   - Tipe *Supabase Edge Functions*, fungsi `push-dispatch`, metode POST
   - Header `x-webhook-secret: <WEBHOOK_SECRET>`

8. Database → Backups: pastikan backup harian aktif. Point-in-time recovery disarankan setelah ada sekolah berbayar.

## 2. Web di Vercel

1. Vercel → Add New Project → impor `kendyyong/sekolahapp`.
2. **Root Directory:** `apps/web`. Framework terdeteksi sebagai Next.js.
3. Environment Variables (Production):

   | Nama | Isi |
   |------|-----|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (Project Settings → API) |
   | `NEXT_PUBLIC_SITE_URL` | alamat situs tanpa garis miring di akhir, misalnya `https://sekolahapp.id` |
   | `NEXT_PUBLIC_LEGAL_COMPANY` | nama badan usaha resmi (PT/CV) |
   | `NEXT_PUBLIC_LEGAL_ADDRESS` | alamat kantor |
   | `NEXT_PUBLIC_LEGAL_EMAIL` | email untuk urusan privasi dan hapus akun |

   Kunci `service_role` **tidak** pernah dimasukkan ke Vercel atau ke aplikasi HP.

4. Settings → Domains: tambahkan domain, lalu ikuti petunjuk DNS dari Vercel.

## 3. Auth & email

Authentication → URL Configuration:
- **Site URL:** `https://sekolahapp.id`
- **Redirect URLs:** `https://sekolahapp.id/auth/konfirmasi`

Authentication → Emails → SMTP Settings: **wajib** memakai SMTP sendiri (misalnya Resend, Brevo, Mailgun, atau Amazon SES). Server email bawaan Supabase hanya mengirim ke anggota tim proyek dan sangat dibatasi, jadi email lupa kata sandi ke guru/orang tua tidak akan sampai. Verifikasi domain pengirim (SPF dan DKIM) supaya email tidak masuk spam.

Authentication → Email Templates: salin isi berkas berikut ke template yang sesuai, termasuk judulnya:
- **Reset Password** ← `supabase/templates/recovery.html`, judul “Atur ulang kata sandi SekolahApp”
- **Confirm signup** ← `supabase/templates/confirmation.html`, judul “Konfirmasi email SekolahApp”

Cara cepat: workflow **Atur Auth Supabase** (tab Actions) mengatur Site URL, Redirect URLs, SMTP, dan kedua template ini sekaligus lewat Management API. Isi dulu rahasia `SMTP_PASSWORD` (untuk Gmail: App Password dari myaccount.google.com/apppasswords), jalankan mode `cek`, lalu `jalankan`. Isian *platform_admin_email* sekalian mengonfirmasi akun itu dan menjadikannya Pemilik Platform.

Jangan memakai `supabase config push` untuk ini: perintah itu juga mengirim `site_url = localhost` dari `config.toml`.

Uji: buka `/lupa-sandi`, masukkan email sendiri, klik tautan di email, atur kata sandi baru, lalu masuk.

## 4. Xendit

**Sandbox dulu.**

1. Dasbor Xendit → nyalakan **Test Mode**.
2. Settings → API Keys → buat secret key dengan izin *Money-in* write. Ini `XENDIT_SECRET_KEY`.
3. Settings → Webhooks:
   - Isi URL **Invoices paid** dengan `https://<ref>.supabase.co/functions/v1/payments-webhook`.
   - Salin **Verification token** sebagai `XENDIT_CALLBACK_TOKEN`.
4. **xenPlatform** (menu Platform):
   - ID akun Anda sendiri adalah `XENDIT_PLATFORM_ACCOUNT_ID`; potongan biaya platform masuk ke sini.
   - Setiap sekolah perlu *sub-account*. Di mode uji, buat sub-account untuk satu sekolah uji.
   - Masukkan ID sub-account di web: `/platform/sekolah` → pilih sekolah → Akun pembayaran → status `live`.
5. Uji alur lengkap:
   - TU membuat tagihan.
   - Orang tua membayar dari `/ortu/tagihan` memakai simulasi pembayaran di dasbor Xendit.
   - Status tagihan berubah menjadi lunas.
   - Orang tua menerima notifikasi.
   - Potongan platform tercatat di `/platform`.

**Live.** Ajukan aktivasi akun (verifikasi badan usaha/KYB) dan aktivasi xenPlatform ke Xendit. Setelah disetujui:
- Ganti ketiga rahasia Xendit dengan nilai mode Live.
- Daftarkan ulang URL webhook di mode Live.
- Buat sub-account sungguhan untuk tiap sekolah. Sekolah perlu menyiapkan rekening atas nama sekolah atau yayasan.

## 5. Firebase (notifikasi push)

1. [console.firebase.google.com](https://console.firebase.google.com) → buat proyek (Analytics boleh dimatikan).
2. Tambahkan aplikasi Android dengan package `id.sekolahapp.sekolahapp_mobile`. Lihat catatan di langkah 6 sebelum memutuskan nama ini.
3. Unduh `google-services.json` dan taruh di `apps/mobile/android/app/`. Tanpa berkas ini aplikasi tetap jalan, hanya tanpa push.
4. Project settings → Service accounts → *Generate new private key*. Isi berkas JSON itu disimpan sebagai rahasia `FCM_SERVICE_ACCOUNT` (langkah 1.4).
5. iOS (nanti): tambahkan aplikasi iOS, unggah APNs key, dan taruh `GoogleService-Info.plist` di `apps/mobile/ios/Runner/`.

## 6. Aplikasi Android & Play Store

**Nama paket.** Nama paket (`applicationId`) tidak bisa diganti setelah aplikasi pertama kali diunggah ke Play Store. Saat ini nilainya `id.sekolahapp.sekolahapp_mobile`. Bila ingin memakai nama lain, misalnya `id.sekolahapp.app`, ganti sebelum unggahan pertama, di dua tempat:
- `apps/mobile/android/app/build.gradle.kts`, nilai `namespace` dan `applicationId`
- aplikasi Android di Firebase

**Kunci rilis.** Buat sekali, lalu simpan cadangannya di tempat aman. Kunci yang hilang berarti aplikasi tidak bisa diperbarui.

```bash
keytool -genkey -v -keystore ~/sekolahapp-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Buat `apps/mobile/android/key.properties` (sudah diabaikan git):

```properties
storePassword=...
keyPassword=...
keyAlias=upload
storeFile=/Users/anda/sekolahapp-upload.jks
```

**Build:**

```bash
cd apps/mobile
flutter build appbundle --release \
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon key>
# hasil: build/app/outputs/bundle/release/app-release.aab
```

**APK uji tanpa build sendiri.**
1. Isi variabel repo `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di GitHub (Settings → Secrets and variables → Actions → Variables).
2. Setiap kali CI jalan, job *APK Android* menghasilkan artefak `sekolahapp-apk`. Unduh dari halaman run di tab Actions.
3. APK itu ditandatangani kunci debug, jadi hanya untuk uji di HP, bukan untuk Play Store.

**Play Console:**
- **App content → Privacy policy:** `https://sekolahapp.id/privasi`
- **App content → Data deletion:** `https://sekolahapp.id/hapus-akun`. Penghapusan juga tersedia di aplikasi, lewat Profil → Hapus akun.
- **Data safety.** Data yang dikumpulkan:
  - nama, email, dan nomor telepon
  - lokasi presisi (absen, opsional)
  - foto/berkas (lampiran izin dan tugas)
  - riwayat pembayaran
  - ID perangkat (token push)

  Semua data dienkripsi saat transit, tidak dijual, dan dapat diminta dihapus.
- **Target audience:** aplikasi dipakai murid di bawah 13 tahun. Pilih rentang usia yang sesuai; Google akan menerapkan kebijakan *Families*. Aplikasi ini tidak memakai iklan maupun SDK analitik pihak ketiga.
- Mulai dari jalur **Internal testing**, lalu **Closed testing**. Akun developer pribadi yang baru wajib menjalankan uji tertutup dengan minimal 12 penguji selama 14 hari sebelum bisa rilis produksi. Akun developer organisasi tidak terkena aturan ini.

## 7. Data hukum & pemeriksaan akhir

- Isi `NEXT_PUBLIC_LEGAL_*` (langkah 2). Sebelum diisi, halaman `/privasi` dan `/syarat` masih menampilkan teks pengganti dalam kurung siku.
- Minta konsultan hukum membaca `/privasi` dan `/syarat`, terutama bagian data anak (Pasal 25 UU PDP) dan masa simpan data.
- Siapkan perjanjian pemrosesan data (DPA) sederhana untuk ditandatangani sekolah. Sekolah adalah pengendali data, SekolahApp adalah prosesor.
- **Permintaan hapus akun** muncul di `/platform`. Hapus pengguna di Supabase (Authentication → Users), lalu klik *Sudah dihapus*. Batas waktunya 14 hari.

**Pemeriksaan sebelum sekolah pertama:**

- [ ] Daftar sekolah baru dari `/daftar` dengan email sungguhan, lalu konfirmasi email sampai
- [ ] Lupa kata sandi berhasil dari email
- [ ] Admin sekolah: tambah kelas, impor murid, buat akun guru dan orang tua
- [ ] Guru: absensi, tugas, dan unduh rekap Excel
- [ ] Orang tua di HP: menerima notifikasi push saat anak absen
- [ ] TU: buat tagihan; orang tua membayar (sandbox Xendit); status lunas otomatis
- [ ] `monthly-jobs` tercatat jalan di Edge Functions → Logs keesokan harinya
- [ ] Paket Gratis: fitur SPP terkunci; naik paket dari `/admin/langganan` disetujui di `/platform`
- [ ] Hapus akun: ajukan dari HP, muncul di `/platform`
