import Link from "next/link";
import { requireRole } from "@/lib/session";
import { run } from "@/lib/actions";
import { rupiah, tanggal } from "@/lib/format";
import { Button, Flash, PageHeader, Stat, Table } from "@/components/ui";

async function applyLateFees() {
  "use server";
  const { schoolId } = await requireRole("finance");
  await run("/tu/tunggakan", "Denda keterlambatan diterapkan pada tagihan yang lewat jatuh tempo.", (sb) =>
    sb.rpc("apply_late_fees", { p_school: schoolId }));
}

export default async function Arrears({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireRole("finance", "principal");
  const { data } = await supabase.from("v_student_arrears").select("student_id, full_name, nis, class_name, open_invoices, outstanding, oldest_due_on")
    .eq("school_id", schoolId).order("outstanding", { ascending: false });
  const total = (data ?? []).reduce((s, r) => s + Number(r.outstanding), 0);

  return (
    <>
      <PageHeader title="Tunggakan" subtitle="Tagihan yang lewat jatuh tempo dan belum lunas." actions={
        <form action={applyLateFees}><Button variant="secondary">Terapkan denda</Button></form>
      } />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Total tunggakan" value={rupiah(total)} tone={total ? "bad" : undefined} />
        <Stat label="Jumlah murid" value={data?.length ?? 0} />
      </div>
      <Table head={["Murid", "NIS", "Kelas", "Tagihan", "Tunggakan", "Sejak"]} empty="Tidak ada tunggakan.">
        {(data ?? []).map((r) => (
          <tr key={r.student_id}>
            <td><Link href={`/tu/tagihan?q=${encodeURIComponent(r.full_name)}`} className="font-semibold text-brand">{r.full_name}</Link></td>
            <td className="tabular-nums">{r.nis}</td>
            <td>{r.class_name}</td>
            <td className="tabular-nums">{r.open_invoices}</td>
            <td className="tabular-nums font-semibold">{rupiah(r.outstanding)}</td>
            <td>{tanggal(r.oldest_due_on)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
