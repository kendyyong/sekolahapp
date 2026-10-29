import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModule } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { examPhase, KIND_LABEL, keyText, LETTERS, MEDIA_BUCKET, parseQuestions, randomToken, type Exam, type Question, type QuestionKind } from "@/lib/cbt";
import { waktu } from "@/lib/format";
import { classRoster } from "@/lib/queries";
import { activeTerms, KIND_LABEL as ASSESSMENT_KIND, termLabel } from "@/lib/report";
import { Badge, Card, DownloadLink, Empty, Field, Flash, PageHeader, Select, Stat, Table, Tabs, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ExamFields, examFromForm } from "../exam-form";
import { QuestionForm } from "./question-form";

const page = (id: string, tab = "soal") => `/guru/ujian/${id}?tab=${tab}`;

async function uploadImage(sb: SupabaseClient, schoolId: string, examId: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > 2 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 2 MB");
  const path = `${schoolId}/${examId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-60)}`;
  const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Gagal mengunggah gambar: ${error.message}`);
  return path;
}

/** Kunci jawaban dari form soal sesuai jenisnya. */
function questionFromForm(fd: FormData) {
  const kind = str(fd, "kind") as QuestionKind;
  const points = num(fd, "points");
  const base = { kind, prompt: str(fd, "prompt"), points, explanation: optStr(fd, "explanation") };
  switch (kind) {
    case "pg": case "pg_kompleks": {
      const options = fd.getAll("option").map((o) => String(o).trim());
      const keys = fd.getAll(kind === "pg" ? "key" : "keys").map(Number);
      if (!keys.length) throw new Error(kind === "pg" ? "Pilih kunci jawabannya" : "Centang minimal satu jawaban benar");
      return { ...base, options, answer: kind === "pg" ? keys[0] : keys };
    }
    case "benar_salah": return { ...base, options: null, answer: str(fd, "key_bool") === "true" };
    case "isian": return { ...base, options: null, answer: str(fd, "accepted").split("|").map((s) => s.trim()).filter(Boolean) };
    default: return { ...base, options: null, answer: null };
  }
}

async function saveQuestion(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("cbt", "teacher");
  const examId = str(fd, "exam_id"), id = optStr(fd, "id");
  await run(page(examId), id ? "Soal disimpan." : "Soal ditambahkan.", async (sb) => {
    const row: Record<string, unknown> = questionFromForm(fd);
    const image = await uploadImage(sb, schoolId, examId, fd.get("image"));
    if (image) row.image_path = image;
    else if (fd.get("remove_image") === "on") row.image_path = null;
    if (id) return sb.from("exam_questions").update(row).eq("id", id);
    const { count } = await sb.from("exam_questions").select("id", { count: "exact", head: true }).eq("exam_id", examId);
    return sb.from("exam_questions").insert({ ...row, exam_id: examId, school_id: schoolId, position: count ?? 0 });
  });
}

async function importQuestions(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("cbt", "teacher");
  const examId = str(fd, "exam_id");
  let n = 0;
  await run(page(examId), () => `${n} soal ditambahkan.`, async (sb) => {
    const parsed = parseQuestions(str(fd, "text"));
    if (!parsed.length) throw new Error("Tempel soalnya dulu");
    const { count } = await sb.from("exam_questions").select("id", { count: "exact", head: true }).eq("exam_id", examId);
    n = parsed.length;
    return sb.from("exam_questions").insert(parsed.map((q, i) => ({ ...q, exam_id: examId, school_id: schoolId, position: (count ?? 0) + i })));
  });
}

async function deleteQuestion(fd: FormData) {
  "use server";
  await requireModule("cbt", "teacher");
  await run(page(str(fd, "exam_id")), "Soal dihapus.", (sb) => sb.from("exam_questions").delete().eq("id", str(fd, "id")));
}

async function moveQuestion(fd: FormData) {
  "use server";
  await requireModule("cbt", "teacher");
  const examId = str(fd, "exam_id");
  await run(page(examId), "Urutan soal diubah.", async (sb) => {
    const { data } = await sb.from("exam_questions").select("id").eq("exam_id", examId).order("position").order("created_at");
    const ids = (data ?? []).map((q) => q.id);
    const i = ids.indexOf(str(fd, "id")), j = i + (str(fd, "dir") === "up" ? -1 : 1);
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    for (const [pos, qid] of ids.entries()) {
      const { error } = await sb.from("exam_questions").update({ position: pos }).eq("id", qid);
      if (error) return { error };
    }
  });
}

async function saveExam(fd: FormData) {
  "use server";
  await requireModule("cbt", "teacher");
  const id = str(fd, "id");
  await run(page(id, "pengaturan"), "Pengaturan ujian disimpan.", async (sb) => {
    const { data: cur } = await sb.from("exams").select("token").eq("id", id).single();
    return sb.from("exams").update(examFromForm(fd, cur ?? undefined)).eq("id", id);
  });
}

async function publish(fd: FormData) {
  "use server";
  await requireModule("cbt", "teacher");
  const id = str(fd, "id"), on = str(fd, "on") === "1";
  await run(page(id, "pengaturan"), on ? "Ujian diterbitkan. Murid kelas ini sudah diberi tahu." : "Ujian ditarik dari daftar murid.",
    (sb) => sb.from("exams").update({ is_published: on }).eq("id", id));
}

async function newToken(fd: FormData) {
  "use server";
  await requireModule("cbt", "teacher");
  const id = str(fd, "id");
  await run(page(id, "pengaturan"), "Token baru dibuat.", (sb) => sb.from("exams").update({ token: randomToken() }).eq("id", id));
}

async function deleteExam(fd: FormData) {
  "use server";
  await requireModule("cbt", "teacher");
  const id = str(fd, "id");
  await run(page(id, "pengaturan"), "Ujian dihapus.", (sb) => sb.from("exams").delete().eq("id", id), () => `/guru/ujian?mapel=${str(fd, "ta")}`);
}

async function resetAttempt(fd: FormData) {
  "use server";
  await requireModule("cbt", "teacher");
  await run(page(str(fd, "exam_id"), "hasil"), "Pengerjaan dihapus. Murid bisa mengerjakan ulang selama ujian masih dibuka.",
    (sb) => sb.rpc("cbt_reset_attempt", { p_attempt: str(fd, "attempt") }));
}

async function sendToGrades(fd: FormData) {
  "use server";
  await requireModule("cbt", "teacher");
  const id = str(fd, "exam_id");
  let n = 0;
  await run(page(id, "hasil"), () => `${n} nilai dikirim ke menu Nilai & Rapor.`, async (sb) => {
    const { data, error } = await sb.rpc("cbt_send_to_grades", { p_exam: id, p_term: str(fd, "term"), p_kind: str(fd, "kind") });
    n = data ?? 0;
    return { error };
  });
}

interface Attempt {
  id: string; student_id: string; started_at: string; deadline_at: string; submitted_at: string | null;
  answers: Record<string, unknown>; points: Record<string, number> | null; score: number | null; needs_review: boolean; leave_count: number;
}

export default async function ExamDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; edit?: string; ok?: string; err?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, schoolId, modules } = await requireModule("cbt", "teacher");
  const { data } = await supabase.from("exams")
    .select("*, teaching_assignments!inner(id, class_id, classes!inner(name), subjects!inner(name))").eq("id", id).maybeSingle();
  if (!data) notFound();
  const e = data as Exam & { teaching_assignments: { id: string; class_id: string; classes: { name: string }; subjects: { name: string } } };
  const ta = e.teaching_assignments;
  const tab = ["soal", "pengaturan", "hasil"].includes(sp.tab ?? "") ? sp.tab! : "soal";
  const phase = examPhase(e);

  if (tab === "hasil") await supabase.rpc("cbt_close_expired", { p_exam: id });
  const [{ data: qs }, { data: att }] = await Promise.all([
    supabase.from("exam_questions").select("*").eq("exam_id", id).order("position").order("created_at"),
    supabase.from("exam_attempts").select("id, student_id, started_at, deadline_at, submitted_at, answers, points, score, needs_review, leave_count").eq("exam_id", id),
  ]);
  const questions = (qs ?? []) as Question[];
  const attempts = (att ?? []) as Attempt[];
  const locked = attempts.length > 0;
  const totalPoints = questions.reduce((s, q) => s + Number(q.points), 0);
  const hidden = <input type="hidden" name="exam_id" value={id} />;

  let body: React.ReactNode;
  if (tab === "soal") {
    const paths = questions.map((q) => q.image_path).filter(Boolean) as string[];
    const { data: signed } = paths.length ? await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600) : { data: [] };
    const img = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    body = (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          {locked && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">Ujian sudah dikerjakan murid. Soal tidak bisa ditambah atau dihapus, tetapi kunci jawaban dan bobot masih bisa diperbaiki; nilai murid dihitung ulang otomatis.</p>}
          {questions.length === 0 && <Empty>Belum ada soal. Tambahkan satu per satu, atau tempel sekaligus dari Word di kotak sebelah.</Empty>}
          {questions.map((q, i) => (
            <Card key={q.id} title={`Soal ${i + 1}`} actions={
              <div className="flex items-center gap-2">
                <Badge tone="info">{KIND_LABEL[q.kind]}</Badge><Badge>{Number(q.points)} poin</Badge>
                {(["up", "down"] as const).map((dir) => (
                  <form key={dir} action={moveQuestion}>
                    {hidden}<input type="hidden" name="id" value={q.id} /><input type="hidden" name="dir" value={dir} />
                    <button disabled={dir === "up" ? i === 0 : i === questions.length - 1} aria-label={dir === "up" ? "Naikkan" : "Turunkan"}
                      className="rounded p-1 text-muted hover:bg-paper disabled:opacity-30">
                      {dir === "up" ? <ArrowUp aria-hidden className="size-4" /> : <ArrowDown aria-hidden className="size-4" />}
                    </button>
                  </form>
                ))}
              </div>}>
              {sp.edit === q.id ? (
                <>
                  <QuestionForm action={saveQuestion} examId={id} q={q} submitLabel="Simpan soal" />
                  <Link href={page(id)} className="mt-3 inline-block text-sm font-semibold text-muted">Batal</Link>
                </>
              ) : (
                <>
                  <p className="whitespace-pre-line text-ink">{q.prompt}</p>
                  {q.image_path && img.get(q.image_path) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.get(q.image_path)!} alt={`Gambar soal ${i + 1}`} className="mt-3 max-h-64 rounded-lg border border-line" />
                  )}
                  {q.options && (
                    <ol className="mt-3 flex flex-col gap-1 text-sm">
                      {q.options.map((o, k) => {
                        const right = q.kind === "pg" ? q.answer === k : (q.answer as number[]).includes(k);
                        return <li key={k} className={right ? "font-semibold text-good" : "text-ink"}>{LETTERS[k]}. {o}{right && " ✓"}</li>;
                      })}
                    </ol>
                  )}
                  {!q.options && q.kind !== "uraian" && <p className="mt-3 text-sm"><span className="text-muted">Kunci: </span><span className="font-semibold text-good">{keyText(q)}</span></p>}
                  {q.explanation && <p className="mt-2 text-sm text-muted">{q.kind === "uraian" ? "Pedoman" : "Pembahasan"}: {q.explanation}</p>}
                  <div className="mt-4 flex gap-4 text-sm">
                    <Link href={`/guru/ujian/${id}?tab=soal&edit=${q.id}`} className="font-semibold text-brand">Ubah</Link>
                    {!locked && (
                      <form action={deleteQuestion}>{hidden}<input type="hidden" name="id" value={q.id} />
                        <button className="text-muted hover:text-bad">Hapus</button></form>
                    )}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
        {!locked && (
          <div className="flex flex-col gap-6">
            <Card title="Tambah soal"><QuestionForm action={saveQuestion} examId={id} submitLabel="Tambah soal" /></Card>
            <Card title="Tempel banyak soal sekaligus">
              <form action={importQuestions} className="flex flex-col gap-3">
                {hidden}
                <Textarea name="text" rows={12} aria-label="Teks soal" className="font-mono text-xs" placeholder={IMPORT_EXAMPLE} />
                <p className="text-xs text-muted">
                  Tulis &quot;Kunci: A&quot; untuk pilihan ganda (&quot;Kunci: A, C&quot; bila jawabannya lebih dari satu), &quot;Kunci: Benar&quot;
                  atau &quot;Kunci: Salah&quot;, jawaban singkat seperti &quot;Kunci: 0,25 | 0.25&quot;, atau &quot;Uraian&quot;. &quot;Bobot:&quot; dan
                  &quot;Pembahasan:&quot; boleh ditambahkan.
                </p>
                <SubmitButton variant="secondary" pendingLabel="Memproses…">Impor soal</SubmitButton>
              </form>
            </Card>
          </div>
        )}
      </div>
    );
  } else if (tab === "pengaturan") {
    body = (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Pengaturan ujian">
          <form action={saveExam} className="flex flex-col gap-4">
            <input type="hidden" name="id" value={id} />
            <ExamFields e={e} />
            <SubmitButton pendingLabel="Menyimpan…" className="w-fit">Simpan</SubmitButton>
          </form>
        </Card>
        <div className="flex flex-col gap-6">
          <Card title="Terbitkan">
            <p className="text-sm text-muted">
              {e.is_published ? "Ujian tampil di menu Ujian Online murid kelas ini." : "Ujian belum terlihat murid. Terbitkan setelah soal siap; murid langsung diberi tahu."}
            </p>
            <form action={publish} className="mt-4">
              <input type="hidden" name="id" value={id} /><input type="hidden" name="on" value={e.is_published ? "0" : "1"} />
              <SubmitButton variant={e.is_published ? "secondary" : "primary"} disabled={!e.is_published && questions.length === 0}>
                {e.is_published ? "Tarik dari murid" : "Terbitkan ujian"}
              </SubmitButton>
            </form>
          </Card>
          {e.token && (
            <Card title="Token ujian">
              <p className="font-mono text-3xl font-bold tracking-[0.3em] text-ink">{e.token}</p>
              <p className="mt-2 text-sm text-muted">Bacakan atau tulis di papan saat ujian dimulai. Ganti token bila sudah tersebar sebelum waktunya.</p>
              <form action={newToken} className="mt-3"><input type="hidden" name="id" value={id} /><SubmitButton variant="secondary">Ganti token</SubmitButton></form>
            </Card>
          )}
          {!locked && (
            <Card title="Hapus ujian">
              <form action={deleteExam}>
                <input type="hidden" name="id" value={id} /><input type="hidden" name="ta" value={ta.id} />
                <SubmitButton variant="ghost" className="-ml-3 text-bad hover:bg-bad-soft">Hapus ujian beserta soalnya</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    );
  } else {
    const [roster, { terms, term }] = await Promise.all([
      classRoster(supabase, ta.class_id),
      modules.includes("grades") ? activeTerms(supabase, schoolId) : Promise.resolve({ terms: [], term: undefined }),
    ]);
    const byStudent = new Map(attempts.map((a) => [a.student_id, a]));
    const done = attempts.filter((a) => a.submitted_at);
    const scored = done.filter((a) => a.score != null && !a.needs_review).map((a) => Number(a.score));
    const avg = scored.length ? scored.reduce((s, x) => s + x, 0) / scored.length : null;
    const review = done.filter((a) => a.needs_review).length;
    const now = Date.now();
    body = (
      <>
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Selesai" value={`${done.length} / ${roster.length}`} hint={attempts.length > done.length ? `${attempts.length - done.length} sedang mengerjakan` : undefined} />
          <Stat label="Rata-rata" value={avg == null ? "–" : avg.toFixed(1)} tone="good" />
          <Stat label="Tertinggi / terendah" value={scored.length ? `${Math.max(...scored)} / ${Math.min(...scored)}` : "–"} />
          <Stat label="Uraian perlu dinilai" value={review} tone={review ? "warn" : undefined} />
        </div>
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-6">
            <Table head={["Murid", "Status", "Terjawab", "Keluar layar", "Nilai", ""]}>
              {roster.map((st) => {
                const a = byStudent.get(st.id);
                const left = a && !a.submitted_at ? Math.max(0, Math.ceil((Date.parse(a.deadline_at) - now) / 60000)) : 0;
                return (
                  <tr key={st.id}>
                    <td className="font-semibold">{st.full_name}<div className="text-xs font-normal text-muted">{st.nis ?? ""}</div></td>
                    <td className="whitespace-nowrap">
                      {!a ? <span className="text-muted">Belum mulai</span>
                        : a.submitted_at ? <span className="text-sm">Selesai {waktu(a.submitted_at)}</span>
                        : <Badge tone="info">Mengerjakan · sisa {left} mnt</Badge>}
                    </td>
                    <td className="tabular-nums">{a ? `${Object.keys(a.answers ?? {}).length} / ${questions.length}` : "–"}</td>
                    <td className="tabular-nums">{a ? (a.leave_count > 0 ? <Badge tone={a.leave_count >= 3 ? "warn" : "neutral"}>{a.leave_count}×</Badge> : "0") : "–"}</td>
                    <td className="tabular-nums font-semibold">
                      {a?.submitted_at ? (a.needs_review ? <Badge tone="warn">Nilai uraian</Badge> : Number(a.score)) : "–"}
                    </td>
                    <td className="whitespace-nowrap text-right text-sm">
                      {a && <Link href={`/guru/ujian/jawaban/${a.id}`} className="font-semibold text-brand">Jawaban</Link>}
                      {a && (
                        <form action={resetAttempt} className="ml-3 inline">
                          {hidden}<input type="hidden" name="attempt" value={a.id} />
                          <button className="text-muted hover:text-bad" title="Hapus pengerjaan agar murid bisa mengulang">Ulang</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
            {done.length > 0 && (
              <Card title="Analisis butir soal">
                <p className="mb-3 text-sm text-muted">Persentase murid yang menjawab benar. Soal dengan persentase sangat rendah perlu dicek kuncinya atau dibahas ulang di kelas.</p>
                <Table head={["No", "Soal", "Jenis", "Benar"]}>
                  {questions.map((q, i) => {
                    const got = done.map((a) => a.points?.[q.id]).filter((p) => p != null) as number[];
                    const pct = got.length ? Math.round((got.filter((p) => Number(p) >= Number(q.points)).length / got.length) * 100) : null;
                    return (
                      <tr key={q.id}>
                        <td className="tabular-nums">{i + 1}</td>
                        <td className="max-w-md truncate">{q.prompt}</td>
                        <td className="whitespace-nowrap text-sm text-muted">{KIND_LABEL[q.kind]}</td>
                        <td className="tabular-nums">{pct == null ? "–" : <Badge tone={pct < 30 ? "bad" : pct < 60 ? "warn" : "good"}>{pct}%</Badge>}</td>
                      </tr>
                    );
                  })}
                </Table>
              </Card>
            )}
          </div>
          <div className="grid gap-6 md:grid-cols-2 2xl:flex 2xl:flex-col">
            {modules.includes("grades") && (
              <Card title="Kirim ke Nilai & Rapor">
                {terms.length === 0 ? <p className="text-sm text-muted">Admin sekolah belum membuat semester untuk tahun ajaran aktif.</p> : (
                  <form action={sendToGrades} className="flex flex-col gap-3">
                    {hidden}
                    <p className="text-sm text-muted">
                      Nilai ujian (0–100) dimasukkan sebagai penilaian di menu Nilai & Rapor. Kirim ulang setelah ada perubahan.
                      {e.assessment_id && " Ujian ini sudah pernah dikirim."}
                    </p>
                    <Field label="Semester">
                      <Select id="term" name="term" defaultValue={term?.id}>
                        {terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
                      </Select>
                    </Field>
                    <Field label="Jenis penilaian">
                      <Select id="assessment-kind" name="kind" defaultValue="sumatif">
                        {Object.entries(ASSESSMENT_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    </Field>
                    <SubmitButton disabled={done.length === 0} pendingLabel="Mengirim…">Kirim nilai</SubmitButton>
                  </form>
                )}
              </Card>
            )}
            <Card title="Unduh">
              <p className="mb-3 text-sm text-muted">Rekap nilai dan skor tiap soal per murid.</p>
              <DownloadLink href={`/unduh/ujian?ujian=${id}`}>Unduh Excel</DownloadLink>
            </Card>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Link href={`/guru/ujian?mapel=${ta.id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft aria-hidden className="size-4" />Ujian Online</Link>
      <PageHeader title={e.title}
        subtitle={`${ta.subjects.name} · Kelas ${ta.classes.name} · ${waktu(e.starts_at)} – ${waktu(e.ends_at)} · ${e.duration_minutes} menit · ${questions.length} soal (${totalPoints} poin)`}
        actions={<Badge tone={phase.tone}>{phase.label}</Badge>} />
      <Flash searchParams={sp} />
      <Tabs active={tab} items={[
        { key: "soal", label: `Soal (${questions.length})`, href: page(id) },
        { key: "pengaturan", label: e.is_published ? "Pengaturan" : "Pengaturan & terbitkan", href: page(id, "pengaturan") },
        { key: "hasil", label: `Hasil (${attempts.filter((a) => a.submitted_at).length})`, href: page(id, "hasil") },
      ]} />
      {body}
    </>
  );
}

const IMPORT_EXAMPLE = `1. Hasil dari 1/2 + 1/4 adalah ...
A. 3/4
B. 2/6
C. 1/8
Kunci: A

2. 0,5 sama dengan 1/2
Kunci: Benar

3. Jelaskan cara menjumlahkan pecahan!
Uraian
Bobot: 5`;
