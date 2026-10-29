// Mengirim antrean notifikasi WhatsApp (tabel whatsapp_outbox) lewat gateway Fonnte.
//
// Dipanggil dengan tiga cara:
// 1. Database Webhook: tabel public.notifications, event INSERT, header x-webhook-secret: <WEBHOOK_SECRET>.
//    Mengirim pesan WA milik notifikasi itu saja.
// 2. Terjadwal (pg_cron / cron eksternal): POST {"batch": true} dengan header yang sama. Mengirim ulang
//    antrean yang tertinggal (gagal karena koneksi, webhook belum terpasang, dsb.).
// 3. Admin sekolah dari halaman Notifikasi WhatsApp: POST {"test": {"school_id", "phone"}} dengan JWT pengguna.
import { adminClient, env, HttpError, json, requireUser, serve } from "../_shared/supabase.ts";
import { composeMessage, waNumber } from "../_shared/whatsapp.ts";

// FONNTE_URL hanya untuk uji lokal dengan server tiruan.
const FONNTE_URL = Deno.env.get("FONNTE_URL") ?? "https://api.fonnte.com/send";
const MAX_ATTEMPTS = 5;

interface Claimed { id: string; school_id: string; phone: string; kind: string; title: string; body: string | null; school_name: string; api_token: string }

async function sendFonnte(token: string, target: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData();
  form.set("target", target);
  form.set("message", message);
  form.set("countryCode", "62");
  try {
    const res = await fetch(FONNTE_URL, { method: "POST", headers: { Authorization: token }, body: form });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === true) return { ok: true };
    return { ok: false, error: String(data.reason ?? data.detail ?? `HTTP ${res.status}`).slice(0, 300) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function siteLink() {
  const site = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
  return site ? `${site}/notifikasi` : null;
}

async function dispatch(notificationId: string | null) {
  const admin = adminClient();
  const { data, error } = await admin.rpc("wa_claim", { p_notification: notificationId, p_limit: 50 });
  if (error) throw error;
  const rows = (data ?? []) as Claimed[];
  let sent = 0, failed = 0;
  const link = siteLink();
  for (const r of rows) {
    const result = await sendFonnte(r.api_token, r.phone, composeMessage(r.school_name, r.title, r.body, link));
    const { data: cur } = await admin.from("whatsapp_outbox").select("attempts").eq("id", r.id).single();
    const giveUp = !result.ok && (cur?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS;
    await admin.from("whatsapp_outbox").update(result.ok
      ? { status: "sent", sent_at: new Date().toISOString(), error: null }
      : { status: giveUp ? "failed" : "queued", error: result.error }).eq("id", r.id);
    if (result.ok) sent++; else failed++;
  }
  return { sent, failed };
}

async function testSend(req: Request, test: { school_id?: string; phone?: string }) {
  const { client, user } = await requireUser(req);
  if (!test.school_id) throw new HttpError(400, "school_id wajib diisi");
  const target = waNumber(test.phone ?? "");
  if (!target) throw new HttpError(400, "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890");
  const { data: isAdmin } = await client.rpc("has_role", { p_school: test.school_id, p_roles: ["school_admin"] });
  if (!isAdmin) throw new HttpError(403, "Hanya admin sekolah yang bisa mengirim pesan uji");
  const admin = adminClient();
  const [{ data: tok }, { data: school }] = await Promise.all([
    admin.from("whatsapp_tokens").select("api_token").eq("school_id", test.school_id).maybeSingle(),
    admin.from("schools").select("name").eq("id", test.school_id).single(),
  ]);
  if (!tok) throw new HttpError(400, "Simpan token Fonnte dulu");
  const result = await sendFonnte(tok.api_token, target,
    composeMessage(school?.name ?? "Sekolah", "Pesan uji notifikasi WhatsApp",
      `Dikirim oleh ${user.email ?? "admin sekolah"}. Bila pesan ini sampai, notifikasi WhatsApp sudah siap dipakai.`, null));
  if (!result.ok) throw new HttpError(502, `Fonnte menolak: ${result.error}`);
  return json({ ok: true });
}

serve(async (req) => {
  const body = await req.json().catch(() => ({})) as {
    type?: string; table?: string; record?: { id?: string }; batch?: boolean; test?: { school_id?: string; phone?: string };
  };
  if (body.test) return testSend(req, body.test);
  if (req.headers.get("x-webhook-secret") !== env("WEBHOOK_SECRET")) throw new HttpError(401, "Tidak berwenang");
  if (body.batch) return json({ ok: true, ...(await dispatch(null)) });
  if (body.type !== "INSERT" || !body.record?.id) return json({ ok: true, ignored: body.type ?? "unknown" });
  return json({ ok: true, ...(await dispatch(body.record.id)) });
});
