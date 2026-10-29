import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, ListChecks, ShieldAlert } from "lucide-react";
import { requireModule } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { MEDIA_BUCKET } from "@/lib/cbt";
import { myExams, studentExamState } from "@/lib/cbt-server";
import { waktu } from "@/lib/format";
import { Badge, Card, Field, Flash, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ReviewList, type CbtResult } from "@/components/cbt-review";
import { ExamRunner, type Paper } from "./exam-runner";

async function start(fd: FormData) {
  "use server";
  await requireModule("cbt", "student");
  const id = str(fd, "id");
  await run(`/murid/ujian/${id}`, "Selamat mengerjakan. Jawaban tersimpan otomatis.",
    (sb) => sb.rpc("cbt_start", { p_exam: id, p_token: optStr(fd, "token") }));
}

export default async function StudentExam({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase } = await requireModule("cbt", "student");
  const e = (await myExams(supabase)).find((x) => x.id === id);
  if (!e) notFound();
  const back = <Link href="/murid/ujian" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft aria-hidden className="size-4" />Ujian Online</Link>;

  const sign = async (paths: (string | null)[]) => {
    const list = paths.filter(Boolean) as string[];
    if (!list.length) return {};
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(list, e.duration_minutes * 60 + 1800);
    return Object.fromEntries((data ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  };

  if (e.attempt_id && !e.submitted_at) {
    const { data, error } = await supabase.rpc("cbt_paper", { p_attempt: e.attempt_id });
    if (error) throw error;
    const paper = data as Paper;
    if (!paper.attempt.submitted_at) {
      const images = await sign((paper.questions ?? []).map((q) => q.image_path));
      return <ExamRunner paper={paper} images={images} />;
    }
  }

  if (e.attempt_id) {
    const { data } = await supabase.rpc("cbt_result", { p_attempt: e.attempt_id });
    const r = data as CbtResult;
    const images = r.review ? await sign(r.review.map((q) => q.image_path)) : {};
    return (
      <>
        {back}
        <PageHeader title={e.title} subtitle={`${e.subject} · dikumpulkan ${waktu(r.submitted_at)}`} />
        <Flash searchParams={sp} />
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-sm text-muted">Nilai</div>
              <div className="text-4xl font-bold tabular-nums text-ink">{r.score != null ? Number(r.score) : "–"}</div>
            </div>
            <p className="max-w-md text-sm text-muted">
              {r.score != null ? `Anda menjawab ${r.answered} dari ${r.total} soal.`
                : r.needs_review ? "Jawaban uraian sedang dinilai guru. Nilai tampil di sini setelah selesai dinilai."
                : "Guru belum menampilkan nilai ujian ini."}
              {!r.review && Date.now() < Date.parse(e.ends_at) && " Pembahasan (bila dibuka guru) tampil setelah ujian ditutup."}
            </p>
          </div>
        </Card>
        {r.review && <><h2 className="mb-3 font-bold text-ink">Pembahasan</h2><ReviewList review={r.review} images={images} /></>}
      </>
    );
  }

  const s = studentExamState(e);
  return (
    <>
      {back}
      <PageHeader title={e.title} subtitle={`${e.subject} · ${e.teacher ?? "Guru"} · Kelas ${e.class}`} actions={<Badge tone={s.tone}>{s.label}</Badge>} />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Sebelum mulai">
          <ul className="flex flex-col gap-3 text-sm text-ink">
            <li className="flex gap-3"><Clock aria-hidden className="size-5 shrink-0 text-brand" />
              <span>Waktu mengerjakan <b>{e.duration_minutes} menit</b> sejak Anda menekan Mulai. Ujian dibuka {waktu(e.starts_at)} dan ditutup {waktu(e.ends_at)}; bila mulai mepet jam tutup, waktunya ikut terpotong.</span></li>
            <li className="flex gap-3"><ListChecks aria-hidden className="size-5 shrink-0 text-brand" />
              <span>{e.question_count} soal. Jawaban tersimpan otomatis; bila HP mati atau koneksi putus, buka lagi halaman ini untuk melanjutkan.</span></li>
            <li className="flex gap-3"><ShieldAlert aria-hidden className="size-5 shrink-0 text-brand" />
              <span>Jangan berpindah ke aplikasi atau tab lain. Setiap kali keluar dari halaman ujian tercatat dan dilihat guru.</span></li>
          </ul>
        </Card>
        <Card title="Mulai ujian" className="h-fit">
          {s.canStart ? (
            <form action={start} className="flex flex-col gap-3">
              <input type="hidden" name="id" value={e.id} />
              {e.has_token && (
                <Field label="Token ujian" hint="Diberikan guru pengawas di kelas">
                  <Input id="token" name="token" required autoComplete="off" autoCapitalize="characters" maxLength={10}
                    className="font-mono text-lg uppercase tracking-[0.3em]" />
                </Field>
              )}
              <SubmitButton pendingLabel="Menyiapkan soal…">Mulai mengerjakan</SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-muted">{s.label === "Belum dibuka" ? `Ujian bisa dimulai ${waktu(e.starts_at)}.` : "Waktu ujian sudah berakhir."}</p>
          )}
        </Card>
      </div>
    </>
  );
}
