import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: { message: string } | null } | void;

/**
 * Menjalankan aksi server lalu kembali ke `path` dengan pesan sukses/gagal
 * (?ok=… atau ?err=…) yang ditampilkan komponen <Flash>.
 */
export async function run(path: string, okMessage: string, fn: (sb: SupabaseClient) => PromiseLike<Result>) {
  const sb = await createClient();
  let error: string | null = null;
  try {
    const r = await fn(sb);
    if (r && r.error) error = r.error.message;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  revalidatePath(path.split("?")[0]);
  const url = new URL(path, "http://x");
  url.searchParams.delete("ok");
  url.searchParams.delete("err");
  url.searchParams.set(error ? "err" : "ok", error ?? okMessage);
  redirect(url.pathname + url.search);
}

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function num(fd: FormData, key: string): number {
  const v = Number(str(fd, key).replace(/[.\s]/g, "").replace(",", "."));
  if (!Number.isFinite(v)) throw new Error(`Angka tidak valid pada isian ${key}`);
  return v;
}

/** Mengunggah berkas form ke Supabase Storage, mengembalikan path atau null. */
export async function uploadFile(sb: SupabaseClient, bucket: string, folder: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran berkas maksimal 5 MB");
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${folder}/${Date.now()}-${safe}`;
  const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Gagal mengunggah berkas: ${error.message}`);
  return path;
}

/** Memanggil Edge Function; melempar Error berisi pesan dari fungsi (bukan "non-2xx status code"). */
export async function invokeFunction<T = Record<string, unknown>>(sb: SupabaseClient, name: string, body: unknown): Promise<T> {
  const { data, error } = await sb.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const res = ctx ? await ctx.json().catch(() => null) : null;
    if (ctx?.status === 503 || res?.code === "BOOT_ERROR") throw new Error("Layanan sedang tidak tersedia. Coba beberapa saat lagi.");
    throw new Error(res?.error ?? res?.message ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
