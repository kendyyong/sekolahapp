import { requireRole } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { HARI, jam } from "@/lib/format";
import { Card, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

async function createSubject(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/mapel", "Mapel ditambahkan.", (sb) =>
    sb.from("subjects").insert({ school_id: schoolId, code: str(fd, "code").toUpperCase(), name: str(fd, "name") }));
}

async function assignTeacher(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/mapel", "Guru pengampu disimpan.", (sb) => sb.from("teaching_assignments").upsert({
    school_id: schoolId, class_id: str(fd, "class_id"), subject_id: str(fd, "subject_id"), teacher_id: str(fd, "teacher_id"),
  }, { onConflict: "class_id,subject_id" }));
}

async function addSchedule(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/mapel", "Jadwal ditambahkan.", (sb) => sb.from("schedules").insert({
    school_id: schoolId, teaching_assignment_id: str(fd, "ta"), day_of_week: num(fd, "day"),
    starts_at: str(fd, "starts_at"), ends_at: str(fd, "ends_at"), room: optStr(fd, "room"),
  }));
}

async function removeSchedule(fd: FormData) {
  "use server";
  await run("/admin/mapel", "Jadwal dihapus.", (sb) => sb.from("schedules").delete().eq("id", str(fd, "id")));
}

export default async function SubjectsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireRole("school_admin");
  const [{ data: subjects }, { data: classes }, { data: teachers }, { data: tas }] = await Promise.all([
    supabase.from("subjects").select("id, code, name").eq("school_id", schoolId).order("name"),
    supabase.from("classes").select("id, name, academic_years!inner(is_active)").eq("school_id", schoolId).eq("academic_years.is_active", true).order("name"),
    supabase.from("memberships").select("user_id, profiles(full_name)").eq("school_id", schoolId).eq("role", "teacher").eq("is_active", true),
    supabase.from("teaching_assignments").select("id, classes!inner(name, academic_years!inner(is_active)), subjects(name), profiles:teacher_id(full_name), schedules(id, day_of_week, starts_at, ends_at, room)")
      .eq("school_id", schoolId).eq("classes.academic_years.is_active", true),
  ]);
  const teacherOpts = ((teachers ?? []) as any[]).map((t) => ({ id: t.user_id, name: t.profiles?.full_name })).sort((a, b) => a.name.localeCompare(b.name));
  const taList = ((tas ?? []) as any[]).sort((a, b) => a.classes.name.localeCompare(b.classes.name) || a.subjects.name.localeCompare(b.subjects.name));

  return (
    <>
      <PageHeader title="Mapel & Pengajar" subtitle="Tentukan guru pengampu setiap mapel di setiap kelas, lalu jadwalnya." />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Table head={["Kelas", "Mapel", "Guru", "Jadwal"]} empty="Belum ada guru pengampu.">
            {taList.map((t) => (
              <tr key={t.id}>
                <td className="font-semibold">{t.classes.name}</td>
                <td>{t.subjects.name}</td>
                <td>{t.profiles?.full_name}</td>
                <td>
                  <ul className="flex flex-col gap-1">
                    {(t.schedules ?? []).sort((a: any, b: any) => a.day_of_week - b.day_of_week).map((s: any) => (
                      <li key={s.id} className="flex items-center gap-2 text-xs">
                        <span className="tabular-nums">{HARI[s.day_of_week]} {jam(s.starts_at)}–{jam(s.ends_at)}{s.room ? ` · ${s.room}` : ""}</span>
                        <form action={removeSchedule}><input type="hidden" name="id" value={s.id} /><button className="text-muted hover:text-bad" aria-label="Hapus jadwal">×</button></form>
                      </li>
                    ))}
                  </ul>
                  <form action={addSchedule} className="mt-1 flex flex-wrap items-center gap-1">
                    <input type="hidden" name="ta" value={t.id} />
                    <select name="day" aria-label="Hari" className="rounded border border-line bg-sheet px-1 py-0.5 text-xs">
                      {HARI.slice(1, 7).map((h, i) => <option key={h} value={i + 1}>{h}</option>)}
                    </select>
                    <input name="starts_at" type="time" required aria-label="Mulai" className="rounded border border-line bg-sheet px-1 py-0.5 text-xs" />
                    <input name="ends_at" type="time" required aria-label="Selesai" className="rounded border border-line bg-sheet px-1 py-0.5 text-xs" />
                    <input name="room" placeholder="Ruang" aria-label="Ruang" className="w-16 rounded border border-line bg-sheet px-1 py-0.5 text-xs" />
                    <button className="text-xs font-semibold text-brand">+ Jadwal</button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Tetapkan guru pengampu">
            <form action={assignTeacher} className="flex flex-col gap-3">
              <Field label="Kelas"><Select id="t-class" name="class_id">{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Mapel"><Select id="t-subj" name="subject_id">{(subjects ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Guru"><Select id="t-teacher" name="teacher_id">{teacherOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
              <SubmitButton>Simpan</SubmitButton>
            </form>
          </Card>
          <Card title="Mapel">
            <ul className="mb-4 flex flex-wrap gap-1.5 text-sm">
              {(subjects ?? []).map((s) => <li key={s.id} className="rounded border border-line px-2 py-0.5"><b>{s.code}</b> {s.name}</li>)}
            </ul>
            <form action={createSubject} className="flex flex-col gap-3">
              <div className="grid grid-cols-[90px_1fr] gap-3">
                <Field label="Kode"><Input id="s-code" name="code" required placeholder="BIN" /></Field>
                <Field label="Nama mapel"><Input id="s-name" name="name" required placeholder="Bahasa Indonesia" /></Field>
              </div>
              <SubmitButton variant="secondary">Tambah mapel</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
