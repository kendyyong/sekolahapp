import Link from "next/link";
import { requireModule } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { examPhase, type Exam } from "@/lib/cbt";
import { waktu } from "@/lib/format";
import { myTeaching } from "@/lib/queries";
import { Badge, Button, Card, Empty, Field, Flash, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ExamFields, examFromForm } from "./exam-form";

async function createExam(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("cbt", "teacher");
  const ta = str(fd, "teaching_assignment_id");
  let id = "";
  await run(`/guru/ujian?mapel=${ta}`, "Ujian dibuat. Sekarang tambahkan soalnya.", async (sb) => {
    const { data, error } = await sb.from("exams")
      .insert({ school_id: schoolId, teaching_assignment_id: ta, ...examFromForm(fd) }).select("id").single();
    if (error) return { error };
    id = data.id;
  }, () => `/guru/ujian/${id}`);
}

type Row = Exam & { exam_questions: { count: number }[]; exam_attempts: { submitted_at: string | null }[] };

export default async function TeacherExams({ searchParams }: { searchParams: Promise<{ mapel?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireModule("cbt", "teacher");
  const teaching = await myTeaching(supabase, user.id);
  if (!teaching.length) return (<><PageHeader title="Ujian Online" /><Empty>Belum ada mapel yang ditugaskan kepada Anda.</Empty></>);
  const ta = teaching.find((t) => t.id === sp.mapel) ?? teaching[0];
  const { data } = await supabase.from("exams")
    .select("*, exam_questions(count), exam_attempts(submitted_at)")
    .eq("teaching_assignment_id", ta.id).order("starts_at", { ascending: false });
  const exams = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader title="Ujian Online" subtitle={`${ta.subjects.name} · Kelas ${ta.classes.name}. Murid mengerjakan di HP atau komputer dengan batas waktu, dan nilainya langsung dihitung.`} />
      <Flash searchParams={sp} />
      <form className="mb-5 flex items-end gap-2">
        <Field label="Mapel & kelas">
          <Select id="mapel" name="mapel" defaultValue={ta.id}>
            {teaching.map((t) => <option key={t.id} value={t.id}>{t.subjects.name} · {t.classes.name}</option>)}
          </Select>
        </Field>
        <Button variant="secondary">Tampilkan</Button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Table head={["Ujian", "Jadwal", "Soal", "Dikerjakan", "Status"]} empty="Belum ada ujian untuk kelas ini.">
            {exams.map((e) => {
              const phase = examPhase(e);
              const done = e.exam_attempts.filter((a) => a.submitted_at).length;
              const running = e.exam_attempts.length - done;
              return (
                <tr key={e.id}>
                  <td>
                    <Link href={`/guru/ujian/${e.id}`} className="font-semibold text-brand">{e.title}</Link>
                    <div className="text-xs text-muted">{e.duration_minutes} menit{e.token ? " · pakai token" : ""}</div>
                  </td>
                  <td className="whitespace-nowrap text-sm">{waktu(e.starts_at)}<div className="text-xs text-muted">s.d. {waktu(e.ends_at)}</div></td>
                  <td className="tabular-nums">{e.exam_questions[0]?.count ?? 0}</td>
                  <td className="tabular-nums">{done}{running > 0 && <span className="text-xs text-muted"> +{running} sedang</span>}</td>
                  <td><Badge tone={phase.tone}>{phase.label}</Badge></td>
                </tr>
              );
            })}
          </Table>
        </div>
        <Card title="Buat ujian baru" className="h-fit">
          <form action={createExam} className="flex flex-col gap-4">
            <input type="hidden" name="teaching_assignment_id" value={ta.id} />
            <ExamFields />
            <SubmitButton pendingLabel="Menyimpan…">Buat ujian</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
