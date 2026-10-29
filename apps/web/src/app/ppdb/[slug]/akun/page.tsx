import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPpdb } from "@/lib/ppdb-server";
import { brandScope } from "@/lib/brand";
import { Field, Flash, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SchoolMark } from "@/components/school-mark";

export const metadata: Metadata = { title: "Buat akun pendaftar" };

const AUTH_ERRORS: Record<string, string> = {
  user_already_exists: "Email ini sudah punya akun. Silakan masuk.",
  weak_password: "Kata sandi terlalu lemah. Gunakan minimal 8 karakter.",
  email_address_invalid: "Alamat email tidak valid.",
  over_email_send_rate_limit: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
};

async function createAccount(fd: FormData) {
  "use server";
  const slug = String(fd.get("slug") ?? "");
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) redirect("/");
  const back = (err: string) => redirect(`/ppdb/${slug}/akun?err=${encodeURIComponent(err)}`);
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const fullName = String(fd.get("full_name") ?? "").trim();
  if (fullName.length < 3) back("Isi nama lengkap orang tua/wali.");
  if (password.length < 8) back("Kata sandi minimal 8 karakter.");

  const sb = await createClient();
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName, ppdb_slug: slug } } });
  if (error) {
    if (error.code === "user_already_exists") {
      redirect(`/masuk/${slug}?next=/ppdb/${slug}/formulir&err=${encodeURIComponent(AUTH_ERRORS.user_already_exists)}`);
    }
    back(AUTH_ERRORS[error.code ?? ""] ?? error.message);
  }
  if (data.session) redirect(`/ppdb/${slug}/formulir`);
  redirect(`/masuk/${slug}?next=/ppdb/${slug}/formulir&ok=${encodeURIComponent(
    `Kami mengirim tautan konfirmasi ke ${email}. Klik tautan itu, lalu Anda langsung dibawa ke formulir pendaftaran.`)}`);
}

export default async function PpdbAccount({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const data = await loadPpdb(slug);
  if (!data) notFound();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (user) redirect(`/ppdb/${data.school.slug}/formulir`);
  const { school } = data;
  const scope = brandScope(school.brand_color);

  return (
    <main className={`min-h-screen bg-paper px-4 py-10 ${scope.className ?? ""}`} style={scope.style}>
      <div className="mx-auto w-full max-w-md">
        <Link href={`/ppdb/${school.slug}`} className="flex items-center justify-center gap-3">
          <SchoolMark name={school.name} logo={school.logo_url} className="size-12" />
          <span className="text-left">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">PPDB</span>
            <span className="block font-bold text-ink">{school.name}</span>
          </span>
        </Link>
        <div className="mt-8 rounded-xl border border-line bg-sheet p-6 shadow-card">
          <h1 className="text-xl font-bold text-ink">Buat akun pendaftar</h1>
          <p className="mt-1 text-sm text-muted">Akun ini milik orang tua/wali. Setelah anak diterima, akun yang sama dipakai untuk memantau absensi, rapor, dan tagihan.</p>
          <div className="mt-5"><Flash searchParams={sp} /></div>
          <form action={createAccount} className="flex flex-col gap-4">
            <input type="hidden" name="slug" value={school.slug} />
            <Field label="Nama lengkap orang tua/wali"><Input id="full_name" name="full_name" required minLength={3} autoComplete="name" /></Field>
            <Field label="Email"><Input id="email" name="email" type="email" required autoComplete="email" /></Field>
            <Field label="Kata sandi" hint="Minimal 8 karakter."><Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
            <SubmitButton className="py-2.5" pendingLabel="Membuat akun…">Buat akun</SubmitButton>
          </form>
          <p className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">
            Sudah punya akun? <Link href={`/masuk/${school.slug}?next=/ppdb/${school.slug}/formulir`} className="font-semibold text-brand">Masuk</Link>
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-muted">
          Dengan mendaftar, Anda menyetujui <Link href="/syarat" className="underline">Syarat Layanan</Link> dan <Link href="/privasi" className="underline">Kebijakan Privasi</Link>.
        </p>
      </div>
    </main>
  );
}
