import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { rupiah } from "@/lib/format";
import { LEGAL, waLink } from "@/lib/legal";
import { Button, Field, Input, LinkButton, Select, cx } from "@/components/ui";
import { SiteFooter, SiteHeader } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Berlangganan · SekolahApp",
  description: "Pilih paket SekolahApp, hitung biaya langganan per murid, lalu daftarkan sekolah dan bayar lewat QRIS, virtual account, e-wallet, atau minimarket.",
};

const DURATIONS = [1, 6, 12] as const;
const METHODS = [
  ["QRIS", "Semua aplikasi bank & e-wallet"],
  ["Virtual Account", "BCA, BNI, BRI, Mandiri, Permata, BSI, CIMB"],
  ["E-wallet", "OVO, DANA, ShopeePay, LinkAja"],
  ["Gerai ritel", "Alfamart, Indomaret"],
];

// Dipakai bila tabel paket tidak terbaca, agar halaman harga tidak pernah kosong.
const FALLBACK_PLANS = [
  { tier: "free", name: "Gratis", price_per_student: 0, max_students: 100 },
  { tier: "basic", name: "Dasar", price_per_student: 3000, max_students: null },
  { tier: "pro", name: "Pro", price_per_student: 6000, max_students: null },
];

const clampInt = (v: string | undefined, min: number, max: number, dflt: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : dflt;
};

export default async function Checkout({ searchParams }: { searchParams: Promise<{ paket?: string; murid?: string; bulan?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const { data: plans } = await sb.from("plans").select("tier, name, price_per_student, max_students")
    .in("tier", ["free", "basic", "pro"]).order("price_per_student");
  const list = plans?.length ? plans : FALLBACK_PLANS;
  const plan = list.find((p) => p.tier === sp.paket) ?? list.find((p) => p.tier === "pro") ?? list[0];
  const maxStudents = plan?.max_students ?? 5000;
  const students = clampInt(sp.murid, 1, maxStudents, Math.min(300, maxStudents));
  const months = DURATIONS.find((d) => String(d) === sp.bulan) ?? 1;
  const price = Number(plan?.price_per_student ?? 0);
  const total = price * students * months;
  const next = `/daftar?paket=${plan?.tier ?? "free"}&murid=${students}&bulan=${months}`;

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <nav className="text-sm text-muted"><Link href="/#harga" className="hover:text-ink">Harga</Link> / Berlangganan</nav>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">Berlangganan SekolahApp</h1>
        <p className="mt-2 max-w-2xl text-muted text-pretty">
          Pilih paket dan jumlah murid aktif. Total langganan dihitung otomatis, lalu Anda mendaftarkan sekolah dan membayar tagihan
          langganan pertama lewat QRIS, virtual account, e-wallet, atau minimarket.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <form method="get" className="flex flex-col gap-5 rounded-lg border border-line bg-sheet p-5">
            <fieldset>
              <legend className="text-sm font-bold text-ink">1. Pilih paket</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {list.map((p) => (
                  <label key={p.tier} className={cx("flex cursor-pointer flex-col rounded-lg border p-4 has-[:checked]:border-brand has-[:checked]:ring-1 has-[:checked]:ring-brand", "border-line")}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="paket" value={p.tier} defaultChecked={p.tier === plan?.tier} className="accent-brand" />
                      <span className="font-extrabold text-ink">{p.name}</span>
                    </span>
                    <span className="mt-2 text-xl font-extrabold tabular-nums text-ink">{rupiah(p.price_per_student)}</span>
                    <span className="text-xs text-muted">{p.price_per_student === 0 ? `sampai ${p.max_students} murid` : "per murid / bulan"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="2. Jumlah murid aktif" hint={plan?.max_students ? `Paket ${plan.name} maksimal ${plan.max_students} murid.` : "Guru, TU, dan orang tua tidak dihitung."}>
                <Input type="number" name="murid" min={1} max={maxStudents} defaultValue={students} required />
              </Field>
              <Field label="3. Lama langganan">
                <Select name="bulan" defaultValue={String(months)}>
                  {DURATIONS.map((d) => <option key={d} value={d}>{d} bulan</option>)}
                </Select>
              </Field>
            </div>
            <Button type="submit" variant="secondary" className="self-start">Hitung ulang</Button>
            <p className="text-xs text-muted">
              Butuh paket Enterprise untuk yayasan atau sekolah besar?{" "}
              <a href={waLink("Halo, saya ingin penawaran SekolahApp Enterprise.")} className="font-semibold text-brand">Hubungi kami</a>.
            </p>
          </form>

          <aside className="flex flex-col gap-4 rounded-lg border border-line bg-sheet p-5" aria-label="Ringkasan pesanan">
            <h2 className="font-extrabold text-ink">Ringkasan pesanan</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted">Paket</dt><dd className="font-semibold text-ink">{plan?.name ?? "–"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Harga per murid / bulan</dt><dd className="tabular-nums text-ink">{rupiah(price)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Jumlah murid</dt><dd className="tabular-nums text-ink">{students.toLocaleString("id-ID")}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Lama langganan</dt><dd className="tabular-nums text-ink">{months} bulan</dd></div>
              <div className="mt-2 flex justify-between gap-4 border-t border-line pt-3 text-base">
                <dt className="font-bold text-ink">Total</dt><dd className="font-extrabold tabular-nums text-ink">{rupiah(total)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">Harga sudah termasuk semua fitur paket. Biaya layanan metode pembayaran ditampilkan di halaman pembayaran.</p>
            <LinkButton href={next} variant="primary" className="py-3 text-base">
              {total === 0 ? "Daftar gratis" : "Lanjut ke pembayaran"}
            </LinkButton>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Metode pembayaran</div>
              <ul className="mt-2 grid gap-2 text-sm">
                {METHODS.map(([m, d]) => <li key={m} className="flex justify-between gap-3"><span className="font-semibold text-ink">{m}</span><span className="text-right text-muted">{d}</span></li>)}
              </ul>
              <p className="mt-3 text-xs text-muted">Pembayaran aman diproses oleh Xendit. Pertanyaan tagihan: {LEGAL.email} atau {LEGAL.phone}.</p>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
