import Link from "next/link";
import { rupiah, tanggal } from "@/lib/format";
import { requireModule } from "@/lib/session";
import { STAFF_ROLES, periodLabel } from "@/lib/payroll";
import { Empty, PageHeader, Stat, Table } from "@/components/ui";

// Slip gaji milik pegawai yang masuk; hanya penggajian yang sudah dibayar yang terlihat (RLS).
export default async function MyPayslips() {
  const { supabase, user } = await requireModule("payroll", ...STAFF_ROLES);
  const { data } = await supabase.from("payslips")
    .select("id, gross, deductions, net, payroll_runs!inner(period, paid_on, paid_method)")
    .eq("user_id", user.id).eq("payroll_runs.status", "paid").limit(120);
  const slips = ((data ?? []) as unknown as { id: string; gross: number; deductions: number; net: number;
    payroll_runs: { period: string; paid_on: string; paid_method: string } }[])
    .sort((a, b) => b.payroll_runs.period.localeCompare(a.payroll_runs.period));
  const year = slips[0]?.payroll_runs.period.slice(0, 4);
  const thisYear = slips.filter((s) => s.payroll_runs.period.startsWith(year ?? "-"));

  return (
    <>
      <PageHeader title="Slip Gaji" subtitle="Slip tampil setelah gaji bulan itu dibayar Tata Usaha. Cetak atau simpan sebagai PDF dari halaman slip." />
      {!slips.length ? <Empty>Belum ada slip gaji.</Empty> : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <Stat label={`Gaji terakhir · ${periodLabel(slips[0].payroll_runs.period)}`} value={rupiah(slips[0].net)} tone="good" />
            <Stat label={`Total diterima tahun ${year}`} value={rupiah(thisYear.reduce((n, s) => n + Number(s.net), 0))} hint={`${thisYear.length} bulan`} />
          </div>
          <Table head={["Bulan", "Pendapatan", "Potongan", "Diterima", "Dibayar", ""]}>
            {slips.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">{periodLabel(s.payroll_runs.period)}</td>
                <td className="tabular-nums">{rupiah(s.gross)}</td>
                <td className="tabular-nums">{rupiah(s.deductions)}</td>
                <td className="font-semibold tabular-nums">{rupiah(s.net)}</td>
                <td className="text-sm text-muted">{tanggal(s.payroll_runs.paid_on)} · {s.payroll_runs.paid_method === "transfer" ? "transfer" : "tunai"}</td>
                <td className="text-right"><Link href={`/gaji/slip/${s.id}`} className="text-sm font-semibold text-brand">Lihat slip</Link></td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}
