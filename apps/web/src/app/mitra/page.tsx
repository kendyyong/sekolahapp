import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Field, Flash, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AFFILIATE_TERMS } from "@/lib/affiliate";
import { rupiah } from "@/lib/format";

export const metadata: Metadata = { title: "Program Affiliator" };

const AUTH_ERRORS: Record<string, string> = {
  user_already_exists: "Email sudah terdaftar. Silakan masuk, lalu buka menu Program Affiliator.",
  weak_password: "Kata sandi terlalu lemah. Gunakan minimal 8 karakter.",
  email_address_invalid: "Alamat email tidak valid.",
  over_email_send_rate_limit: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
};

async function signUp(fd: FormData) {
  "use server";
  const sb = await createClient();
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const phone = String(fd.get("phone") ?? "").trim();
  const back = (err: string) => redirect("/mitra?err=" + encodeURIComponent(err) + "#daftar");
  if (password.length < 8) back("Kata sandi minimal 8 karakter.");

  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: String(fd.get("full_name") ?? "").trim(), pending_affiliate: { phone } } },
  });
  if (error) back(AUTH_ERRORS[error.code ?? ""] ?? error.message);
  // Bila konfirmasi email aktif, pendaftaran affiliator dilanjutkan setelah pengguna pertama kali masuk.
  if (!data.session) redirect("/login?next=/afiliasi&ok=" + encodeURIComponent("Kami mengirim tautan konfirmasi ke email Anda. Setelah konfirmasi, masuk untuk melengkapi data affiliator."));
  redirect("/afiliasi");
}

const STEPS = [
  { t: "Daftar gratis", d: "Buat akun affiliator dan lengkapi rekening bank untuk menerima komisi." },
  { t: "Bagikan tautan Anda", d: "Setelah disetujui, Anda mendapat kode dan tautan pendaftaran sekolah khusus." },
  { t: "Sekolah mendaftar", d: "Sekolah yang mendaftar lewat tautan atau kode Anda tercatat sebagai referral Anda." },
  { t: "Terima komisi", d: `${AFFILIATE_TERMS.pct}% dari biaya langganan bulanan sekolah itu selama ${AFFILIATE_TERMS.months} bulan, ditransfer ke rekening Anda.` },
];

export default async function AffiliateLanding({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const sp = await searchParams;
  const sample = 300 * 3000 * AFFILIATE_TERMS.pct / 100;
  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-extrabold tracking-tight text-ink">Sekolah<span className="text-accent">App</span></Link>
          <h1 className="mt-4 text-2xl font-extrabold text-ink text-balance">Program Affiliator SekolahApp</h1>
          <p className="mx-auto mt-2 max-w-xl text-muted text-pretty">
            Kenalkan SekolahApp ke sekolah yang Anda kenal, dan dapatkan bagian dari biaya langganan mereka.
            Cocok untuk guru, pengawas, operator sekolah, konsultan pendidikan, atau siapa saja yang dekat dengan sekolah.
          </p>
        </div>

        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.t} className="rounded-lg border border-line bg-sheet p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-brand">Langkah {i + 1}</div>
              <div className="mt-1 font-bold text-ink">{s.t}</div>
              <p className="mt-1 text-sm text-muted text-pretty">{s.d}</p>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-lg border border-line bg-brand-soft p-4 text-sm text-ink">
          <b>Contoh:</b> sekolah dengan 300 murid di paket Dasar membayar Rp900.000 per bulan.
          Anda mendapat {rupiah(sample)} setiap bulan selama {AFFILIATE_TERMS.months} bulan
          ({rupiah(sample * AFFILIATE_TERMS.months)} per sekolah).
          Komisi dihitung dari tagihan yang sudah dibayar sekolah; sekolah paket Gratis belum menghasilkan komisi sampai naik paket.
        </div>

        <form id="daftar" action={signUp} className="mx-auto mt-8 flex max-w-lg flex-col gap-4 rounded-lg border border-line bg-sheet p-6">
          <h2 className="text-lg font-extrabold text-ink">Daftar jadi affiliator</h2>
          <Field label="Nama lengkap"><Input id="full_name" name="full_name" required autoComplete="name" /></Field>
          <Field label="Nomor HP/WhatsApp"><Input id="phone" name="phone" type="tel" required minLength={8} autoComplete="tel" /></Field>
          <Field label="Email"><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
          <Field label="Kata sandi" hint="Minimal 8 karakter."><Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
          <div className="-mb-3 mt-2 empty:hidden"><Flash searchParams={sp} /></div>
          <SubmitButton pendingLabel="Mendaftarkan…">Daftar</SubmitButton>
          <p className="text-center text-xs text-muted">Dengan mendaftar, Anda menyetujui <Link href="/syarat" className="font-semibold text-brand">Syarat Layanan</Link> SekolahApp. Pendaftaran affiliator ditinjau tim kami sebelum kode aktif.</p>
        </form>
        <p className="mt-6 text-center text-sm text-muted">Sudah punya akun SekolahApp? <Link href="/login?next=/afiliasi" className="font-semibold text-brand">Masuk</Link> lalu buka menu Program Affiliator.</p>
      </div>
    </main>
  );
}
