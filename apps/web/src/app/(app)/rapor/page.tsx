import Link from "next/link";
import { getSession } from "@/lib/session";
import { classRoster } from "@/lib/queries";
import type { ReportView } from "@/lib/report";
import { ReportCard } from "@/components/report-card";
import { Empty, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

// Tampilan & cetak rapor. Hak lihat diperiksa di database (report_card_view):
// staf yang berhak melihat murid, atau murid/orang tua setelah rapor terbit.
export default async function ReportPage({ searchParams }: { searchParams: Promise<{ semester?: string; murid?: string; kelas?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await getSession();
  if (!sp.semester || !(sp.murid || sp.kelas)) return <Empty>Pilih rapor dari menu Rapor.</Empty>;

  const ids = sp.murid ? [sp.murid] : (await classRoster(supabase, sp.kelas!)).filter((s) => s.status === "aktif").map((s) => s.id);
  const results = await Promise.all(ids.map((id) => supabase.rpc("report_card_view", { p_term: sp.semester, p_student: id })));
  const reports = results.map((r) => r.data as ReportView | null).filter((r): r is ReportView => !!r);
  const error = results.find((r) => r.error)?.error?.message;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={reports.length === 1 ? `Rapor ${reports[0].student.full_name}` : `Rapor kelas ${reports[0]?.class.name ?? ""}`}
          subtitle={reports[0] ? `Semester ${reports[0].term.semester} · ${reports[0].term.year}` : undefined}
          actions={reports.length > 0 && <PrintButton label={reports.length > 1 ? `Cetak ${reports.length} rapor` : "Cetak / simpan PDF"} />}
        />
        {reports.some((r) => r.card.status !== "final" || !r.term.published_at) && (
          <p className="mb-4 text-sm text-muted">Bertanda DRAF: rapor belum difinalkan wali kelas atau belum diterbitkan kepala sekolah.</p>
        )}
      </div>
      {!reports.length ? (
        <Empty>{error ?? "Rapor tidak ditemukan."} <Link href="/mulai" className="font-semibold text-brand">Kembali</Link></Empty>
      ) : (
        <div className="flex flex-col gap-6 print:block">
          {reports.map((r) => <ReportCard key={r.student.id} r={r} />)}
        </div>
      )}
    </>
  );
}
