import { requireModule } from "@/lib/session";
import { rupiah, tanggal } from "@/lib/format";
import { myStudent } from "@/lib/queries";
import { Card, Empty, PageHeader, StatusBadge, Table } from "@/components/ui";

export default async function StudentFees() {
  const { supabase, user, schoolId } = await requireModule("finance", "student");
  const me = await myStudent(supabase, user.id, schoolId);
  if (!me) return <Empty>Data murid tidak ditemukan.</Empty>;
  const [{ data: invoices }, { data: fees }] = await Promise.all([
    supabase.from("invoices").select("id, number, title, due_on, total, paid_amount, status").eq("student_id", me.id).neq("status", "void").order("due_on", { ascending: false }),
    supabase.from("fee_types").select("id, name, default_amount, is_monthly").eq("school_id", schoolId).eq("is_active", true).order("name"),
  ]);
  return (
    <>
      <PageHeader title="Biaya Sekolah" subtitle="Informasi dari Tata Usaha. Pembayaran dilakukan oleh orang tua." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Table head={["Tagihan", "Jatuh tempo", "Total", "Status"]} empty="Belum ada tagihan.">
            {(invoices ?? []).map((i) => (
              <tr key={i.id}><td className="font-semibold">{i.title}</td><td>{tanggal(i.due_on)}</td><td className="tabular-nums">{rupiah(i.total)}</td><td><StatusBadge status={i.status} /></td></tr>
            ))}
          </Table>
        </div>
        <Card title="Daftar biaya" className="h-fit">
          <ul className="flex flex-col gap-2 text-sm">
            {(fees ?? []).map((f) => (
              <li key={f.id} className="flex justify-between gap-2"><span>{f.name}{f.is_monthly ? " / bulan" : ""}</span><b className="tabular-nums">{rupiah(f.default_amount)}</b></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
