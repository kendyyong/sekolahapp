import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { rupiah } from "@/lib/format";
import { LinkButton, cx } from "@/components/ui";

export const metadata: Metadata = {
  title: "SekolahApp · Satu aplikasi untuk seluruh warga sekolah",
  description: "Absensi, tugas, izin, SPP, dan komunikasi orang tua dalam satu aplikasi untuk sekolah dan yayasan di Indonesia.",
};

const ROLES = [
  { who: "Murid", items: ["Absen dengan QR kelas", "Tugas & PR, unggah jawaban", "Kelompok kerja: Ketua, Sekretaris, Bendahara", "Jadwal & kelas online"] },
  { who: "Orang Tua", items: ["Pantau absen, nilai, prestasi anak", "Ajukan izin dengan surat dokter", "Bayar SPP lewat QRIS, VA, e-wallet", "Pesan langsung ke wali kelas"] },
  { who: "Guru & Wali Kelas", items: ["Absensi kelas dalam satu ketukan", "Bagikan tugas & tautan Zoom", "Setujui izin murid", "Absen masuk & ajukan cuti"] },
  { who: "Tata Usaha", items: ["Tagihan bulanan otomatis", "Beasiswa & potongan", "Kuitansi & tunggakan", "Dana masuk langsung ke rekening sekolah"] },
  { who: "Kepala Sekolah", items: ["Dasbor kehadiran & keuangan", "Setujui cuti guru", "Beri arahan & pantau laporan", "Rekap per kelas"] },
  { who: "Yayasan", items: ["Ringkasan semua sekolah", "Kehadiran & tunggakan per unit", "Satu akun untuk semua sekolah", "Laporan untuk pengurus"] },
];

const MODULE_LABEL: Record<string, string> = {
  core: "Absensi, tugas, izin, pengumuman, pesan",
  staff: "Absen & cuti guru, arahan kepsek",
  finance: "SPP & pembayaran online",
  grades: "Penilaian",
  counseling: "BK & catatan sikap",
  dashboard: "Dasbor kepala sekolah",
  foundation: "Dasbor yayasan multi-sekolah",
  whitelabel: "Nama & logo sekolah sendiri",
  ppdb: "PPDB online",
  cbt: "Ujian online (CBT)",
  whatsapp: "Notifikasi WhatsApp",
};

const FAQ = [
  ["Apakah uang SPP masuk ke rekening kami?", "Ya. Pembayaran online langsung masuk ke rekening sekolah lewat Xendit. Biaya langganan dipotong otomatis per transaksi, jadi sekolah tidak perlu transfer terpisah."],
  ["Bagaimana dengan orang tua yang tidak punya HP?", "Pembayaran tunai tetap dicatat TU dan kuitansinya tercetak. Izin juga bisa diajukan lewat wali kelas."],
  ["Di mana data kami disimpan?", "Di server Supabase region Singapura dengan enkripsi, dan setiap sekolah terisolasi. Bila diperlukan, data bisa dipindahkan ke server di Indonesia."],
  ["Berapa lama mulai memakai?", "Daftar sekitar 2 menit. Data murid bisa ditempel langsung dari Excel, lalu akun guru dan orang tua dibuat dari dasbor admin."],
];

export default async function Landing() {
  const sb = await createClient();
  const [{ data: { user } }, { data: plans }] = await Promise.all([
    sb.auth.getUser(),
    sb.from("plans").select("tier, name, price_per_student, max_students, modules").order("price_per_student"),
  ]);
  const order = ["free", "basic", "pro", "enterprise"];
  const sorted = (plans ?? []).sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));

  return (
    <div className="bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-ink">Sekolah<span className="text-accent">App</span></Link>
        <nav className="flex items-center gap-2 text-sm font-semibold">
          <a href="#harga" className="hidden px-3 py-2 text-muted hover:text-ink sm:inline">Harga</a>
          {user ? <LinkButton href="/mulai" variant="primary">Buka dasbor</LinkButton> : <>
            <LinkButton href="/login" variant="ghost">Masuk</LinkButton>
            <LinkButton href="/daftar" variant="primary">Daftar gratis</LinkButton>
          </>}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 md:pt-16">
        <p className="text-sm font-bold uppercase tracking-wide text-accent">Untuk SD, SMP, SMA, SMK, madrasah & yayasan</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-ink text-balance md:text-5xl">
          Satu aplikasi untuk murid, orang tua, guru, TU, dan kepala sekolah.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted text-pretty">
          Absensi dengan QR, tugas dan PR, izin dengan surat dokter, SPP yang dibayar lewat QRIS, dan pesan ke wali kelas.
          Semua tercatat rapi dan bisa dipantau dari mana saja.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href="/daftar" variant="primary" className="px-5 py-3 text-base">Daftarkan sekolah, gratis</LinkButton>
          <LinkButton href="#harga" className="px-5 py-3 text-base">Lihat harga</LinkButton>
        </div>
        <p className="mt-3 text-sm text-muted">Gratis selamanya untuk sekolah sampai 100 murid. Tanpa kartu kredit.</p>
      </section>

      <section className="border-y border-line bg-sheet">
        <div className="mx-auto grid max-w-6xl gap-px bg-line px-0 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.who} className="bg-sheet p-6">
              <h2 className="text-lg font-extrabold text-ink">{r.who}</h2>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
                {r.items.map((i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{i}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-[1fr_1.2fr] md:items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-ink text-balance">SPP masuk langsung ke rekening sekolah</h2>
          <p className="mt-3 text-muted text-pretty">
            Orang tua membayar lewat QRIS, virtual account, e-wallet, atau minimarket. Dana diteruskan ke rekening sekolah,
            tagihan otomatis lunas, dan kuitansi terkirim. Biaya langganan dipotong otomatis dari transaksi, jadi tidak ada tagihan tambahan.
          </p>
        </div>
        <ol className="grid gap-3 text-sm">
          {[
            ["1", "TU membuat tagihan bulanan", "Sekali klik untuk semua murid, termasuk potongan beasiswa."],
            ["2", "Orang tua membayar dari HP", "QRIS, VA bank, e-wallet, atau Alfamart/Indomaret."],
            ["3", "Dana masuk ke rekening sekolah", "Status lunas dan kuitansi tercatat otomatis."],
          ].map(([n, t, d]) => (
            <li key={n} className="flex gap-4 rounded-lg border border-line bg-sheet p-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft font-extrabold text-brand">{n}</span>
              <div><div className="font-bold text-ink">{t}</div><div className="text-muted">{d}</div></div>
            </li>
          ))}
        </ol>
      </section>

      <section id="harga" className="border-t border-line bg-sheet">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">Harga sederhana, per murid aktif</h2>
          <p className="mt-2 text-muted">Bayar hanya untuk murid aktif. Guru, TU, dan orang tua tidak dihitung.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sorted.map((p) => {
              const featured = p.tier === "pro";
              return (
                <div key={p.tier} className={cx("flex flex-col rounded-lg border bg-sheet p-5", featured ? "border-brand ring-1 ring-brand" : "border-line")}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-extrabold text-ink">{p.name}</h3>
                    {featured && <span className="rounded bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">Terpopuler</span>}
                  </div>
                  <div className="mt-3 text-3xl font-extrabold tracking-tight text-ink tabular-nums">
                    {p.tier === "enterprise" ? "Hubungi kami" : p.price_per_student === 0 ? "Rp0" : rupiah(p.price_per_student)}
                  </div>
                  <div className="text-sm text-muted">
                    {p.tier === "free" ? `sampai ${p.max_students} murid` : p.tier === "enterprise" ? "untuk yayasan & sekolah besar" : "per murid / bulan"}
                  </div>
                  <ul className="mt-4 flex flex-1 flex-col gap-1.5 text-sm text-muted">
                    {(p.modules as string[]).map((m) => <li key={m} className="flex gap-2"><span aria-hidden className="text-good">✓</span>{MODULE_LABEL[m] ?? m}</li>)}
                  </ul>
                  <LinkButton href="/daftar" variant={featured ? "primary" : "secondary"} className="mt-5">
                    {p.tier === "enterprise" ? "Ajukan penawaran" : "Mulai"}
                  </LinkButton>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted">Pembayaran online dikenai biaya layanan gateway (misalnya QRIS 0,7%, VA Rp5.500), yang dapat ditanggung orang tua atau sekolah.</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-2xl font-extrabold tracking-tight text-ink">Pertanyaan umum</h2>
        <div className="mt-6 divide-y divide-line rounded-lg border border-line bg-sheet">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group p-4">
              <summary className="cursor-pointer list-none font-bold text-ink marker:hidden">{q}</summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
          <span>© {new Date().getFullYear()} SekolahApp</span>
          <nav className="flex gap-4">
            <Link href="/privasi" className="hover:text-ink">Kebijakan Privasi</Link>
            <Link href="/syarat" className="hover:text-ink">Syarat Layanan</Link>
            <Link href="/hapus-akun" className="hover:text-ink">Hapus akun</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
