// Mengirim notifikasi push (FCM HTTP v1) setiap ada baris baru di tabel notifications.
// Pasang Database Webhook di Supabase: tabel public.notifications, event INSERT,
// tujuan fungsi ini, header x-webhook-secret: <WEBHOOK_SECRET>.
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";
import { adminClient, env, HttpError, json, serve } from "../_shared/supabase.ts";

interface ServiceAccount { project_id: string; client_email: string; private_key: string }

let cachedToken: { value: string; exp: number } | null = null;

async function googleAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email).setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt().setExpirationTime("1h").sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Gagal mendapat token Google: " + JSON.stringify(data));
  cachedToken = { value: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET")) throw new HttpError(401, "Tidak berwenang");
  const payload = await req.json() as { type: string; record: Record<string, string> };
  if (payload.type !== "INSERT") return json({ ok: true, ignored: payload.type });
  const n = payload.record;

  const admin = adminClient();
  const { data: tokens } = await admin.from("device_tokens").select("token").eq("user_id", n.user_id);
  if (!tokens?.length) return json({ ok: true, sent: 0 });

  const sa = JSON.parse(env("FCM_SERVICE_ACCOUNT")) as ServiceAccount;
  const accessToken = await googleAccessToken(sa);
  let sent = 0;
  const stale: string[] = [];
  for (const { token } of tokens) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: n.title, body: n.body ?? "" },
          data: { kind: n.kind, ref_table: n.ref_table ?? "", ref_id: n.ref_id ?? "", notification_id: n.id },
          android: { priority: "high" },
        },
      }),
    });
    if (res.ok) sent++;
    else if (res.status === 404 || res.status === 400) stale.push(token);   // token kedaluwarsa
  }
  if (stale.length) await admin.from("device_tokens").delete().in("token", stale);
  return json({ ok: true, sent, removed: stale.length });
});
