import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL, waLink } from "@/lib/legal";
import { LinkButton } from "@/components/ui";

/** Kepala halaman publik (harga, checkout, kontak). */
export function SiteHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5">
      <Link href="/" className="text-xl font-extrabold tracking-tight text-ink">Sekolah<span className="text-accent">App</span></Link>
      <nav className="flex items-center gap-2 text-sm font-semibold">
        <Link href="/#harga" className="hidden px-3 py-2 text-muted hover:text-ink sm:inline">Harga</Link>
        <Link href="/kontak" className="hidden px-3 py-2 text-muted hover:text-ink sm:inline">Kontak</Link>
        {actions ?? <>
          <LinkButton href="/login" variant="ghost">Masuk</LinkButton>
          <LinkButton href="/daftar" variant="primary">Daftar gratis</LinkButton>
        </>}
      </nav>
    </header>
  );
}

/** Kaki halaman publik: identitas usaha, alamat, dan kontak. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-sheet">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-muted md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="font-extrabold text-ink">SekolahApp</div>
          <p className="mt-1">Dikelola oleh {LEGAL.company}</p>
          <p className="mt-1 text-pretty">{LEGAL.address}</p>
        </div>
        <div className="flex flex-col gap-1">
          <div className="font-bold text-ink">Kontak</div>
          <a href={waLink()} className="hover:text-ink">Telepon / WhatsApp {LEGAL.phone}</a>
          <a href={`mailto:${LEGAL.email}`} className="hover:text-ink">{LEGAL.email}</a>
        </div>
        <nav className="flex flex-col gap-1">
          <div className="font-bold text-ink">Informasi</div>
          <Link href="/#harga" className="hover:text-ink">Harga</Link>
          <Link href="/berlangganan" className="hover:text-ink">Berlangganan</Link>
          <Link href="/kontak" className="hover:text-ink">Hubungi kami</Link>
          <Link href="/mitra" className="hover:text-ink">Program Affiliator</Link>
          <Link href="/privasi" className="hover:text-ink">Kebijakan Privasi</Link>
          <Link href="/syarat" className="hover:text-ink">Syarat Layanan</Link>
          <Link href="/hapus-akun" className="hover:text-ink">Hapus akun</Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted">© {new Date().getFullYear()} {LEGAL.company}. Pembayaran diproses oleh Xendit.</div>
      </div>
    </footer>
  );
}
