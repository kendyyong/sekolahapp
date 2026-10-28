import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTIVE_ROLE_COOKIE } from "@/lib/session";
import { registerParams, type SchoolDraft } from "@/components/school-fields";

/** Daftarkan sekolah untuk pengguna yang sedang login lalu jadikan admin sekolah itu peran aktif. */
export async function registerSchool(sb: SupabaseClient, draft: SchoolDraft): Promise<string | null> {
  const { data, error } = await sb.rpc("register_school", registerParams(draft));
  if (error) return error.message;
  (await cookies()).set(ACTIVE_ROLE_COOKIE, `${data}|school_admin`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  await sb.auth.updateUser({ data: { pending_school: null } });
  return null;
}

export const WELCOME = "Sekolah terdaftar dengan paket Gratis. Mulai dengan menambah kelas dan data murid.";
