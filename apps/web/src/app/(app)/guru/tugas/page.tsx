import Link from "next/link";
import { requireRole } from "@/lib/session";
import { num, optStr, run, str, uploadFile } from "@/lib/actions";
import { waktu } from "@/lib/format";
import { classRoster, myTeaching, signedUrl } from "@/lib/queries";
import { Badge, Button, Card, Empty, Field, Flash, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";

const KIND: Record<string, string> = { tugas: "Tugas", pr: "PR", kuis: "Kuis", proyek: "Proyek" };

async function createAssignment(fd: FormData) {
  "use server";
  const { schoolId, user } = await requireRole("teacher");
  const ta = str(fd, "teaching_assignment_id");
  await run(`/guru/tugas?mapel=${ta}`, "Tugas dibagikan ke murid.", async (sb) => {
    const path = await uploadFile(sb, "assignments", `${schoolId}/${ta}`, fd.get("file"));
    const due = optStr(fd, "due_at");
    return sb.from("assignments").insert({
      school_id: schoolId,
      teaching_assignment_id: ta,
      kind: str(fd, "kind"),
      title: str(fd, "title"),
      description: optStr(fd, "description"),
      is_group: fd.get("is_group") === "on",
      due_at: due ? new Date(due + ":00+07:00").toISOString() : null,
      max_score: num(fd, "max_score"),
      meeting_url: optStr(fd, "meeting_url"),
      attachments: path ? [{ path, name: (fd.get("file") as File).name }] : [],
      created_by: user.id,
    });
  });
}

async function grade(fd: FormData) {
  "use server";
  const back = str(fd, "back");
  await run(back, "Nilai disimpan dan murid diberi tahu.", (sb) =>
    sb.rpc("grade_submission", { p_submission: str(fd, "submission_id"), p_score: num(fd, "score"), p_feedback: optStr(fd, "feedback") }));
}

async function removeAssignment(fd: FormData) {
  "use server";
  await run(`/guru/tugas?mapel=${str(fd, "ta")}`, "Tugas dihapus.", (sb) => sb.from("assignments").delete().eq("id", str(fd, "id")));
}

export default async function TeacherAssignments({ searchParams }: {
  searchParams: Promise<{ mapel?: string; tugas?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user } = await requireRole("teacher");
  const teaching = await myTeaching(supabase, user.id);
  if (!teaching.length) return (<><PageHeader title="Tugas & PR" /><Empty>Belum ada mapel yang ditugaskan kepada Anda.</Empty></>);
  const ta = teaching.find((t) => t.id === sp.mapel) ?? teaching[0];

  const { data: assignments } = await supabase.from("assignments")
    .select("id, kind, title, due_at, is_group, max_score, created_at, submissions(id, score)")
    .eq("teaching_assignment_id", ta.id).order("created_at", { ascending: false });

  const selected = sp.tugas ? assignments?.find((a) => a.id === sp.tugas) : null;
  let detail: React.ReactNode = null;
  if (selected) {
    const [{ data: subs }, roster] = await Promise.all([
      supabase.from("submissions").select("id, student_id, body, link_url, attachments, submitted_at, is_late, score, feedback, group_id")
        .eq("assignment_id", selected.id),
      classRoster(supabase, ta.class_id),
    ]);
    const byStudent = new Map((subs ?? []).map((s) => [s.student_id, s]));
    const back = `/guru/tugas?mapel=${ta.id}&tugas=${selected.id}`;
    const rows = await Promise.all(roster.map(async (st) => {
      const s = byStudent.get(st.id);
      const files = s ? await Promise.all(((s.attachments ?? []) as { path: string; name: string }[])
        .map(async (f) => ({ name: f.name, url: await signedUrl(supabase, "submissions", f.path) }))) : [];
      return { st, s, files };
    }));
    detail = (
      <Card title={`Pengumpulan: ${selected.title}`} className="mt-6"
        actions={<Link href={`/guru/tugas?mapel=${ta.id}`} className="text-sm font-semibold text-brand">Tutup</Link>}>
        <Table head={["Murid", "Jawaban", "Dikumpulkan", "Nilai"]}>
          {rows.map(({ st, s, files }) => (
            <tr key={st.id}>
              <td className="font-semibold">{st.full_name}</td>
              <td className="max-w-md">
                {!s ? <span className="text-muted">Belum mengumpulkan</span> : (
                  <div className="flex flex-col gap-1">
                    {s.body && <p className="whitespace-pre-line">{s.body}</p>}
                    {s.link_url && <a className="text-brand underline" href={s.link_url} target="_blank" rel="noreferrer">{s.link_url}</a>}
                    {files.map((f) => f.url && <a key={f.url} className="text-brand underline" href={f.url} target="_blank" rel="noreferrer">{f.name}</a>)}
                  </div>
                )}
              </td>
              <td className="whitespace-nowrap">{s ? <>{waktu(s.submitted_at)} {s.is_late && <Badge tone="warn">Terlambat</Badge>}</> : "–"}</td>
              <td>
                {s && (
                  <form action={grade} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="submission_id" value={s.id} />
                    <input type="hidden" name="back" value={back} />
                    <input name="score" type="number" step="0.5" min={0} max={selected.max_score} defaultValue={s.score ?? ""}
                      aria-label="Nilai" required className="w-20 rounded-md border border-line bg-sheet px-2 py-1 text-sm" />
                    <input name="feedback" defaultValue={s.feedback ?? ""} placeholder="Catatan" aria-label="Catatan"
                      className="w-36 rounded-md border border-line bg-sheet px-2 py-1 text-sm" />
                    <Button type="submit" variant="secondary" className="px-2 py-1">{s.score == null ? "Nilai" : "Ubah"}</Button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    );
  }

  return (
    <>
      <PageHeader title="Tugas & PR" subtitle={`${ta.subjects.name} · Kelas ${ta.classes.name}`} />
      <Flash searchParams={sp} />
      <form className="mb-5 flex items-end gap-2">
        <Field label="Mapel & kelas">
          <Select id="mapel" name="mapel" defaultValue={ta.id}>
            {teaching.map((t) => <option key={t.id} value={t.id}>{t.subjects.name} · {t.classes.name}</option>)}
          </Select>
        </Field>
        <Button variant="secondary">Tampilkan</Button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Table head={["Tugas", "Tenggat", "Terkumpul", ""]} empty="Belum ada tugas untuk kelas ini.">
            {(assignments ?? []).map((a) => {
              const subs = (a.submissions ?? []) as { score: number | null }[];
              return (
                <tr key={a.id}>
                  <td>
                    <div className="font-semibold">{a.title}</div>
                    <div className="mt-0.5 flex gap-1"><Badge tone="info">{KIND[a.kind]}</Badge>{a.is_group && <Badge>Kelompok</Badge>}</div>
                  </td>
                  <td className="whitespace-nowrap">{waktu(a.due_at)}</td>
                  <td className="tabular-nums">{subs.length} · {subs.filter((s) => s.score != null).length} dinilai</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/guru/tugas?mapel=${ta.id}&tugas=${a.id}`} className="font-semibold text-brand">Lihat</Link>
                    {subs.length === 0 && (
                      <form action={removeAssignment} className="ml-3 inline">
                        <input type="hidden" name="id" value={a.id} /><input type="hidden" name="ta" value={ta.id} />
                        <button className="text-sm text-muted hover:text-bad">Hapus</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
          {detail}
        </div>

        <Card title="Buat tugas baru" className="h-fit">
          <form action={createAssignment} className="flex flex-col gap-3">
            <input type="hidden" name="teaching_assignment_id" value={ta.id} />
            <Field label="Judul"><Input id="a-title" name="title" required maxLength={150} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jenis">
                <Select id="a-kind" name="kind" defaultValue="pr">
                  {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Nilai maks."><Input id="a-max" name="max_score" type="number" defaultValue={100} min={1} /></Field>
            </div>
            <Field label="Instruksi"><Textarea id="a-desc" name="description" rows={4} /></Field>
            <Field label="Tenggat (WIB)"><Input id="a-due" name="due_at" type="datetime-local" /></Field>
            <Field label="Link Zoom/Meet (opsional)"><Input id="a-meet" name="meeting_url" type="url" placeholder={ta.meeting_url ?? "https://"} /></Field>
            <Field label="Lampiran (opsional, maks. 5 MB)"><Input id="a-file" name="file" type="file" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_group" /> Tugas kelompok (dikumpulkan per kelompok terverifikasi)</label>
            <Button type="submit">Bagikan tugas</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
