import { requireRole, requireModule } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { tanggal, todayJakarta } from "@/lib/format";
import { Button, Card, Empty, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";

async function addNote(fd: FormData) {
  "use server";
  const { schoolId, user } = await requireRole("counselor");
  await run("/bk/catatan", "Catatan konseling disimpan.", (sb) => sb.from("counseling_notes").insert({
    school_id: schoolId, student_id: str(fd, "student_id"), session_on: str(fd, "session_on"),
    topic: str(fd, "topic"), notes: str(fd, "notes"), follow_up: optStr(fd, "follow_up"), counselor_id: user.id,
  }));
}

export default async function CounselingNotes({ searchParams }: { searchParams: Promise<{ murid?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireModule("counseling", "counselor");
  const [{ data: students }, { data: notes }] = await Promise.all([
    supabase.from("students").select("id, full_name").eq("school_id", schoolId).eq("status", "aktif").order("full_name"),
    (() => {
      let q = supabase.from("counseling_notes").select("id, session_on, topic, notes, follow_up, students(full_name), profiles:counselor_id(full_name)")
        .eq("school_id", schoolId).order("session_on", { ascending: false }).limit(100);
      if (sp.murid) q = q.eq("student_id", sp.murid);
      return q;
    })(),
  ]);

  return (
    <>
      <PageHeader title="Catatan Konseling" subtitle="Rahasia: hanya Guru BK dan kepala sekolah yang dapat membaca." />
      <Flash searchParams={sp} />
      <form className="mb-5 flex items-end gap-2">
        <Field label="Murid"><Select id="murid" name="murid" defaultValue={sp.murid ?? ""}><option value="">Semua</option>{(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
        <Button variant="secondary">Tampilkan</Button>
      </form>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!notes?.length && <Empty>Belum ada catatan.</Empty>}
          {((notes ?? []) as any[]).map((n) => (
            <article key={n.id} className="rounded-lg border border-line bg-sheet p-5">
              <div className="text-xs text-muted">{tanggal(n.session_on)} · {n.profiles?.full_name}</div>
              <h2 className="mt-1 font-bold text-ink">{n.students?.full_name}: {n.topic}</h2>
              <p className="mt-2 whitespace-pre-line text-sm">{n.notes}</p>
              {n.follow_up && <p className="mt-2 text-sm"><b>Tindak lanjut:</b> {n.follow_up}</p>}
            </article>
          ))}
        </div>
        <Card title="Catatan baru" className="h-fit">
          <form action={addNote} className="flex flex-col gap-3">
            <Field label="Murid"><Select id="n-st" name="student_id" defaultValue={sp.murid}>{(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
            <Field label="Tanggal sesi"><Input id="n-date" name="session_on" type="date" defaultValue={todayJakarta()} /></Field>
            <Field label="Topik"><Input id="n-topic" name="topic" required /></Field>
            <Field label="Catatan"><Textarea id="n-notes" name="notes" rows={5} required /></Field>
            <Field label="Tindak lanjut"><Textarea id="n-fu" name="follow_up" rows={2} /></Field>
            <Button type="submit">Simpan</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
