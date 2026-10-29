"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navTitle, type NavItem } from "@/lib/nav";
import { ICONS } from "@/components/icons";

/** Menu sidebar berkelompok dengan ikon; tautan paling spesifik yang cocok dianggap aktif. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const active = navTitle(items, usePathname())?.href;
  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {items.map((i, n) => {
        const Icon = i.icon ? ICONS[i.icon] : null;
        const on = i.href === active;
        return (
          <div key={i.href}>
            {i.group && (
              <div className={`px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-side-muted ${n ? "pt-5" : "pt-2"}`}>{i.group}</div>
            )}
            <Link href={i.href} aria-current={on ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                on ? "bg-brand-solid text-white shadow-sm" : "text-side-ink/80 hover:bg-side-raised hover:text-side-ink"}`}>
              {Icon && <Icon aria-hidden className={`size-[18px] shrink-0 ${on ? "text-white" : "text-side-muted group-hover:text-side-ink"}`} />}
              <span className="truncate">{i.label}</span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
