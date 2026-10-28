// Callback Xendit untuk status invoice. Daftarkan URL ini di dasbor Xendit:
//   https://<project>.supabase.co/functions/v1/payments-webhook
// Fungsi ini dideploy dengan --no-verify-jwt; keamanannya dari header x-callback-token.
import { adminClient, HttpError, json, serve } from "../_shared/supabase.ts";
import { verifyCallbackToken } from "../_shared/xendit.ts";

interface InvoiceCallback {
  id: string;
  external_id: string;
  status: "PAID" | "SETTLED" | "EXPIRED" | string;
  paid_amount?: number;
  payment_method?: string;
  payment_channel?: string;
  paid_at?: string;
}

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Metode tidak didukung");
  if (!verifyCallbackToken(req.headers.get("x-callback-token"))) throw new HttpError(401, "Token callback tidak valid");

  const cb = await req.json() as InvoiceCallback;
  if (!cb.external_id) throw new HttpError(400, "external_id kosong");

  const admin = adminClient();
  const { data: payment } = await admin.from("payments")
    .select("id, status, amount, service_fee, gateway_payload").eq("gateway_ref", cb.external_id).maybeSingle();
  // Balas 200 untuk referensi yang tidak dikenal agar Xendit tidak mengulang terus.
  if (!payment) return json({ ok: true, ignored: "unknown external_id" });

  const status = cb.status === "PAID" || cb.status === "SETTLED" ? "paid" : cb.status === "EXPIRED" ? "expired" : null;
  if (!status) return json({ ok: true, ignored: cb.status });
  if (payment.status === "paid") return json({ ok: true, duplicate: true });   // idempoten

  if (status === "paid") {
    const expected = Number(payment.amount) + Number(payment.service_fee);
    if (cb.paid_amount != null && Number(cb.paid_amount) < expected) {
      console.error("Nominal dibayar kurang", cb.external_id, cb.paid_amount, expected);
      throw new HttpError(422, "Nominal pembayaran tidak sesuai");
    }
  }

  const { error } = await admin.from("payments").update({
    status,
    paid_at: status === "paid" ? (cb.paid_at ?? new Date().toISOString()) : null,
    gateway_payload: { ...(payment.gateway_payload as object), callback: cb },
  }).eq("id", payment.id).neq("status", "paid");
  if (error) throw error;

  return json({ ok: true });
});
