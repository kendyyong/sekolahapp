import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { registerSchool, WELCOME } from "@/lib/onboarding";
import { SchoolFields, schoolDraftFrom } from "@/components/school-fields";
import { Button, Field, Flash, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Daftarkan sekolah" };

const AUTH_ERRORS: Record<string, string> = {
  user_already_exists: "Email sudah terdaftar. Silakan masuk, lalu daftarkan sekolah dari menu akun.",
  weak_password: "Kata sandi terlalu lemah. Gunakan minimal 8 karakter.",
  email_address_invalid: "Alamat email tidak valid.",
  over_email_send_rate_limit: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
};

async function signUp(fd: FormData) {
  "use server";
  const sb = await createClient();
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const draft = schoolDraftFrom(fd);
  const back = (err: string) => redirect("/daftar?err=" + encodeURIComponent(err));
  if (password.length < 8) back("Kata sandi minimal 8 karakter.");

  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: String(fd.get("full_name") ?? "").trim(), pending_school: draft } },
  });
  if (error) back(AUTH_ERRORS[error.code ?? ""] ?? error.message);
  // Bila konfirmasi email aktif, sekolah didaftarkan setelah pengguna pertama kali masuk.
  if (!data.session) redirect("/login?ok=" + encodeURIComponent("Kami mengirim tautan konfirmasi ke email Anda. Setelah konfirmasi, masuk untuk menyelesaikan pendaftaran sekolah."));

  const err = await registerSchool(sb, draft);
  if (err) redirect("/sekolah-baru?err=" + encodeURIComponent(err));
  redirect("/admin?ok=" + encodeURIComponent(WELCOME));
}

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 text-center">
          <Link href="/" className="text-3xl font-extrabold tracking-tight text-ink">Sekolah<span className="text-accent">App</span></Link>
          <h1 className="mt-4 text-xl font-extrabold text-ink">Daftarkan sekolah Anda</h1>
          <p className="mt-1 text-sm text-muted">Gratis untuk sampai 100 murid. Anda menjadi Admin Sekolah dan bisa mengundang guru, TU, dan orang tua.</p>
        </div>
        <Flash searchParams={sp} />
        <form action={signUp} className="flex flex-col gap-4 rounded-lg border border-line bg-sheet p-6">
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Akun Anda</legend>
            <Field label="Nama lengkap"><Input id="full_name" name="full_name" required autoComplete="name" /></Field>
            <Field label="Email"><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
            <Field label="Kata sandi" hint="Minimal 8 karakter."><Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
          </fieldset>
          <fieldset className="flex flex-col gap-4 border-t border-line pt-4">
            <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Sekolah</legend>
            <SchoolFields />
          </fieldset>
          <Button type="submit" className="mt-2">Daftar & buka dasbor</Button>
          <p className="text-center text-xs text-muted">Dengan mendaftar, Anda menyetujui <Link href="/syarat" className="font-semibold text-brand">Syarat Layanan</Link> dan <Link href="/privasi" className="font-semibold text-brand">Kebijakan Privasi</Link> SekolahApp, termasuk kewajiban sekolah memperoleh persetujuan orang tua untuk data murid.</p>
        </form>
        <p className="mt-6 text-center text-sm text-muted">Sudah punya akun? <Link href="/login" className="font-semibold text-brand">Masuk</Link></p>
      </div>
    </main>
  );
}
