"use client";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { navTitle, type NavItem } from "@/lib/nav";
import { cx } from "@/components/ui";

/**
 * Kerangka aplikasi: sidebar gelap (laci di HP), header atas yang menempel, dan area isi.
 * Isi sidebar dirender di server lalu dioper sebagai `sidebar`.
 */
export function AppShell({ sidebar, topRight, titles, children }: {
  sidebar: ReactNode; topRight: ReactNode; titles: NavItem[]; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = navTitle(titles, usePathname());

  return (
    <div className="print:block lg:grid lg:min-h-screen lg:grid-cols-[272px_minmax(0,1fr)]">
      {open && <div aria-hidden className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        id="app-sidebar"
        onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-[280px] max-w-[85vw] flex-col bg-side text-side-ink shadow-2xl transition-transform duration-200 print:hidden",
          "lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-auto lg:max-w-none lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}>
        <button type="button" onClick={() => setOpen(false)} aria-label="Tutup menu"
          className="absolute right-3 top-4 rounded-md p-1.5 text-side-muted hover:bg-side-raised hover:text-side-ink lg:hidden">
          <X className="size-5" />
        </button>
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-sheet/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-sheet/75 print:hidden lg:px-8">
          <button type="button" onClick={() => setOpen(true)} aria-label="Buka menu" aria-controls="app-sidebar" aria-expanded={open}
            className="-ml-1.5 rounded-md p-1.5 text-muted hover:bg-paper hover:text-ink lg:hidden">
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm">
            {current?.group && <span className="text-muted">{current.group}<span className="mx-1.5 text-line">/</span></span>}
            <span className="font-semibold text-ink">{current?.label}</span>
          </div>
          {topRight}
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 print:p-0 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
