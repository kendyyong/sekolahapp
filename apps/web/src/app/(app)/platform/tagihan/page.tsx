import { requirePlatform } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { rupiah, todayJakarta } from "@/lib/format";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, Stat, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PLAN_LABEL } from "../plans";

const BILL_TONE = { open: "warn", paid: "good", waived: "neutral" } as const;
const BILL_LABEL = { open: "Terbuka", paid: "Lunas", waived: "Dibebaskan" };

async function generate(fd: FormData) {
  "use server";
  await requirePlatform();
  const period = str(fd, "period");
  await run(`/platform/tagihan?bulan=${period}`, "Tagihan langganan dihitung ulang.", (sb) =>
    sb.rpc("generate_platform_bills", { p_period: `${period}-01` }));
}

async function setStatus(fd: FormData) {
  "use server";
  await requirePlatform();
  await run(`/platform/tagihan?bulan=${str(fd, "bulan")}`, "Status tagihan diubah.", (sb) =>
    sb.from("platform_bills").update({ status: str(fd, "status") }).eq("id", str(fd, "id")));
}

export default async function PlatformBills({ searchParams }: { searchParams: Promise<{ bulan?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatform();
  const month = sp.bulan ?? todayJakarta().slice(0, 7);
  const { data: bills } = await supabase.from("platform_bills")
    .select("id, tier, active_students, price_per_student, gross_amount, collected_by_split, amount_due, status, schools(name)")
    .eq("period", `${month}-01`).order("amount_due", { ascending: false });
  const sum = (k: "gross_amount" | "collected_by_split" | "amount_due") => (bills ?? []).reduce((n, b) => n + Number(b[k]), 0);

  return (
    <>
      <PageHeader title="Tagihan Langganan" subtitle="Biaya per murid aktif dikurangi yang sudah terpotong otomatis dari pembayaran online." />
      <Flash searchParams={sp} />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <form className="flex items-end gap-2">
          <Field label="Bulan"><Input type="month" name="bulan" defaultValue={month} /></Field>
          <Button variant="secondary">Tampilkan</Button>
        </form>
        <form action={generate}>
          <input type="hidden" name="period" value={month} />
          <SubmitButton>Hitung tagihan bulan ini</SubmitButton>
        </form>
      </div>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Nilai langganan" value={rupiah(sum("gross_amount"))} />
        <Stat label="Terpotong otomatis" value={rupiah(sum("collected_by_split"))} tone="good" />
        <Stat label="Sisa ditagih ke sekolah" value={rupiah(sum("amount_due"))} tone={sum("amount_due") ? "warn" : undefined} />
      </div>
      <Card>
        <Table head={["Sekolah", "Paket", "Murid", "Harga", "Nilai", "Terpotong", "Ditagih", "Status", ""]} empty="Belum ada tagihan untuk bulan ini. Klik “Hitung tagihan bulan ini”.">
          {(bills ?? []).map((b: any) => (
            <tr key={b.id}>
              <td className="font-semibold">{b.schools?.name}</td>
              <td>{PLAN_LABEL[b.tier]}</td>
              <td className="tabular-nums">{b.active_students}</td>
              <td className="tabular-nums">{rupiah(b.price_per_student)}</td>
              <td className="tabular-nums">{rupiah(b.gross_amount)}</td>
              <td className="tabular-nums">{rupiah(b.collected_by_split)}</td>
              <td className="tabular-nums font-bold">{rupiah(b.amount_due)}</td>
              <td><Badge tone={BILL_TONE[b.status as keyof typeof BILL_TONE]}>{BILL_LABEL[b.status as keyof typeof BILL_LABEL]}</Badge></td>
              <td>
                {b.status === "open" && (
                  <form action={setStatus} className="flex gap-1">
                    <input type="hidden" name="id" value={b.id} /><input type="hidden" name="bulan" value={month} />
                    <Button name="status" value="paid" variant="secondary" className="px-2 py-1">Lunas</Button>
                    <Button name="status" value="waived" variant="ghost" className="px-2 py-1">Bebaskan</Button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
