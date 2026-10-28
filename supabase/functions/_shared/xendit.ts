// Klien minimal Xendit (xenPlatform): split rule + invoice.
// Dokumentasi: https://docs.xendit.co (Invoices API v2, xenPlatform Split Payments)
import { env, HttpError } from "./supabase.ts";

const BASE = "https://api.xendit.co";

async function call<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(env("XENDIT_SECRET_KEY") + ":"),
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Xendit error", path, res.status, data);
    throw new HttpError(502, `Gateway pembayaran menolak permintaan: ${data?.message ?? res.status}`);
  }
  return data as T;
}

/** Membuat split rule: `amount` dialihkan dari sub-akun sekolah ke akun platform (master). */
export function createSplitRule(opts: { reference: string; amount: number }) {
  return call<{ id: string }>("/split_rules", {
    name: `SekolahApp ${opts.reference}`,
    description: "Biaya langganan & layanan SekolahApp",
    routes: [{
      flat_amount: opts.amount,
      currency: "IDR",
      destination_account_id: env("XENDIT_PLATFORM_ACCOUNT_ID"),
      reference_id: opts.reference,
    }],
  });
}

export interface XenditInvoice {
  id: string;
  external_id: string;
  invoice_url: string;
  expiry_date: string;
  status: string;
}

/** Membuat halaman pembayaran (invoice) pada sub-akun sekolah. */
export function createInvoice(opts: {
  externalId: string;
  amount: number;
  description: string;
  payerEmail?: string;
  paymentMethods: string[];
  subAccountId: string;
  splitRuleId?: string;
  successRedirectUrl?: string;
  items: { name: string; quantity: number; price: number }[];
  fees: { type: string; value: number }[];
}) {
  const headers: Record<string, string> = { "for-user-id": opts.subAccountId };
  if (opts.splitRuleId) headers["with-split-rule"] = opts.splitRuleId;
  return call<XenditInvoice>("/v2/invoices", {
    external_id: opts.externalId,
    amount: opts.amount,
    description: opts.description,
    payer_email: opts.payerEmail,
    invoice_duration: 60 * 60 * 24,       // 24 jam
    currency: "IDR",
    payment_methods: opts.paymentMethods,
    success_redirect_url: opts.successRedirectUrl,
    items: opts.items,
    fees: opts.fees,
    locale: "id",
  }, headers);
}

/** Membandingkan token callback secara aman (waktu konstan). */
export function verifyCallbackToken(received: string | null): boolean {
  const expected = env("XENDIT_CALLBACK_TOKEN");
  if (!received || received.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}
