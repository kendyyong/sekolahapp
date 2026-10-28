import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Kebijakan Privasi · SekolahApp" };

export default function Privacy() {
  return (
    <LegalPage title="Kebijakan Privasi">
      <section>
        <p>
          SekolahApp adalah layanan sistem informasi sekolah yang diselenggarakan oleh {LEGAL.company} (“kami”). Kebijakan ini
          menjelaskan bagaimana data pribadi diproses sesuai Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP).
        </p>
      </section>
      <section>
        <h2>1. Peran para pihak</h2>
        <p>
          Sekolah atau yayasan yang berlangganan adalah <b>pengendali data</b>: sekolah menentukan data murid, orang tua, dan
          pegawai yang dicatat serta tujuan pemakaiannya. SekolahApp bertindak sebagai <b>prosesor data</b> yang memproses data atas
          perintah sekolah. Untuk data akun pengelola sekolah dan tagihan langganan, kami adalah pengendali data.
        </p>
      </section>
      <section>
        <h2>2. Data yang kami proses</h2>
        <ul>
          <li>Identitas: nama, email, nomor telepon, NIS/NISN, jenis kelamin, tanggal lahir, foto (bila diunggah sekolah).</li>
          <li>Data akademik: kelas, jadwal, kehadiran, tugas dan jawaban, nilai, catatan sikap dan konseling.</li>
          <li>Data keuangan: tagihan, pembayaran, beasiswa. Data kartu/rekening diproses oleh penyedia pembayaran (Xendit), bukan oleh kami.</li>
          <li>Surat izin/sakit dan lampiran yang diunggah pengguna.</li>
          <li>Lokasi saat absen, hanya bila sekolah mengaktifkan batas lokasi dan pengguna memberi izin.</li>
          <li>Data teknis: token notifikasi perangkat, log akses, dan alamat IP untuk keamanan.</li>
        </ul>
      </section>
      <section>
        <h2>3. Data anak</h2>
        <p>
          Sebagian besar murid berusia di bawah 18 tahun. Akun murid hanya dibuat oleh sekolah, dan sekolah bertanggung jawab
          memperoleh persetujuan orang tua/wali sebagaimana diwajibkan Pasal 25 UU PDP. Orang tua dapat melihat data anaknya
          melalui akun orang tua. Kami tidak menampilkan iklan dan tidak menjual data pribadi kepada siapa pun.
        </p>
      </section>
      <section>
        <h2>4. Tujuan pemrosesan</h2>
        <ul>
          <li>Menjalankan layanan sekolah: absensi, tugas, izin, komunikasi, penilaian, dan administrasi keuangan.</li>
          <li>Mengirim notifikasi yang berkaitan dengan murid kepada orang tua dan guru.</li>
          <li>Memproses pembayaran sekolah dan tagihan langganan.</li>
          <li>Menjaga keamanan sistem, mencegah penyalahgunaan, dan memenuhi kewajiban hukum.</li>
        </ul>
      </section>
      <section>
        <h2>5. Penyimpanan & keamanan</h2>
        <p>
          Data disimpan di layanan basis data terkelola (Supabase) di pusat data Singapura dengan enkripsi saat transit dan saat
          disimpan. Data setiap sekolah dipisahkan dengan kontrol akses di tingkat basis data, sehingga pengguna hanya dapat melihat
          data yang menjadi haknya. Sekolah dapat meminta pemindahan data ke pusat data di Indonesia.
        </p>
      </section>
      <section>
        <h2>6. Pihak ketiga</h2>
        <ul>
          <li>Supabase: penyimpanan data dan autentikasi.</li>
          <li>Xendit: pemrosesan pembayaran (QRIS, virtual account, e-wallet, gerai ritel).</li>
          <li>Google Firebase Cloud Messaging: pengiriman notifikasi ke ponsel.</li>
          <li>Penyedia email untuk pesan akun (atur ulang kata sandi, konfirmasi).</li>
        </ul>
      </section>
      <section>
        <h2>7. Masa simpan</h2>
        <p>
          Data disimpan selama sekolah berlangganan. Setelah langganan berakhir, sekolah dapat mengekspor datanya dalam 90 hari,
          setelah itu data dihapus kecuali yang wajib disimpan menurut peraturan (misalnya catatan transaksi keuangan).
        </p>
      </section>
      <section>
        <h2>8. Hak Anda</h2>
        <p>
          Anda berhak mengakses, memperbaiki, meminta salinan, membatasi, dan meminta penghapusan data pribadi Anda, serta menarik
          persetujuan. Ajukan melalui admin sekolah Anda, melalui menu Profil → Hapus akun, atau email ke {LEGAL.email}. Kami
          menanggapi permintaan dalam tenggat yang ditetapkan UU PDP.
        </p>
      </section>
      <section>
        <h2>9. Kontak</h2>
        <p>{LEGAL.company}, {LEGAL.address}. Email: {LEGAL.email}.</p>
      </section>
    </LegalPage>
  );
}
