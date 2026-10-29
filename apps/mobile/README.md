# SekolahApp — aplikasi HP (Flutter)

Aplikasi Android/iOS untuk **murid**, **orang tua**, dan **guru**. Peran lain (kepala sekolah, admin, TU, BK) memakai dasbor web; di aplikasi ini mereka tetap bisa membaca pengumuman dan notifikasi. Satu akun bisa punya banyak peran; ganti peran dari ikon profil.

| Peran | Fitur |
|---|---|
| Murid | Beranda (jadwal, tugas, kelas online), absen dengan pindai QR/kode + lokasi, tugas & unggah jawaban, kelompok kerja (undang, jabatan, kas bendahara), info biaya |
| Orang tua | Ringkasan anak (absen, nilai, prestasi, tagihan), izin/sakit + surat PDF/foto, tagihan & bayar online (Xendit), pesan wali kelas, pengumuman |
| Guru | Beranda (jadwal mengajar, izin menunggu, arahan kepsek), absensi kelas + QR, setujui/tolak izin murid, pesan orang tua, absen masuk/pulang & cuti |

## Menjalankan

```bash
cd apps/mobile
flutter pub get
# Emulator Android memakai 10.0.2.2 untuk localhost komputer.
flutter run --dart-define=SUPABASE_URL=http://10.0.2.2:54321 --dart-define=SUPABASE_ANON_KEY=<anon key dari `npx supabase status`>
```

Produksi: ganti `SUPABASE_URL` dan `SUPABASE_ANON_KEY` dengan nilai proyek Supabase (region Singapura), lalu `flutter build appbundle` / `flutter build ipa` dengan `--dart-define` yang sama.

Akun demo (kata sandi `sekolah123`): `andi@` (murid), `ortu.andi@` (orang tua), `sari@` (guru + wali kelas) di domain `demo.sekolahapp.id`.

## Notifikasi push

Edge Function `push-dispatch` mengirim notifikasi lewat FCM ke token di tabel `device_tokens`. Aplikasi mendaftarkan token otomatis setelah login bila Firebase sudah dikonfigurasi:

1. Buat proyek Firebase, tambahkan aplikasi Android `com.wahanamediaberkat.sekolahapp` dan iOS.
2. Jalankan `flutterfire configure` atau taruh `google-services.json` di `android/app/` dan `GoogleService-Info.plist` di `ios/Runner/`.
3. Tanpa berkas itu aplikasi tetap berjalan; push hanya dilewati.

## Tes

```bash
flutter analyze
flutter test
```
