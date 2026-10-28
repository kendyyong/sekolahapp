"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ROLE_COOKIE, ROLE_HOME, type Role } from "@/lib/session";

export async function switchRole(fd: FormData) {
  const value = String(fd.get("role") ?? "");
  const [, role] = value.split("|");
  (await cookies()).set(ACTIVE_ROLE_COOKIE, value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect(ROLE_HOME[role as Role] ?? "/");
}

export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  (await cookies()).delete(ACTIVE_ROLE_COOKIE);
  redirect("/login");
}
