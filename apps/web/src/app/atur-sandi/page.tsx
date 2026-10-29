import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button, Field, Flash, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Kata sandi baru" };

async function savePassword(fd: FormData) {
  "use server";
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) redirect("/atur-sandi?err=" + encodeURIComponent("Kata sandi minimal 8 karakter."));
  if (password !== String(fd.get("confirm") ?? "")) redirect("/atur-sandi?err=" + encodeURIComponent("Kedua kata sandi tidak sama."));
  const sb = await createClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    const msg = error.code === "same_password" ? "Kata sandi baru harus berbeda dari yang lama."
      : error.code === "weak_password" ? "Kata sandi terlalu lemah. Pakai kombinasi huruf dan angka."
      : "Gagal menyimpan kata sandi. Minta tautan baru lalu coba lagi.";
    redirect("/atur-sandi?err=" + encodeURIComponent(msg));
  }
  redirect("/atur-sandi?ok=" + encodeURIComponent("Kata sandi baru tersimpan."));
}

export default async function SetPassword({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/lupa-sandi");

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-extrabold tracking-tight text-ink">Sekolah<span className="text-accent">App</span></div>
          <p className="mt-2 text-sm text-muted">Buat kata sandi baru untuk {user.email}.</p>
        </div>
        <Flash searchParams={sp} />
        {sp.ok ? (
          <Link href="/mulai" className="block rounded-md bg-brand px-4 py-2.5 text-center font-semibold text-white hover:bg-brand-strong">Lanjut ke dasbor</Link>
        ) : (
          <form action={savePassword} className="flex flex-col gap-4 rounded-lg border border-line bg-sheet p-6">
            <Field label="Kata sandi baru" hint="Minimal 8 karakter.">
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label="Ulangi kata sandi">
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <Button type="submit">Simpan kata sandi</Button>
          </form>
        )}
      </div>
    </main>
  );
}
