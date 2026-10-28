import Link from "next/link";
import { requireRole } from "@/lib/session";
import { rupiah, tanggal } from "@/lib/format";
import { Card, PageHeader, Stat, Table } from "@/components/ui";

interface Dashboard {
  date: string; students_active: number; staff_total: number;
  student_attendance: Record<string, number>; staff_attendance: Record<string, number>;
  pending_staff_leave: number; pending_student_leave: number; pending_groups: number;
  arrears_amount: number; arrears_students: number; collected_this_month: number; assignments_due_week: number;
}

function Bar({ parts, total }: { parts: { label: string; value: number; className: string }[]; total: number }) {
  const known = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-paper" role="img"
        aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        {parts.map((p) => p.value > 0 && <div key={p.label} className={p.className} style={{ width: `${(p.value / Math.max(total, 1)) * 100}%` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {parts.map((p) => <span key={p.label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${p.className}`} />{p.label} <b className="tabular-nums text-ink">{p.value}</b></span>)}
        <span>Belum tercatat <b className="tabular-nums text-ink">{Math.max(total - known, 0)}</b></span>
      </div>
    </div>
  );
}

export default async function PrincipalDashboard() {
  const { supabase, schoolId, active } = await requireRole("principal");
  const { data, error } = await supabase.rpc("principal_dashboard", { p_school: schoolId });
  if (error) throw error;
  const d = data as Dashboard;
  const sa = d.student_attendance, st = d.staff_attendance;

  const { data: arrears } = await supabase.from("v_student_arrears").select("student_id, full_name, class_name, outstanding, oldest_due_on")
    .eq("school_id", schoolId).order("outstanding", { ascending: false }).limit(5);

  return (
    <>
      <PageHeader title="Dasbor Kepala Sekolah" subtitle={`${active.school_name} · ${tanggal(d.date, true)}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cuti guru menunggu" value={d.pending_staff_leave} tone={d.pending_staff_leave ? "warn" : undefined}
          hint={<Link href="/kepsek/cuti" className="text-brand">Tinjau</Link>} />
        <Stat label="Izin murid menunggu" value={d.pending_student_leave} hint="Diputuskan wali kelas" />
        <Stat label="Tunggakan" value={rupiah(d.arrears_amount)} tone={d.arrears_amount ? "bad" : undefined} hint={`${d.arrears_students} murid`} />
        <Stat label="Terkumpul bulan ini" value={rupiah(d.collected_this_month)} tone="good" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Kehadiran murid hari ini · ${d.students_active} murid`}>
          <Bar total={d.students_active} parts={[
            { label: "Hadir", value: (sa.hadir ?? 0), className: "bg-good" },
            { label: "Terlambat", value: sa.terlambat ?? 0, className: "bg-warn" },
            { label: "Izin/Sakit", value: (sa.izin ?? 0) + (sa.sakit ?? 0), className: "bg-brand" },
            { label: "Alpa", value: sa.alpa ?? 0, className: "bg-bad" },
          ]} />
        </Card>
        <Card title={`Kehadiran guru & pegawai · ${d.staff_total} orang`} actions={<Link href="/kepsek/kehadiran" className="text-sm font-semibold text-brand">Detail</Link>}>
          <Bar total={d.staff_total} parts={[
            { label: "Hadir", value: st.hadir ?? 0, className: "bg-good" },
            { label: "Terlambat", value: st.terlambat ?? 0, className: "bg-warn" },
            { label: "Cuti/Izin/Dinas", value: (st.cuti ?? 0) + (st.izin ?? 0) + (st.sakit ?? 0) + (st.dinas ?? 0), className: "bg-brand" },
            { label: "Alpa", value: st.alpa ?? 0, className: "bg-bad" },
          ]} />
        </Card>
        <Card title="Tunggakan terbesar">
          <Table head={["Murid", "Kelas", "Tunggakan", "Sejak"]} empty="Tidak ada tunggakan.">
            {(arrears ?? []).map((a) => (
              <tr key={a.student_id}><td className="font-semibold">{a.full_name}</td><td>{a.class_name}</td>
                <td className="tabular-nums">{rupiah(a.outstanding)}</td><td>{tanggal(a.oldest_due_on)}</td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Pembelajaran">
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex justify-between"><span>Tugas dengan tenggat 7 hari ke depan</span><b className="tabular-nums">{d.assignments_due_week}</b></li>
            <li className="flex justify-between"><span>Kelompok kerja menunggu verifikasi guru</span><b className="tabular-nums">{d.pending_groups}</b></li>
          </ul>
        </Card>
      </div>
    </>
  );
}
