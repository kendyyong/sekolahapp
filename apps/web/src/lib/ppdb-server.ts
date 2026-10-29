import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PpdbPublic } from "@/lib/ppdb";

/** Data publik PPDB sebuah sekolah; null bila sekolah tidak ada atau paketnya tanpa PPDB. */
export const loadPpdb = cache(async (slug: string) => {
  const sb = await createClient();
  const { data } = await sb.rpc("ppdb_public", { p_slug: slug });
  return (data ?? null) as PpdbPublic | null;
});
