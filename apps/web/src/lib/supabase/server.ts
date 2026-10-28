import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Saat pengembangan, catat setiap kueri yang ditolak PostgREST agar kesalahan tidak lolos diam-diam.
const devFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!res.ok && String(input).includes("/rest/v1/")) {
    const body = await res.clone().text();
    console.error(`[supabase] ${res.status} ${init?.method ?? "GET"} ${decodeURIComponent(String(input)).replace(/^.*\/rest\/v1/, "")}\n  ${body}`);
  }
  return res;
};

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(process.env.NODE_ENV === "development" ? { global: { fetch: devFetch } } : {}),
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Dipanggil dari Server Component: penyegaran sesi ditangani proxy.
          }
        },
      },
    },
  );
}
