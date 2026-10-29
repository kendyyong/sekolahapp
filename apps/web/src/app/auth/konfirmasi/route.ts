import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Tujuan tautan email (atur ulang sandi, konfirmasi pendaftaran).
 * Mendukung token_hash (template email kita) maupun code (alur PKCE bawaan).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next") ?? "/mulai";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/mulai";
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  const sb = await createClient();
  const { error } = tokenHash && type
    ? await sb.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await sb.auth.exchangeCodeForSession(code)
      : { error: new Error("missing token") };

  const target = url.clone();
  target.search = "";
  if (error) {
    target.pathname = "/login";
    target.searchParams.set("err", "Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.");
  } else {
    target.pathname = safeNext;
  }
  return NextResponse.redirect(target);
}
