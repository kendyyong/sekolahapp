"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  // Tautan paling spesifik yang cocok dianggap aktif.
  const active = items
    .filter((i) => path === i.href || path.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
      {items.map((i) => (
        <Link key={i.href} href={i.href}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${
            i.href === active ? "bg-brand-soft text-brand" : "text-muted hover:bg-paper hover:text-ink"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
