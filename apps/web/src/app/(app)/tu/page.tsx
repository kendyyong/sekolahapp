import Link from "next/link";
import { requireModule } from "@/lib/session";
import { rupiah, tanggal, todayJakarta } from "@/lib/format";
import { Card, PageHeader, Stat, Table } from "@/components/ui";

const METHOD: Record<string, string> = { cash: "Tunai", transfer: "Transfer", va: "Virtual Account", qris: "QRIS", ewallet: "E-wallet", retail: "Gerai retail" };

export default async function FinanceHome() {
  const { supabase, schoolId } = await requireModule("finance", "finance");
  const today = todayJakarta();
  const monthStart = today.slice(0, 8) + "01";
  const [{ data: summary }, { data: open }, { data: recent }, { data: account }] = await Promise.all([
    supabase.rpc("finance_summary", { p_school: schoolId, p_from: monthStart, p_to: today }),
    supabase.from("invoices").select("total, paid_amount, due_on").eq("school_id", schoolId).in("status", ["unpaid", "partial"]),
    supabase.from("payments").select("id, amount, method, paid_at, receipt_number, invoices(title, students(full_name))")
      .eq("school_id", schoolId).eq("status", "paid").order("paid_at", { ascending: false }).limit(10),
    supabase.from("school_payment_accounts").select("status").eq("school_id", schoolId).maybeSingle(),
  ]);
  const collected = (summary ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
  const outstanding = (open ?? []).reduce((s, i) => s + Number(i.total) - Number(i.paid_amount), 0);
  const overdue = (open ?? []).filter((i) => i.due_on < today).reduce((s, i) => s + Number(i.total) - Number(i.paid_amount), 0);

  return (
    <>
      <PageHeader title="Ringkasan Keuangan" subtitle={`Bulan berjalan sejak ${tanggal(monthStart)}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Terkumpul bulan ini" value={rupiah(collected)} tone="good" />
        <Stat label="Belum dibayar" value={rupiah(outstanding)} hint={`${open?.length ?? 0} tagihan`} />
        <Stat label="Lewat jatuh tempo" value={rupiah(overdue)} tone={overdue ? "bad" : undefined} hint={<Link href="/tu/tunggakan" className="text-brand">Lihat tunggakan</Link>} />
        <Stat label="Pembayaran online" value={account?.status === "live" ? "Aktif" : "Belum aktif"} tone={account?.status === "live" ? "good" : "warn"}
          hint={account?.status === "live" ? "VA, QRIS, e-wallet" : "Hubungi SekolahApp untuk aktivasi"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Pembayaran terbaru">
          <Table head={["Murid", "Tagihan", "Nominal", "Metode", "Kuitansi"]} empty="Belum ada pembayaran.">
            {(recent ?? []).map((p: any) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.invoices?.students?.full_name}</td>
                <td>{p.invoices?.title}</td>
                <td className="tabular-nums">{rupiah(p.amount)}</td>
                <td>{METHOD[p.method]}</td>
                <td className="font-mono text-xs">{p.receipt_number}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Per metode bulan ini">
          <ul className="flex flex-col gap-2 text-sm">
            {(summary ?? []).length === 0 && <li className="text-muted">Belum ada transaksi.</li>}
            {(summary ?? []).map((r: any) => (
              <li key={r.method} className="flex justify-between gap-2"><span>{METHOD[r.method]} ({r.transactions})</span><b className="tabular-nums">{rupiah(r.amount)}</b></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
