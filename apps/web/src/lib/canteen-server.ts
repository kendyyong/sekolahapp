import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Stall { id: string; name: string; commission_pct: number; is_active: boolean; operator_ids: string[] }

/** Kios yang bisa dibuka pengguna: petugas hanya kiosnya sendiri, TU/admin semua kios. */
export async function myStalls(sb: SupabaseClient, schoolId: string, userId: string, all: boolean) {
  let q = sb.from("canteen_stalls").select("id, name, commission_pct, is_active, operator_ids").eq("school_id", schoolId).order("name");
  if (!all) q = q.contains("operator_ids", [userId]);
  const { data } = await q;
  return (data ?? []) as Stall[];
}
