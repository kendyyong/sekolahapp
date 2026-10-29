import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { MEDIA_BUCKET } from "@/lib/cbt";
import { waktu } from "@/lib/format";
import { Badge, Flash, Input, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ReviewList, type CbtResult } from "@/components/cbt-review";

async function grade(fd: FormData) {
  "use server";
  await requireModule("cbt", "teacher");
  const v = str(fd, "points").replace(",", ".");
  await run(`/guru/ujian/jawaban/${str(fd, "attempt")}`, "Skor uraian disimpan.", (sb) => sb.rpc("cbt_grade", {
    p_attempt: str(fd, "attempt"), p_question: str(fd, "question"), p_points: v === "" ? null : Number(v),
  }));
}

export default async function AttemptAnswers({ params, searchParams }: {
  params: Promise<{ attempt: string }>; searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [{ attempt }, sp] = await Promise.all([params, searchParams]);
  const { supabase } = await requireModule("cbt", "teacher");
  const { data, error } = await supabase.rpc("cbt_result", { p_attempt: attempt });
  if (error || !data) notFound();
  const r = data as CbtResult;
  const paths = (r.review ?? []).map((q) => q.image_path).filter(Boolean) as string[];
  const { data: signed } = paths.length ? await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const images = Object.fromEntries((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <Link href={`/guru/ujian/${r.exam_id}?tab=hasil`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft aria-hidden className="size-4" />{r.title}
      </Link>
      <PageHeader title={r.student.full_name} subtitle={`${r.student.nis ? `NIS ${r.student.nis} · ` : ""}mulai ${waktu(r.started_at)}${r.submitted_at ? ` · selesai ${waktu(r.submitted_at)}` : " · masih mengerjakan"}`}
        actions={r.needs_review ? <Badge tone="warn">Uraian belum dinilai</Badge> : undefined} />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Nilai" value={r.submitted_at ? Number(r.score) : "–"} tone="good" />
        <Stat label="Terjawab" value={`${r.answered} / ${r.total}`} />
        <Stat label="Keluar layar" value={`${r.leave_count}×`} tone={r.leave_count >= 3 ? "warn" : undefined}
          hint="Berpindah aplikasi/tab saat ujian" />
      </div>
      <ReviewList review={r.review ?? []} images={images} gradeSlot={(q) => r.submitted_at && (
        <form action={grade} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input type="hidden" name="attempt" value={r.attempt_id} /><input type="hidden" name="question" value={q.id} />
          <label htmlFor={`pts-${q.id}`} className="text-sm font-medium text-ink">Skor (0–{Number(q.max)})</label>
          <Input id={`pts-${q.id}`} name="points" inputMode="decimal" className="w-24" defaultValue={q.manual ?? ""} />
          <SubmitButton variant="secondary" pendingLabel="Menyimpan…">Simpan skor</SubmitButton>
        </form>
      )} />
    </>
  );
}
