import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireRole, requireModule } from "@/lib/session";
import { invokeFunction, str } from "@/lib/actions";
import { rupiah, tanggal, waktu } from "@/lib/format";
import { myChildren } from "@/lib/queries";
import { Card, Empty, Field, Flash, PageHeader, Select, StatusBadge, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ChildTabs, pickChild } from "../child-tabs";

const METHOD_LABEL: Record<string, string> = {
  va: "Virtual Account bank", qris: "QRIS", ewallet: "E-wallet (OVO, DANA, ShopeePay)", retail: "Gerai (Alfamart/Indomaret)",
  cash: "Tunai di TU", transfer: "Transfer bank",
};

async function payOnline(fd: FormData) {
  "use server";
  const { supabase } = await requireRole("guardian");
  const invoiceId = str(fd, "invoice_id");
  const back = `/ortu/tagihan?anak=${str(fd, "student_id")}&id=${invoiceId}`;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  let target: string;
  try {
    const data = await invokeFunction<{ checkout_url?: string }>(supabase, "payments-create", {
      invoice_id: invoiceId, method: str(fd, "method"),
      return_url: `${origin}${back}&ok=${encodeURIComponent("Terima kasih, pembayaran sedang dikonfirmasi.")}`,
    });
    if (!data.checkout_url) throw new Error("Gagal membuat tautan pembayaran");
    target = data.checkout_url;
  } catch (e) {
    target = `${back}&err=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`;
  }
  redirect(target);
}

export default async function GuardianInvoices({ searchParams }: { searchParams: Promise<{ anak?: string; id?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireModule("finance", "guardian");
  const children = await myChildren(supabase, user.id, schoolId);
  const child = pickChild(children, sp.anak);
  if (!child) return (<><PageHeader title="Tagihan" /><Empty>Akun Anda belum ditautkan ke data murid.</Empty></>);

  const { data: invoices } = await supabase.from("invoices").select("id, number, title, period, due_on, total, paid_amount, status")
    .eq("student_id", child.id).neq("status", "void").order("due_on", { ascending: false }).limit(60);
  const sel = (invoices ?? []).find((i) => i.id === sp.id) ?? (invoices ?? []).find((i) => i.status !== "paid");
  const [{ data: items }, { data: pays }, { data: online }] = sel ? await Promise.all([
    supabase.from("invoice_items").select("id, description, amount, discount").eq("invoice_id", sel.id),
    supabase.from("payments").select("id, amount, service_fee, method, status, receipt_number, paid_at, created_at, checkout_url, expires_at")
      .eq("invoice_id", sel.id).order("created_at", { ascending: false }),
    supabase.rpc("online_payment_enabled", { p_school: schoolId }),
  ]) : [{ data: [] }, { data: [] }, { data: false }];
  const owed = (invoices ?? []).filter((i) => i.status !== "paid").reduce((n, i) => n + Number(i.total) - Number(i.paid_amount), 0);
  const base = `/ortu/tagihan?anak=${child.id}`;

  return (
    <>
      <PageHeader title="Tagihan Sekolah" subtitle={`${child.full_name} · sisa tagihan ${rupiah(owed)}`} />
      <ChildTabs items={children} active={child.id} base="/ortu/tagihan" />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Table head={["Tagihan", "Jatuh tempo", "Total", "Sisa", "Status"]} empty="Belum ada tagihan.">
            {(invoices ?? []).map((i) => (
              <tr key={i.id} className={i.id === sel?.id ? "bg-brand-soft/50" : ""}>
                <td><Link href={`${base}&id=${i.id}`} className="font-semibold text-brand">{i.title}</Link><div className="text-xs text-muted">{i.number}</div></td>
                <td className="whitespace-nowrap">{tanggal(i.due_on)}</td>
                <td className="tabular-nums">{rupiah(i.total)}</td>
                <td className="tabular-nums">{rupiah(Number(i.total) - Number(i.paid_amount))}</td>
                <td><StatusBadge status={i.status} /></td>
              </tr>
            ))}
          </Table>
        </div>
        {sel ? (
          <Card title={sel.title} className="h-fit">
            <div className="mb-3 text-xs text-muted">{sel.number} · jatuh tempo {tanggal(sel.due_on)}</div>
            <ul className="mb-3 flex flex-col gap-1.5 text-sm">
              {(items ?? []).map((it) => (
                <li key={it.id} className="flex justify-between gap-2">
                  <span>{it.description}{Number(it.discount) > 0 && <span className="text-xs text-good"> (potongan {rupiah(it.discount)})</span>}</span>
                  <span className="tabular-nums">{rupiah(Number(it.amount) - Number(it.discount))}</span>
                </li>
              ))}
              <li className="flex justify-between gap-2 border-t border-line pt-1.5 font-bold"><span>Sisa dibayar</span><span className="tabular-nums">{rupiah(Number(sel.total) - Number(sel.paid_amount))}</span></li>
            </ul>
            {sel.status !== "paid" && !online && (
              <p className="border-t border-line pt-3 text-sm text-muted">Silakan bayar tunai atau transfer melalui loket Tata Usaha sekolah. Pembayaran online akan tersedia setelah sekolah mengaktifkannya.</p>
            )}
            {sel.status !== "paid" && online && (
              <form action={payOnline} className="flex flex-col gap-3 border-t border-line pt-3">
                <input type="hidden" name="invoice_id" value={sel.id} /><input type="hidden" name="student_id" value={child.id} />
                <Field label="Bayar online lewat" hint="Biaya layanan (bila ada) ditampilkan sebelum Anda membayar.">
                  <Select id="method" name="method" defaultValue="qris">
                    {["qris", "va", "ewallet", "retail"].map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                  </Select>
                </Field>
                <SubmitButton>Bayar sekarang</SubmitButton>
                <p className="text-xs text-muted">Bisa juga membayar tunai di loket Tata Usaha.</p>
              </form>
            )}
            {!!pays?.length && (
              <div className="mt-4 border-t border-line pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Riwayat pembayaran</div>
                <ul className="flex flex-col gap-2 text-sm">
                  {pays.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-2">
                      <div><div>{METHOD_LABEL[p.method] ?? p.method} · {rupiah(p.amount)}</div>
                        <div className="text-xs text-muted">{p.receipt_number ? `Kuitansi ${p.receipt_number} · ${waktu(p.paid_at)}` : waktu(p.created_at)}</div></div>
                      <div className="flex flex-col items-end gap-1"><StatusBadge status={p.status} />
                        {p.status === "pending" && p.checkout_url && p.expires_at && new Date(p.expires_at) > new Date() &&
                          <a href={p.checkout_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand">Lanjutkan</a>}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ) : <Empty>Tidak ada tagihan yang perlu dibayar.</Empty>}
      </div>
    </>
  );
}
