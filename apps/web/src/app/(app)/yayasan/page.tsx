import { requireFoundation } from "@/lib/session";
import { rupiah, tanggal, todayJakarta } from "@/lib/format";
import { Badge, Card, PageHeader, Stat, Table } from "@/components/ui";
import { PLAN_LABEL, PLAN_TONE } from "../platform/plans";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

export default async function FoundationHome({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const sp = await searchParams;
  const { supabase, foundation } = await requireFoundation(sp.f);
  const { data } = await supabase.rpc("foundation_overview", { p_foundation: foundation.id });
  const rows = (data ?? []) as any[];
  const total = (k: string) => rows.reduce((n, r) => n + Number(r[k] ?? 0), 0);

  return (
    <>
      <PageHeader title={foundation.name} subtitle={`${rows.length} sekolah · ${tanggal(todayJakarta(), true)}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Murid aktif" value={total("students").toLocaleString("id-ID")} />
        <Stat label="Hadir hari ini" value={pct(total("present_today"), total("recorded_today"))} hint={`${total("present_today")} dari ${total("recorded_today")} tercatat`} />
        <Stat label="Guru & staf hadir" value={`${total("staff_present_today")}/${total("staff")}`} />
        <Stat label="Tunggakan" value={rupiah(total("arrears"))} tone={total("arrears") ? "bad" : "good"} hint={`Terkumpul bulan ini ${rupiah(total("collected_month"))}`} />
      </div>
      <Card title="Per sekolah">
        <Table head={["Sekolah", "Paket", "Murid", "Hadir hari ini", "Staf hadir", "Cuti menunggu", "Terkumpul bulan ini", "Tunggakan"]} empty="Belum ada sekolah dalam yayasan ini.">
          {rows.map((r) => (
            <tr key={r.school_id}>
              <td className="font-semibold">{r.name}<div className="text-xs font-normal text-muted">{r.level}</div></td>
              <td><Badge tone={PLAN_TONE[r.plan as keyof typeof PLAN_TONE]}>{PLAN_LABEL[r.plan]}</Badge></td>
              <td className="tabular-nums">{r.students}</td>
              <td className="tabular-nums">{pct(r.present_today, r.recorded_today)}<span className="ml-1 text-xs text-muted">({r.recorded_today} tercatat)</span></td>
              <td className="tabular-nums">{r.staff_present_today}/{r.staff}</td>
              <td className="tabular-nums">{r.pending_staff_leave || "–"}</td>
              <td className="tabular-nums">{rupiah(r.collected_month)}</td>
              <td className={`tabular-nums ${Number(r.arrears) ? "font-bold text-bad" : ""}`}>{rupiah(r.arrears)}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="mt-4 text-xs text-muted">Data kehadiran dan keuangan dihitung langsung dari tiap sekolah. Untuk detail, minta akses kepala sekolah atau admin di sekolah terkait.</p>
    </>
  );
}
