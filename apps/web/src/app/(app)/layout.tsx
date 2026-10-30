import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronsUpDown, LogOut } from "lucide-react";
import { getSession, ROLE_LABEL } from "@/lib/session";
import { AFFILIATE_NAV, NAV, PLATFORM_NAV, foundationNav, visibleNav, withGroups, type NavItem } from "@/lib/nav";
import { NavLinks } from "@/components/nav-links";
import { AppShell } from "@/components/app-shell";
import { SchoolMark } from "@/components/school-mark";
import { brandScope } from "@/lib/brand";
import { switchRole, signOut } from "./actions";

const EXTRA_TITLES: NavItem[] = [
  { href: "/profil", label: "Profil saya" },
  { href: "/notifikasi", label: "Notifikasi" },
  { href: "/paket", label: "Fitur paket" },
];

const initials = (name: string) => name.replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await getSession();
  const app = brand?.app_name ?? "SekolahApp";
  return { title: { absolute: app, template: `%s · ${app}` } };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, roles, active, supabase, user, scopes, modules, brand } = await getSession();
  const { count: unread } = await supabase.from("notifications")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
  const nav = active ? visibleNav(NAV[active.role], modules) : [];
  const platform = scopes.platform ? PLATFORM_NAV : [];
  const foundation = scopes.foundations.length ? foundationNav(scopes.foundations) : [];
  const affiliate = scopes.affiliate ? AFFILIATE_NAV : [];
  const fallback: NavItem[] = !roles.length && !scopes.platform && !scopes.foundations.length
    ? [{ href: "/sekolah-baru", label: "Daftarkan sekolah", icon: "school", group: "Mulai" },
       ...(scopes.affiliate ? [] : [{ href: "/afiliasi", label: "Jadi affiliator", icon: "handshake" as const }])] : [];
  const allNav = [...nav, ...platform, ...foundation, ...affiliate, ...fallback];
  // Sekolah yang mematikan aplikasi murid: akun murid hanya melihat pemberitahuan.
  const studentAppOff = active?.role === "student"
    && (await supabase.rpc("student_app_mode", { p_school: active.school_id })).data === "off";
  const name = profile?.full_name || user.email || "";
  const multiSchool = new Set(roles.map((x) => x.school_id)).size > 1;

  const sidebar = (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-side-line px-5 py-4 pr-12 lg:pr-5">
        {active && brand ? (
          <>
            <SchoolMark name={brand.name} logo={brand.logo_url} className="size-10" />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold leading-tight text-white">{brand.app_name ?? active.school_name}</div>
              <div className="truncate text-xs text-side-muted">{brand.app_name ? active.school_name : brand.motto ?? "SekolahApp"}</div>
            </div>
          </>
        ) : (
          <Link href="/mulai" className="text-lg font-extrabold tracking-tight text-white">Sekolah<span className="text-accent">App</span></Link>
        )}
      </div>

      {active && (
        <div className="shrink-0 px-4 pt-4">
          {roles.length > 1 ? (
            <form action={switchRole} className="relative">
              <label htmlFor="role-switch" className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-wider text-side-muted">Masuk sebagai</label>
              <div className="flex gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <select id="role-switch" name="role" defaultValue={`${active.school_id}|${active.role}`}
                    className="w-full appearance-none rounded-lg border border-side-line bg-side-raised py-2 pl-3 pr-8 text-sm font-semibold text-side-ink focus:outline-none focus:ring-2 focus:ring-brand-solid">
                    {roles.map((r) => (
                      <option key={`${r.school_id}|${r.role}`} value={`${r.school_id}|${r.role}`}>
                        {ROLE_LABEL[r.role]}{multiSchool ? ` · ${r.school_name}` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronsUpDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-side-muted" />
                </div>
                <button className="rounded-lg border border-side-line px-2.5 text-xs font-semibold text-side-ink hover:bg-side-raised">Ganti</button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-side-line bg-side-raised px-3 py-2 text-sm">
              <span className="text-side-muted">Masuk sebagai </span><span className="font-semibold">{ROLE_LABEL[active.role]}</span>
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {!!allNav.length && <NavLinks items={allNav} />}
      </div>

      <div className="shrink-0 border-t border-side-line p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <Link href="/profil" className="flex min-w-0 flex-1 items-center gap-3 rounded-md hover:opacity-90">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-side-raised text-xs font-bold text-side-ink ring-1 ring-side-line">
              {initials(name) || "?"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-side-ink">{name}</span>
              <span className="block truncate text-xs text-side-muted">{active ? ROLE_LABEL[active.role] : scopes.platform ? "Pemilik platform" : scopes.affiliate ? "Affiliator" : "Akun"}</span>
            </span>
          </Link>
          <form action={signOut}>
            <button aria-label="Keluar" title="Keluar" className="rounded-md p-2 text-side-muted hover:bg-side-raised hover:text-white">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
        {brand?.app_name && <div className="px-2 pt-1 text-[11px] text-side-muted">Didukung SekolahApp</div>}
      </div>
    </>
  );

  const topRight = (
    <div className="flex items-center gap-1">
      <Link href="/notifikasi" aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"}
        className="relative rounded-lg p-2 text-muted hover:bg-paper hover:text-ink">
        <Bell className="size-5" />
        {!!unread && (
          <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px] text-white tabular-nums ring-2 ring-sheet">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
      <Link href="/profil" aria-label="Profil saya" className="ml-1 grid size-8 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand ring-1 ring-brand/20">
        {initials(name) || "?"}
      </Link>
    </div>
  );

  return (
    <div {...brandScope(brand?.brand_color)}>
      <AppShell sidebar={sidebar} topRight={topRight} titles={[...withGroups(allNav), ...EXTRA_TITLES]}>
        {studentAppOff ? (
          <div className="mx-auto max-w-xl rounded-xl border border-line bg-sheet p-6 shadow-card">
            <h1 className="text-xl font-bold text-ink">Aplikasi murid tidak dipakai di sekolahmu</h1>
            <p className="mt-2 text-muted text-pretty">
              {active.school_name} mencatat absen lewat kartu pelajar dan guru. Tugas dikumpulkan langsung ke guru, dan info tugas
              serta nilai dikirim ke orang tuamu.
            </p>
          </div>
        ) : children}
      </AppShell>
    </div>
  );
}
