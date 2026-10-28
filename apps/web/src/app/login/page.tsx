import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button, Field, Flash, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Masuk" };

async function signIn(fd: FormData) {
  "use server";
  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({
    email: String(fd.get("email") ?? "").trim(),
    password: String(fd.get("password") ?? ""),
  });
  const next = String(fd.get("next") ?? "");
  if (error) redirect("/login?err=" + encodeURIComponent("Email atau kata sandi salah.") + (next ? "&next=" + encodeURIComponent(next) : ""));
  // Hanya tujuan relatif di situs ini.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/mulai");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-extrabold tracking-tight text-ink">Sekolah<span className="text-accent">App</span></div>
          <p className="mt-2 text-sm text-muted">Masuk dengan akun yang diberikan sekolah Anda.</p>
        </div>
        <Flash searchParams={sp} />
        <form action={signIn} className="flex flex-col gap-4 rounded-lg border border-line bg-sheet p-6">
          {sp.next && <input type="hidden" name="next" value={sp.next} />}
          <Field label="Email">
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="nama@sekolah.sch.id" />
          </Field>
          <Field label="Kata sandi">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="mt-2">Masuk</Button>
        </form>
        <p className="mt-6 text-center text-sm"><Link href="/lupa-sandi" className="font-semibold text-brand">Lupa kata sandi?</Link></p>
        <p className="mt-2 text-center text-xs text-muted">Sekolah belum terdaftar? <Link href="/daftar" className="font-semibold text-brand">Daftar gratis</Link></p>
      </div>
    </main>
  );
}
