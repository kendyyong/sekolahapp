import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(app)/actions";
import { brandScope } from "@/lib/brand";
import type { PpdbPublic } from "@/lib/ppdb";
import { SchoolMark } from "@/components/school-mark";

/** Kerangka halaman pendaftar PPDB: belum punya peran di sekolah, jadi tanpa menu dasbor. */
export function PpdbShell({ school, email, children }: { school: PpdbPublic["school"]; email: string; children: ReactNode }) {
  const scope = brandScope(school.brand_color);
  return (
    <main className={`min-h-screen bg-paper ${scope.className ?? ""}`} style={scope.style}>
      <header className="border-b border-line bg-sheet print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href={`/ppdb/${school.slug}/formulir`} className="flex min-w-0 items-center gap-2.5">
            <SchoolMark name={school.name} logo={school.logo_url} className="size-9" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">PPDB</span>
              <span className="block truncate font-bold text-ink">{school.name}</span>
            </span>
          </Link>
          <form action={signOut} className="flex items-center gap-3">
            <span className="hidden truncate text-sm text-muted sm:block">{email}</span>
            <button className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-muted hover:bg-paper hover:text-ink">
              <LogOut aria-hidden className="size-4" />Keluar
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>
    </main>
  );
}
