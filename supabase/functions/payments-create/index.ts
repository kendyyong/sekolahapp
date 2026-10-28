// Orang tua memulai pembayaran online sebuah tagihan.
//
// POST /functions/v1/payments-create
// { "invoice_id": "...", "method": "va" | "qris" | "ewallet" | "retail", "return_url": "https://..." }
// → { payment_id, checkout_url, charge_amount, service_fee }
import { adminClient, HttpError, json, requireUser, serve } from "../_shared/supabase.ts";
import { computeFees, type OnlineMethod, XENDIT_METHODS } from "../_shared/fees.ts";
import { createInvoice, createSplitRule } from "../_shared/xendit.ts";

serve(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Metode tidak didukung");
  const { invoice_id, method, return_url } = await req.json() as {
    invoice_id: string; method: OnlineMethod; return_url?: string;
  };
  if (!invoice_id || !(method in XENDIT_METHODS)) throw new HttpError(400, "Tagihan dan metode pembayaran wajib diisi");

  const { client, user } = await requireUser(req);

  // RLS memastikan pemanggil memang boleh melihat tagihan ini (orang tua / murid / TU).
  const { data: inv, error } = await client.from("invoices")
    .select("id, school_id, student_id, number, title, total, paid_amount, status, students(full_name)")
    .eq("id", invoice_id).maybeSingle();
  if (error) throw error;
  if (!inv) throw new HttpError(404, "Tagihan tidak ditemukan");
  if (inv.status === "paid" || inv.status === "void") throw new HttpError(409, "Tagihan sudah lunas atau dibatalkan");
  const outstanding = Number(inv.total) - Number(inv.paid_amount);
  if (outstanding <= 0) throw new HttpError(409, "Tidak ada sisa tagihan");

  const admin = adminClient();

  // Pakai lagi tautan pembayaran yang masih aktif agar tidak dobel.
  const { data: pending } = await admin.from("payments")
    .select("id, checkout_url, amount, service_fee, method, expires_at")
    .eq("invoice_id", inv.id).eq("status", "pending").eq("method", method)
    .gt("expires_at", new Date(Date.now() + 10 * 60_000).toISOString())
    .maybeSingle();
  if (pending?.checkout_url && Number(pending.amount) === outstanding) {
    return json({
      payment_id: pending.id, checkout_url: pending.checkout_url,
      charge_amount: Number(pending.amount) + Number(pending.service_fee), service_fee: Number(pending.service_fee),
    });
  }

  const { data: account } = await admin.from("school_payment_accounts")
    .select("sub_account_id, status, service_fee_bearer").eq("school_id", inv.school_id).maybeSingle();
  if (!account || account.status !== "live") {
    throw new HttpError(409, "Sekolah belum mengaktifkan pembayaran online. Silakan bayar di loket Tata Usaha.");
  }

  const { data: school } = await admin.from("schools").select("plan, settings, plans(price_per_student)")
    .eq("id", inv.school_id).single();
  const custom = Number((school?.settings as Record<string, unknown>)?.custom_price_per_student ?? NaN);
  // deno-lint-ignore no-explicit-any
  const pricePerStudent = Number.isFinite(custom) ? custom : Number((school as any)?.plans?.price_per_student ?? 0);

  const { data: collected } = await admin.rpc("platform_fee_collected", {
    p_student: inv.student_id, p_month: new Date().toISOString().slice(0, 10),
  });

  const fees = computeFees({
    invoiceAmount: outstanding,
    method,
    feeBearer: account.service_fee_bearer,
    pricePerStudent,
    platformFeeAlreadyCollected: Boolean(collected),
  });

  const externalId = `SA-${inv.number.replaceAll("/", "")}-${Date.now()}`;
  const split = fees.routeToPlatform > 0
    ? await createSplitRule({ reference: externalId, amount: fees.routeToPlatform })
    : null;

  // deno-lint-ignore no-explicit-any
  const studentName = (inv as any).students?.full_name ?? "";
  const xi = await createInvoice({
    externalId,
    amount: fees.chargeAmount,
    description: `${inv.title} · ${studentName} · ${inv.number}`,
    payerEmail: user.email ?? undefined,
    paymentMethods: XENDIT_METHODS[method],
    subAccountId: account.sub_account_id,
    splitRuleId: split?.id,
    successRedirectUrl: return_url,
    items: [{ name: inv.title, quantity: 1, price: outstanding }],
    fees: fees.serviceFee > 0 ? [{ type: "Biaya layanan", value: fees.serviceFee }] : [],
  });

  const { data: payment, error: pErr } = await admin.from("payments").insert({
    school_id: inv.school_id,
    invoice_id: inv.id,
    amount: outstanding,
    service_fee: fees.serviceFee,
    platform_fee: fees.platformFee,
    method,
    status: "pending",
    gateway: "xendit",
    gateway_ref: externalId,
    checkout_url: xi.invoice_url,
    expires_at: xi.expiry_date,
    gateway_payload: { invoice_id: xi.id, split_rule_id: split?.id ?? null, fees },
    initiated_by: user.id,
  }).select("id").single();
  if (pErr) throw pErr;

  return json({
    payment_id: payment.id,
    checkout_url: xi.invoice_url,
    charge_amount: fees.chargeAmount,
    service_fee: fees.serviceFee,
  });
});
