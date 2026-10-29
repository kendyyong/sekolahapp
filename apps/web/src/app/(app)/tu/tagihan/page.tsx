import Link from "next/link";
import { requireRole, requireModule } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal, todayJakarta, waktu } from "@/lib/format";
import { Button, Card, Field, Flash, Input, PageHeader, Select, StatusBadge, Table, Textarea } from "@/components/ui";

const METHOD: Record<string, string> = { cash: "Tunai", transfer: "Transfer", va: "Virtual Account", qris: "QRIS", ewallet: "E-wallet", retail: "Gerai retail" };

async function generate(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("finance");
  const period = str(fd, "period") + "-01";
  let created = 0;
  await run("/tu/tagihan", "Tagihan bulanan dibuat.", async (sb) => {
    const r = await sb.rpc("generate_monthly_invoices", { p_school: schoolId, p_period: period });
    created = r.data ?? 0;
    if (!r.error && created === 0) throw new Error("Tidak ada tagihan baru: semua murid aktif sudah punya tagihan bulan ini.");
    return r;
  });
}

async function createOneOff(fd: FormData) {
  "use server";
  const { schoolId, user } = await requireRole("finance");
  await run("/tu/tagihan", "Tagihan dibuat dan orang tua dapat melihatnya.", async (sb) => {
    const { data: num_, error: e1 } = await sb.rpc("next_document_number", { p_prefix: "INV" });
    if (e1) return { error: e1 };
    const { data: inv, error } = await sb.from("invoices").insert({
      school_id: schoolId, student_id: str(fd, "student_id"), number: num_, title: str(fd, "title"),
      due_on: str(fd, "due_on"), created_by: user.id,
    }).select("id").single();
    if (error) return { error };
    return sb.from("invoice_items").insert({
      invoice_id: inv.id, school_id: schoolId, fee_type_id: optStr(fd, "fee_type_id"), description: str(fd, "title"), amount: num(fd, "amount"),
    });
  });
}

async function recordPayment(fd: FormData) {
  "use server";
  const back = str(fd, "back");
  await run(back, "Pembayaran dicatat dan kuitansi dibuat.", (sb) => sb.rpc("record_manual_payment", {
    p_invoice: str(fd, "invoice_id"), p_amount: num(fd, "amount"), p_method: str(fd, "method"), p_notes: optStr(fd, "notes"),
  }));
}

async function voidInvoice(fd: FormData) {
  "use server";
  await run(str(fd, "back"), "Tagihan dibatalkan.", (sb) =>
    sb.from("invoices").update({ status: "void", void_reason: str(fd, "reason") }).eq("id", str(fd, "invoice_id")));
}

export default async function InvoicesPage({ searchParams }: {
  searchParams: Promise<{ status?: string; kelas?: string; q?: string; id?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireModule("finance", "finance");
  const [{ data: classes }, { data: students }, { data: fees }] = await Promise.all([
    supabase.from("classes").select("id, name, academic_years!inner(is_active)").eq("school_id", schoolId).eq("academic_years.is_active", true).order("name"),
    supabase.from("students").select("id, full_name, nis").eq("school_id", schoolId).eq("status", "aktif").order("full_name"),
    supabase.from("fee_types").select("id, name").eq("school_id", schoolId).eq("is_active", true).order("name"),
  ]);

  let q = supabase.from("invoices")
    .select("id, number, title, period, due_on, total, paid_amount, status, students!inner(id, full_name, nis, enrollments(class_id))")
    .eq("school_id", schoolId).order("due_on", { ascending: false }).limit(200);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.q) q = q.ilike("students.full_name", `%${sp.q}%`);
  const { data: invoices } = await q;
  const rows = ((invoices ?? []) as any[]).filter((i) => !sp.kelas || (i.students.enrollments ?? []).some((e: any) => e.class_id === sp.kelas));

  const qs = new URLSearchParams(Object.entries({ status: sp.status, kelas: sp.kelas, q: sp.q }).filter(([, v]) => v) as [string, string][]);
  const back = `/tu/tagihan?${qs.toString()}${sp.id ? `&id=${sp.id}` : ""}`;

  let detail: React.ReactNode = null;
  if (sp.id) {
    const { data: inv } = await supabase.from("invoices")
      .select("id, number, title, due_on, subtotal, discount, late_fee, total, paid_amount, status, students(full_name), invoice_items(description, amount, discount), payments(id, amount, method, status, paid_at, receipt_number, service_fee)")
      .eq("id", sp.id).single();
    if (inv) {
      const i = inv as any;
      const remaining = Number(i.total) - Number(i.paid_amount);
      detail = (
        <Card title={`${i.number} · ${i.students?.full_name}`} actions={<Link href={`/tu/tagihan?${qs.toString()}`} className="text-sm font-semibold text-brand">Tutup</Link>}>
          <table className="mb-4 w-full text-sm">
            <tbody>
              {i.invoice_items.map((it: any, k: number) => (
                <tr key={k}><td className="py-1">{it.description}</td><td className="py-1 text-right tabular-nums">{rupiah(it.amount)}{it.discount > 0 && <span className="ml-2 text-good">−{rupiah(it.discount)}</span>}</td></tr>
              ))}
              {i.late_fee > 0 && <tr><td className="py-1">Denda keterlambatan</td><td className="py-1 text-right tabular-nums">{rupiah(i.late_fee)}</td></tr>}
              <tr className="border-t border-line font-bold"><td className="py-1">Total</td><td className="py-1 text-right tabular-nums">{rupiah(i.total)}</td></tr>
              <tr><td className="py-1">Sudah dibayar</td><td className="py-1 text-right tabular-nums">{rupiah(i.paid_amount)}</td></tr>
              <tr className="font-bold"><td className="py-1">Sisa</td><td className="py-1 text-right tabular-nums">{rupiah(remaining)}</td></tr>
            </tbody>
          </table>
          {(i.payments ?? []).length > 0 && (
            <ul className="mb-4 divide-y divide-line rounded-md border border-line text-sm">
              {i.payments.map((p: any) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span>{METHOD[p.method]} · {waktu(p.paid_at)} {p.receipt_number && <code className="text-xs">{p.receipt_number}</code>}</span>
                  <span className="flex items-center gap-2"><b className="tabular-nums">{rupiah(p.amount)}</b><StatusBadge status={p.status} /></span>
                </li>
              ))}
            </ul>
          )}
          {["unpaid", "partial"].includes(i.status) && (
            <form action={recordPayment} className="flex flex-col gap-2 rounded-md bg-paper p-3">
              <div className="text-sm font-semibold">Catat pembayaran di loket</div>
              <input type="hidden" name="invoice_id" value={i.id} /><input type="hidden" name="back" value={back} />
              <div className="grid grid-cols-2 gap-2">
                <Input name="amount" type="number" min={1} max={remaining} defaultValue={remaining} aria-label="Nominal" required />
                <Select name="method" aria-label="Metode"><option value="cash">Tunai</option><option value="transfer">Transfer</option></Select>
              </div>
              <Input name="notes" placeholder="Catatan (opsional)" aria-label="Catatan" />
              <Button type="submit">Simpan pembayaran</Button>
            </form>
          )}
          {i.status === "unpaid" && Number(i.paid_amount) === 0 && (
            <form action={voidInvoice} className="mt-3 flex gap-2">
              <input type="hidden" name="invoice_id" value={i.id} /><input type="hidden" name="back" value={back} />
              <Input name="reason" placeholder="Alasan pembatalan" aria-label="Alasan pembatalan" required />
              <Button variant="secondary" type="submit">Batalkan</Button>
            </form>
          )}
        </Card>
      );
    }
  }

  const thisMonth = todayJakarta().slice(0, 7);
  return (
    <>
      <PageHeader title="Tagihan & Pembayaran" />
      <Flash searchParams={sp} />
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <Field label="Cari murid"><Input id="q" name="q" defaultValue={sp.q ?? ""} /></Field>
        <Field label="Kelas"><Select id="kelas" name="kelas" defaultValue={sp.kelas ?? ""}><option value="">Semua</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Status">
          <Select id="status" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Semua</option><option value="unpaid">Belum bayar</option><option value="partial">Sebagian</option><option value="paid">Lunas</option><option value="void">Batal</option>
          </Select>
        </Field>
        <Button variant="secondary">Tampilkan</Button>
      </form>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Table head={["No.", "Murid", "Tagihan", "Jatuh tempo", "Sisa", "Status"]} empty="Tidak ada tagihan.">
            {rows.map((i) => (
              <tr key={i.id} className={i.id === sp.id ? "bg-brand-soft/50" : ""}>
                <td><Link href={`/tu/tagihan?${qs.toString()}&id=${i.id}`} className="font-mono text-xs text-brand underline">{i.number}</Link></td>
                <td className="font-semibold">{i.students.full_name}</td>
                <td>{i.title}</td>
                <td className="whitespace-nowrap">{tanggal(i.due_on)}</td>
                <td className="tabular-nums">{rupiah(Number(i.total) - Number(i.paid_amount))}</td>
                <td><StatusBadge status={i.status} /></td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="flex flex-col gap-6">
          {detail}
          <Card title="Buat tagihan bulanan">
            <form action={generate} className="flex flex-col gap-3">
              <Field label="Bulan" hint="Membuat tagihan untuk semua murid aktif dari biaya bulanan, termasuk potongan beasiswa. Aman diulang.">
                <Input id="period" name="period" type="month" defaultValue={thisMonth} required />
              </Field>
              <Button type="submit">Buat tagihan</Button>
            </form>
          </Card>
          <Card title="Tagihan sekali bayar">
            <form action={createOneOff} className="flex flex-col gap-3">
              <Field label="Murid"><Select id="o-student" name="student_id" required>{(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
              <Field label="Jenis biaya"><Select id="o-fee" name="fee_type_id" defaultValue=""><option value="">Lainnya</option>{(fees ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
              <Field label="Keterangan"><Textarea id="o-title" name="title" rows={2} required placeholder="Study tour Yogyakarta" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nominal (Rp)"><Input id="o-amt" name="amount" type="number" min={1} required /></Field>
                <Field label="Jatuh tempo"><Input id="o-due" name="due_on" type="date" required /></Field>
              </div>
              <Button type="submit" variant="secondary">Buat tagihan</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
