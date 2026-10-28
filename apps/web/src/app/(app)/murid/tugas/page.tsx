import Link from "next/link";
import { requireRole } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { waktu } from "@/lib/format";
import { myStudent, signedUrl } from "@/lib/queries";
import { Badge, Button, Card, Empty, Field, Flash, Input, PageHeader, Table, Textarea } from "@/components/ui";

async function submit(fd: FormData) {
  "use server";
  const { supabase, user, schoolId } = await requireRole("student");
  const me = await myStudent(supabase, user.id, schoolId);
  const id = str(fd, "assignment_id");
  await run(`/murid/tugas?id=${id}`, "Jawaban terkirim.", async (sb) => {
    const file = fd.get("file");
    let attachments: { path: string; name: string }[] = [];
    if (file instanceof File && file.size > 0) {
      if (file.size > 20 * 1024 * 1024) throw new Error("Ukuran berkas maksimal 20 MB");
      const path = `${schoolId}/${id}/${me!.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(-80)}`;
      const up = await sb.storage.from("submissions").upload(path, file, { contentType: file.type });
      if (up.error) throw new Error(`Gagal mengunggah: ${up.error.message}`);
      attachments = [{ path, name: file.name }];
    }
    return sb.rpc("submit_assignment", { p_assignment: id, p_body: optStr(fd, "body"), p_link: optStr(fd, "link"), p_attachments: attachments });
  });
}

export default async function StudentAssignments({ searchParams }: { searchParams: Promise<{ id?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireRole("student");
  const me = await myStudent(supabase, user.id, schoolId);
  if (!me?.class) return (<><PageHeader title="Tugas & PR" /><Empty>Anda belum terdaftar di kelas.</Empty></>);

  const { data: tas } = await supabase.from("teaching_assignments").select("id, subjects(name)").eq("class_id", me.class.id);
  const subjectOf = new Map(((tas ?? []) as any[]).map((t) => [t.id, t.subjects?.name as string]));
  const [{ data: assignments }, { data: subs }] = await Promise.all([
    supabase.from("assignments").select("id, kind, title, description, due_at, is_group, max_score, meeting_url, attachments, teaching_assignment_id")
      .in("teaching_assignment_id", [...subjectOf.keys()]).order("due_at", { ascending: false, nullsFirst: false }).limit(100),
    supabase.from("submissions").select("assignment_id, body, link_url, attachments, submitted_at, is_late, score, feedback").eq("student_id", me.id),
  ]);
  const subOf = new Map((subs ?? []).map((s) => [s.assignment_id, s]));
  const sel = (assignments ?? []).find((a) => a.id === sp.id);
  const selFiles = sel ? await Promise.all(((sel.attachments ?? []) as { path: string; name: string }[])
    .map(async (f) => ({ name: f.name, url: await signedUrl(supabase, "assignments", f.path) }))) : [];
  const mySub = sel ? subOf.get(sel.id) : undefined;

  return (
    <>
      <PageHeader title="Tugas & PR" subtitle={`Kelas ${me.class.name}`} />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Table head={["Tugas", "Mapel", "Tenggat", "Status"]} empty="Belum ada tugas.">
            {(assignments ?? []).map((a) => {
              const s = subOf.get(a.id);
              const late = !s && a.due_at && new Date(a.due_at) < new Date();
              return (
                <tr key={a.id} className={a.id === sp.id ? "bg-brand-soft/50" : ""}>
                  <td><Link href={`/murid/tugas?id=${a.id}`} className="font-semibold text-brand">{a.title}</Link>{a.is_group && <Badge>Kelompok</Badge>}</td>
                  <td>{subjectOf.get(a.teaching_assignment_id)}</td>
                  <td className="whitespace-nowrap">{waktu(a.due_at)}</td>
                  <td>{s ? (s.score != null ? <Badge tone="good">Nilai {s.score}</Badge> : <Badge tone="info">Terkirim</Badge>)
                    : late ? <Badge tone="bad">Lewat tenggat</Badge> : <Badge tone="warn">Belum</Badge>}</td>
                </tr>
              );
            })}
          </Table>
        </div>
        {sel ? (
          <Card title={sel.title} className="h-fit">
            <div className="mb-3 text-xs text-muted">{subjectOf.get(sel.teaching_assignment_id)} · Tenggat {waktu(sel.due_at)} · Nilai maks. {sel.max_score}</div>
            {sel.description && <p className="mb-3 whitespace-pre-line text-sm">{sel.description}</p>}
            {selFiles.map((f) => f.url && <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="mb-1 block text-sm text-brand underline">{f.name}</a>)}
            {sel.meeting_url && <a href={sel.meeting_url} target="_blank" rel="noreferrer" className="mb-3 block text-sm font-semibold text-brand">Buka kelas online</a>}
            {mySub?.score != null ? (
              <div className="rounded-md bg-good-soft p-3 text-sm text-good"><b>Nilai {mySub.score}</b>{mySub.feedback && <p className="mt-1">{mySub.feedback}</p>}</div>
            ) : (
              <form action={submit} className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                <input type="hidden" name="assignment_id" value={sel.id} />
                {sel.is_group && <p className="text-xs text-muted">Tugas kelompok: jawaban berlaku untuk semua anggota kelompok terverifikasi Anda.</p>}
                <Field label="Jawaban"><Textarea id="s-body" name="body" rows={5} defaultValue={mySub?.body ?? ""} /></Field>
                <Field label="Link (Google Drive, YouTube, dll.)"><Input id="s-link" name="link" type="url" defaultValue={mySub?.link_url ?? ""} /></Field>
                <Field label="Unggah berkas (foto/PDF, maks. 20 MB)"><Input id="s-file" name="file" type="file" /></Field>
                {mySub && <p className="text-xs text-muted">Terkirim {waktu(mySub.submitted_at)}{mySub.is_late ? " (terlambat)" : ""}. Kirim ulang untuk mengganti.</p>}
                <Button type="submit">{mySub ? "Kirim ulang" : "Kirim jawaban"}</Button>
              </form>
            )}
          </Card>
        ) : <Empty>Pilih tugas untuk melihat detail dan mengirim jawaban.</Empty>}
      </div>
    </>
  );
}
