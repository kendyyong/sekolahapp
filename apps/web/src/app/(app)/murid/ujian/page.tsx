import Link from "next/link";
import { requireModule } from "@/lib/session";
import { waktu } from "@/lib/format";
import { myExams, studentExamState } from "@/lib/cbt-server";
import { Badge, Card, Empty, Flash, PageHeader } from "@/components/ui";

export default async function StudentExams({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireModule("cbt", "student");
  const exams = await myExams(supabase);
  const now = Date.now();
  const active = exams.filter((e) => !e.submitted_at && now < Date.parse(e.ends_at));
  const past = exams.filter((e) => !active.includes(e));

  const list = (items: typeof exams) => (
    <ul className="flex flex-col gap-3">
      {items.map((e) => {
        const s = studentExamState(e, now);
        return (
          <li key={e.id}>
            <Link href={`/murid/ujian/${e.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-sheet p-4 shadow-card transition-colors hover:border-brand/40">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">{e.title}</div>
                <div className="text-sm text-muted">{e.subject} · {e.teacher ?? "Guru"} · {e.question_count} soal · {e.duration_minutes} menit</div>
                <div className="text-xs text-muted">{waktu(e.starts_at)} – {waktu(e.ends_at)}</div>
              </div>
              {e.score != null ? <span className="text-2xl font-bold tabular-nums text-ink">{Number(e.score)}</span> : <Badge tone={s.tone}>{s.label}</Badge>}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <PageHeader title="Ujian Online" subtitle="Kerjakan ujian dari HP atau komputer. Jawaban tersimpan otomatis setiap kali Anda memilih." />
      <Flash searchParams={sp} />
      <div className="flex flex-col gap-6">
        <Card title="Akan datang & berlangsung">{active.length ? list(active) : <Empty>Tidak ada ujian terjadwal.</Empty>}</Card>
        {past.length > 0 && <Card title="Riwayat">{list(past)}</Card>}
      </div>
    </>
  );
}
