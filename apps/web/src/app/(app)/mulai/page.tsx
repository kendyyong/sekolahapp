import { redirect } from "next/navigation";
import { getSession, ROLE_HOME } from "@/lib/session";

/** Tujuan setelah login: dasbor peran aktif, platform, yayasan, atau halaman tanpa peran. */
export default async function Start() {
  const { active, scopes, user } = await getSession();
  if (active) redirect(ROLE_HOME[active.role]);
  if (user.user_metadata?.pending_school) redirect("/sekolah-baru");
  if (scopes.platform) redirect("/platform");
  if (scopes.foundations.length) redirect("/yayasan");
  redirect("/tanpa-peran");
}
