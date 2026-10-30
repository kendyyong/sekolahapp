import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/session";
import { NAV, visibleNav } from "@/lib/nav";

/** Tujuan setelah login: dasbor peran aktif, platform, yayasan, atau halaman tanpa peran. */
export default async function Start() {
  const { active, scopes, user, modules } = await getSession();
  // Beranda peran bisa terkunci paket (mis. dasbor kepsek di paket Dasar): pakai menu pertama yang tersedia.
  if (active) redirect(visibleNav(NAV[active.role], modules)[0]?.href ?? ROLE_HOME[active.role]);
  if (user.user_metadata?.pending_school) redirect("/sekolah-baru");
  // Orang tua yang mendaftar lewat halaman PPDB kembali ke formulirnya.
  const ppdb = user.user_metadata?.ppdb_slug;
  if (typeof ppdb === "string" && /^[a-z0-9-]{3,60}$/.test(ppdb)) redirect(`/ppdb/${ppdb}/formulir`);
  if (scopes.platform) redirect("/platform");
  if (scopes.foundations.length) redirect("/yayasan");
  if (scopes.affiliate || user.user_metadata?.pending_affiliate) redirect("/afiliasi");
  redirect("/tanpa-peran");
}
