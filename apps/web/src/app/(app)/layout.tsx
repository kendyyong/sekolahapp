import Link from "next/link";
import { getSession, ROLE_LABEL } from "@/lib/session";
import { NAV, PLATFORM_NAV, foundationNav, visibleNav } from "@/lib/nav";
import { NavLinks } from "@/components/nav-links";
import { switchRole, signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, roles, active, supabase, user, scopes, modules } = await getSession();
  const { count: unread } = await supabase.from("notifications")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
  const nav = active ? visibleNav(NAV[active.role], modules) : [];
  // Sekolah yang mematikan aplikasi murid: akun murid hanya melihat pemberitahuan.
  const studentAppOff = active?.role === "student"
    && (await supabase.rpc("student_app_mode", { p_school: active.school_id })).data === "off";

  return (
    <div className="print:block lg:grid lg:min-h-screen lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-sheet print:hidden lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5">
          <Link href="/mulai" className="text-lg font-extrabold tracking-tight text-ink">
            Sekolah<span className="text-accent">App</span>
          </Link>
          <Link href="/notifikasi" className="relative rounded-md px-2 py-1 text-sm font-semibold text-muted hover:bg-paper" aria-label="Notifikasi">
            Notifikasi
            {!!unread && (
              <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums">{unread}</span>
            )}
          </Link>
        </div>

        {active && (
          <div className="px-4 pb-3 lg:px-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{active.school_name}</div>
            {roles.length > 1 ? (
              <form action={switchRole} className="mt-1 flex gap-2">
                <select name="role" defaultValue={`${active.school_id}|${active.role}`} aria-label="Ganti peran"
                  className="min-w-0 flex-1 rounded-md border border-line bg-sheet px-2 py-1.5 text-sm font-semibold text-ink">
                  {roles.map((r) => (
                    <option key={`${r.school_id}|${r.role}`} value={`${r.school_id}|${r.role}`}>
                      {ROLE_LABEL[r.role]}{new Set(roles.map((x) => x.school_id)).size > 1 ? ` · ${r.school_name}` : ""}
                    </option>
                  ))}
                </select>
                <button className="rounded-md border border-line px-2 text-sm font-semibold text-brand hover:bg-brand-soft">Ganti</button>
              </form>
            ) : (
              <div className="mt-1 text-sm font-bold text-ink">{ROLE_LABEL[active.role]}</div>
            )}
          </div>
        )}

        {!!nav.length && <NavLinks items={nav} />}
        {scopes.platform && (
          <div className="border-t border-line pt-3">
            <div className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted lg:px-5">Pemilik Platform</div>
            <NavLinks items={PLATFORM_NAV} />
          </div>
        )}
        {!!scopes.foundations.length && (
          <div className="border-t border-line pt-3">
            <div className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted lg:px-5">Yayasan</div>
            <NavLinks items={foundationNav(scopes.foundations)} />
          </div>
        )}
        {!roles.length && !scopes.platform && !scopes.foundations.length && (
          <NavLinks items={[{ href: "/sekolah-baru", label: "Daftarkan sekolah" }]} />
        )}

        <div className="border-t border-line px-4 py-4 text-sm lg:px-5">
          <Link href="/profil" className="block truncate font-semibold text-ink hover:text-brand">{profile?.full_name || user.email}</Link>
          <form action={signOut}><button className="mt-1 text-muted hover:text-accent">Keluar</button></form>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 print:p-0 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          {studentAppOff ? (
            <div className="mx-auto max-w-xl rounded-lg border border-line bg-sheet p-6">
              <h1 className="text-xl font-extrabold text-ink">Aplikasi murid tidak dipakai di sekolahmu</h1>
              <p className="mt-2 text-muted text-pretty">
                {active.school_name} mencatat absen lewat kartu pelajar dan guru. Tugas dikumpulkan langsung ke guru, dan info tugas
                serta nilai dikirim ke orang tuamu.
              </p>
            </div>
          ) : children}
        </div>
      </main>
    </div>
  );
}
