import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Syarat Layanan · SekolahApp" };

export default function Terms() {
  return (
    <LegalPage title="Syarat Layanan">
      <section>
        <p>
          Syarat ini mengatur penggunaan SekolahApp yang diselenggarakan oleh {LEGAL.company}. Dengan mendaftarkan sekolah atau
          memakai akun SekolahApp, Anda menyetujui syarat ini dan <Link href="/privasi" className="font-semibold text-brand">Kebijakan Privasi</Link>.
        </p>
      </section>
      <section>
        <h2>1. Akun</h2>
        <ul>
          <li>Akun pengelola sekolah dibuat oleh orang yang berwenang mewakili sekolah atau yayasan.</li>
          <li>Akun guru, murid, dan orang tua dibuat oleh sekolah. Sekolah bertanggung jawab atas kebenaran data dan persetujuan orang tua untuk data murid.</li>
          <li>Pengguna wajib menjaga kerahasiaan kata sandi dan tidak membagikan akun.</li>
        </ul>
      </section>
      <section>
        <h2>2. Paket & pembayaran langganan</h2>
        <ul>
          <li>Biaya dihitung per murid aktif per bulan sesuai paket yang tertera di halaman harga. Paket Gratis berlaku untuk paling banyak 100 murid aktif.</li>
          <li>Untuk sekolah yang memakai pembayaran online, biaya langganan dipotong otomatis dari setiap transaksi. Kekurangan ditagihkan di awal bulan berikutnya.</li>
          <li>Perubahan paket berlaku setelah disetujui. Saat turun paket, data lama tetap tersimpan, tetapi fitur paket yang lebih tinggi tidak dapat dipakai untuk data baru.</li>
          <li>Tagihan langganan yang tidak dibayar lebih dari 30 hari dapat menyebabkan layanan dibatasi setelah pemberitahuan.</li>
        </ul>
      </section>
      <section>
        <h2>3. Pembayaran sekolah oleh orang tua</h2>
        <p>
          Pembayaran SPP dan biaya sekolah diproses oleh Xendit dan diteruskan ke rekening sekolah. Biaya layanan pembayaran
          ditampilkan sebelum orang tua membayar. Pengembalian dana atas pembayaran sekolah menjadi kebijakan masing-masing sekolah.
        </p>
      </section>
      <section>
        <h2>4. Penggunaan yang dilarang</h2>
        <ul>
          <li>Mengunggah konten yang melanggar hukum, merundung, atau melanggar privasi orang lain.</li>
          <li>Mencoba mengakses data sekolah atau pengguna lain tanpa hak.</li>
          <li>Mengganggu, membebani, atau merekayasa balik layanan.</li>
        </ul>
      </section>
      <section>
        <h2>5. Data & kepemilikan</h2>
        <p>
          Data yang dimasukkan sekolah tetap milik sekolah. Sekolah dapat mengekspor datanya kapan saja selama berlangganan dan
          sampai 90 hari setelah berhenti.
        </p>
      </section>
      <section>
        <h2>6. Ketersediaan layanan</h2>
        <p>
          Kami berupaya menjaga layanan tetap tersedia, tetapi pemeliharaan atau gangguan pihak ketiga dapat menyebabkan layanan
          terhenti sementara. Pemeliharaan terjadwal diumumkan lebih dahulu bila memungkinkan.
        </p>
      </section>
      <section>
        <h2>7. Batas tanggung jawab</h2>
        <p>
          Sejauh diizinkan hukum, tanggung jawab kami atas kerugian yang timbul dari penggunaan layanan dibatasi sebesar biaya
          langganan yang dibayar sekolah dalam 3 bulan terakhir.
        </p>
      </section>
      <section>
        <h2>8. Hukum yang berlaku</h2>
        <p>Syarat ini tunduk pada hukum Republik Indonesia. Perselisihan diselesaikan secara musyawarah terlebih dahulu.</p>
      </section>
      <section>
        <h2>9. Kontak</h2>
        <p>{LEGAL.company}, {LEGAL.address}. Email: {LEGAL.email}.</p>
      </section>
    </LegalPage>
  );
}
