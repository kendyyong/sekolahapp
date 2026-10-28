import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "school_admin" | "principal" | "teacher" | "counselor" | "finance" | "student" | "guardian";

export const ROLE_LABEL: Record<Role, string> = {
  school_admin: "Admin Sekolah",
  principal: "Kepala Sekolah",
  teacher: "Guru",
  counselor: "Guru BK",
  finance: "Tata Usaha",
  student: "Murid",
  guardian: "Orang Tua",
};

export const ROLE_HOME: Record<Role, string> = {
  school_admin: "/admin",
  principal: "/kepsek",
  teacher: "/guru",
  counselor: "/bk",
  finance: "/tu",
  student: "/murid",
  guardian: "/ortu",
};

export interface RoleOption { school_id: string; school_name: string; role: Role }

export const ACTIVE_ROLE_COOKIE = "sa_active";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone, avatar_url").eq("id", user.id).single(),
    supabase.rpc("my_roles"),
  ]);
  const options = (roles ?? []) as RoleOption[];

  const raw = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value;
  const [sid, r] = raw?.split("|") ?? [];
  const active = options.find((o) => o.school_id === sid && o.role === r) ?? options[0] ?? null;

  return { supabase, user, profile, roles: options, active };
});

/** Halaman yang hanya boleh dibuka peran tertentu. Mengembalikan sesi dengan peran aktif. */
export async function requireRole(...allowed: Role[]) {
  const s = await getSession();
  if (!s.active) redirect("/tanpa-peran");
  if (!allowed.includes(s.active.role)) redirect(ROLE_HOME[s.active.role]);
  return { ...s, active: s.active, schoolId: s.active.school_id };
}
