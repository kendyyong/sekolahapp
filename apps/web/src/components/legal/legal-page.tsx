import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";

/** Kerangka halaman hukum publik (privasi, syarat, hapus akun). */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link href="/" className="text-xl font-extrabold tracking-tight text-ink">Sekolah<span className="text-accent">App</span></Link>
        <nav className="flex gap-4 text-sm font-semibold text-muted">
          <Link href="/privasi" className="hover:text-ink">Privasi</Link>
          <Link href="/syarat" className="hover:text-ink">Syarat</Link>
          <Link href="/hapus-akun" className="hover:text-ink">Hapus akun</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">Terakhir diperbarui {LEGAL.updated}</p>
        <article className="mt-8 flex flex-col gap-6 text-ink [&_h2]:text-lg [&_h2]:font-extrabold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-pretty [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:text-muted [&_p]:text-muted">
          {children}
        </article>
      </main>
    </div>
  );
}
