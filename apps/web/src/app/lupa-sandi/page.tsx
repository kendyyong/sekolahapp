import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button, Field, Flash, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Lupa kata sandi" };

async function sendLink(fd: FormData) {
  "use server";
  const email = String(fd.get("email") ?? "").trim();
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const sb = await createClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/konfirmasi?next=/atur-sandi` });
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    redirect("/lupa-sandi?err=" + encodeURIComponent("Terlalu banyak permintaan. Coba lagi beberapa menit lagi."));
  }
  if (error && (error.status ?? 500) >= 500) {
    redirect("/lupa-sandi?err=" + encodeURIComponent("Email gagal dikirim. Coba lagi nanti atau hubungi admin sekolah."));
  }
  // Pesan sama untuk email terdaftar maupun tidak, agar daftar akun tidak bisa ditebak.
  redirect("/lupa-sandi?ok=" + encodeURIComponent(`Bila ${email} terdaftar, tautan untuk membuat kata sandi baru sudah dikirim. Periksa juga folder spam.`));
}

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-extrabold tracking-tight text-ink">Sekolah<span className="text-accent">App</span></div>
          <p className="mt-2 text-sm text-muted">Masukkan email akun Anda. Kami kirimkan tautan untuk membuat kata sandi baru.</p>
        </div>
        <Flash searchParams={sp} />
        <form action={sendLink} className="flex flex-col gap-4 rounded-lg border border-line bg-sheet p-6">
          <Field label="Email">
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="nama@sekolah.sch.id" />
          </Field>
          <Button type="submit">Kirim tautan</Button>
        </form>
        <p className="mt-6 text-center text-sm"><Link href="/login" className="font-semibold text-brand">Kembali ke halaman masuk</Link></p>
        <p className="mt-2 text-center text-xs text-muted">Akun murid tanpa email? Minta admin sekolah mengatur ulang kata sandinya.</p>
      </div>
    </main>
  );
}
