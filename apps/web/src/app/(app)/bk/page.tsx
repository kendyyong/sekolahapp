import { requireRole, requireModule } from "@/lib/session";
import { num, run, str } from "@/lib/actions";
import { tanggal, todayJakarta } from "@/lib/format";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";

async function addBehavior(fd: FormData) {
  "use server";
  const { schoolId, user } = await requireRole("counselor");
  await run("/bk", "Catatan perilaku disimpan.", (sb) => sb.from("behavior_records").insert({
    school_id: schoolId, student_id: str(fd, "student_id"), kind: str(fd, "kind"), points: num(fd, "points"),
    description: str(fd, "description"), occurred_on: str(fd, "occurred_on"), recorded_by: user.id,
  }));
}

export default async function CounselorHome({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireModule("counseling", "counselor");
  const today = todayJakarta();
  const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const [{ data: absences }, { data: behavior }, { data: longLeave }, { data: students }] = await Promise.all([
    supabase.from("student_attendance").select("student_id, status, students(full_name)").eq("school_id", schoolId)
      .is("teaching_assignment_id", null).eq("status", "alpa").gte("date", from),
    supabase.from("behavior_records").select("student_id, kind, points, description, occurred_on, students(full_name)")
      .eq("school_id", schoolId).order("occurred_on", { ascending: false }).limit(200),
    supabase.from("student_leave_requests").select("id, starts_on, ends_on, kind, reason, status, students(full_name)")
      .eq("school_id", schoolId).eq("status", "approved").gte("ends_on", from).order("starts_on", { ascending: false }),
    supabase.from("students").select("id, full_name").eq("school_id", schoolId).eq("status", "aktif").order("full_name"),
  ]);

  // Agregasi: alpa 30 hari & poin pelanggaran.
  const agg = new Map<string, { name: string; alpa: number; pelanggaran: number; prestasi: number }>();
  const get = (id: string, name: string) => agg.get(id) ?? agg.set(id, { name, alpa: 0, pelanggaran: 0, prestasi: 0 }).get(id)!;
  for (const a of (absences ?? []) as any[]) get(a.student_id, a.students?.full_name).alpa++;
  for (const b of (behavior ?? []) as any[]) get(b.student_id, b.students?.full_name)[b.kind as "pelanggaran" | "prestasi"] += b.points;
  const flagged = [...agg.entries()].filter(([, v]) => v.alpa >= 3 || v.pelanggaran >= 25)
    .sort((a, b) => b[1].pelanggaran + b[1].alpa * 10 - (a[1].pelanggaran + a[1].alpa * 10));
  const longOnes = ((longLeave ?? []) as any[]).filter((l) => (Date.parse(l.ends_on) - Date.parse(l.starts_on)) / 86400_000 + 1 > 3);

  return (
    <>
      <PageHeader title="Murid Perlu Perhatian" subtitle="Alpa ≥3 kali dalam 30 hari, poin pelanggaran ≥25, atau izin lebih dari 3 hari." />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Table head={["Murid", "Alpa 30 hari", "Poin pelanggaran", "Poin prestasi"]} empty="Tidak ada murid yang perlu perhatian khusus.">
            {flagged.map(([id, v]) => (
              <tr key={id}>
                <td className="font-semibold">{v.name}</td>
                <td className="tabular-nums">{v.alpa >= 3 ? <Badge tone="bad">{v.alpa}</Badge> : v.alpa}</td>
                <td className="tabular-nums">{v.pelanggaran >= 25 ? <Badge tone="bad">{v.pelanggaran}</Badge> : v.pelanggaran}</td>
                <td className="tabular-nums">{v.prestasi}</td>
              </tr>
            ))}
          </Table>
          <Card title="Izin panjang (30 hari terakhir)">
            <Table head={["Murid", "Tanggal", "Alasan"]} empty="Tidak ada.">
              {longOnes.map((l) => (
                <tr key={l.id}><td className="font-semibold">{l.students?.full_name}</td>
                  <td className="whitespace-nowrap">{tanggal(l.starts_on)} – {tanggal(l.ends_on)}</td><td>{l.reason}</td></tr>
              ))}
            </Table>
          </Card>
          <Card title="Catatan perilaku terbaru">
            <Table head={["Tanggal", "Murid", "Jenis", "Poin", "Keterangan"]}>
              {((behavior ?? []) as any[]).slice(0, 20).map((b, i) => (
                <tr key={i}><td className="whitespace-nowrap">{tanggal(b.occurred_on)}</td><td>{b.students?.full_name}</td>
                  <td><Badge tone={b.kind === "prestasi" ? "good" : "bad"}>{b.kind}</Badge></td><td className="tabular-nums">{b.points}</td><td>{b.description}</td></tr>
              ))}
            </Table>
          </Card>
        </div>
        <Card title="Catat perilaku" className="h-fit">
          <form action={addBehavior} className="flex flex-col gap-3">
            <Field label="Murid"><Select id="b-st" name="student_id">{(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jenis"><Select id="b-kind" name="kind"><option value="pelanggaran">Pelanggaran</option><option value="prestasi">Prestasi</option></Select></Field>
              <Field label="Poin"><Input id="b-pts" name="points" type="number" min={1} defaultValue={5} /></Field>
            </div>
            <Field label="Tanggal"><Input id="b-date" name="occurred_on" type="date" defaultValue={today} /></Field>
            <Field label="Keterangan"><Textarea id="b-desc" name="description" required /></Field>
            <Button type="submit">Simpan</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
