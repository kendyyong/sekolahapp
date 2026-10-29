import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tanggal } from "@/lib/format";
import { Card, Empty } from "@/components/ui";

/** Daftar rapor yang sudah terbit untuk murid tertentu (RLS hanya menampilkan rapor final & terbit). */
export async function ReportList({ supabase, students }: { supabase: SupabaseClient; students: { id: string; full_name: string }[] }) {
  const { data } = students.length
    ? await supabase.from("report_cards").select("student_id, term_id, terms(name, semester, published_at, academic_years(name))")
        .in("student_id", students.map((s) => s.id))
    : { data: [] };
  const rows = ((data ?? []) as any[]).sort((a, b) => (b.terms?.published_at ?? "").localeCompare(a.terms?.published_at ?? ""));
  return (
    <div className="flex flex-col gap-6">
      {students.map((s) => {
        const mine = rows.filter((r) => r.student_id === s.id);
        return (
          <Card key={s.id} title={students.length > 1 ? s.full_name : "Rapor"}>
            {!mine.length ? <Empty>Belum ada rapor yang diterbitkan sekolah.</Empty> : (
              <ul className="divide-y divide-line">
                {mine.map((r) => (
                  <li key={r.term_id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <div className="font-semibold">Semester {r.terms.semester} ({r.terms.name}) · {r.terms.academic_years?.name}</div>
                      <div className="text-xs text-muted">Terbit {tanggal(r.terms.published_at)}</div>
                    </div>
                    <Link href={`/rapor?murid=${s.id}&semester=${r.term_id}`} className="text-sm font-semibold text-brand">Lihat rapor</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
