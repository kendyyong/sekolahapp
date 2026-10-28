import { requireRole } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { tanggal, todayJakarta } from "@/lib/format";
import { classRoster, myClasses } from "@/lib/queries";
import { Button, Card, Empty, Field, Flash, Input, PageHeader, Select, StatusBadge, Table } from "@/components/ui";

const STATUSES = ["hadir", "terlambat", "izin", "sakit", "alpa"] as const;

async function saveAttendance(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("teacher");
  const classId = str(fd, "class_id");
  const date = str(fd, "date");
  const rows = [...fd.entries()]
    .filter(([k, v]) => k.startsWith("s:") && v)
    .map(([k, v]) => ({ school_id: schoolId, class_id: classId, student_id: k.slice(2), date, status: String(v), method: "manual" }));
  await run(`/guru/absensi?kelas=${classId}&tanggal=${date}`, `Absensi ${rows.length} murid disimpan.`, (sb) =>
    sb.from("student_attendance").upsert(rows, { onConflict: "student_id,date,teaching_assignment_id" }));
}

async function closeDay(fd: FormData) {
  "use server";
  const classId = str(fd, "class_id");
  const date = str(fd, "date");
  await run(`/guru/absensi?kelas=${classId}&tanggal=${date}`, "Absensi ditutup. Murid yang belum tercatat ditandai alpa dan orang tuanya diberi tahu.",
    (sb) => sb.rpc("close_daily_attendance", { p_class: classId, p_date: date }));
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ kelas?: string; tanggal?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireRole("teacher");
  const classes = await myClasses(supabase, user.id, schoolId);
  const classId = sp.kelas ?? classes.find((c) => c.homeroom)?.id ?? classes[0]?.id;
  const date = sp.tanggal ?? todayJakarta();

  const roster = classId ? await classRoster(supabase, classId) : [];
  const { data: att } = classId
    ? await supabase.from("student_attendance").select("student_id, status, method, checked_in_at")
        .eq("class_id", classId).eq("date", date).is("teaching_assignment_id", null)
    : { data: [] };
  const byStudent = new Map((att ?? []).map((a) => [a.student_id, a]));
  const { data: qr } = classId ? await supabase.from("classes").select("qr_secret, name").eq("id", classId).single() : { data: null };

  return (
    <>
      <PageHeader title="Absensi Kelas" subtitle="Absensi harian. Murid juga bisa absen sendiri dengan kode QR kelas." />
      <Flash searchParams={sp} />
      <form className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Kelas">
          <Select id="kelas" name="kelas" defaultValue={classId}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.homeroom ? " (wali kelas)" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Tanggal"><Input id="tanggal" name="tanggal" type="date" defaultValue={date} /></Field>
        <Button variant="secondary" type="submit">Tampilkan</Button>
      </form>

      {!classId ? <Empty>Anda belum mengajar kelas mana pun.</Empty> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <form action={saveAttendance} className="min-w-0">
            <input type="hidden" name="class_id" value={classId} />
            <input type="hidden" name="date" value={date} />
            <Table head={["No", "Nama", "Status saat ini", "Ubah"]} empty="Belum ada murid di kelas ini.">
              {roster.map((s) => {
                const a = byStudent.get(s.id);
                return (
                  <tr key={s.id}>
                    <td className="tabular-nums text-muted">{s.roll ?? "–"}</td>
                    <td className="font-semibold">{s.full_name}</td>
                    <td>{a ? <><StatusBadge status={a.status} />{a.method !== "manual" && <span className="ml-1 text-xs text-muted">({a.method})</span>}</> : <span className="text-muted">Belum tercatat</span>}</td>
                    <td>
                      <select name={`s:${s.id}`} defaultValue="" aria-label={`Status ${s.full_name}`}
                        className="rounded-md border border-line bg-sheet px-2 py-1 text-sm">
                        <option value="">–</option>
                        {STATUSES.map((st) => <option key={st} value={st}>{st[0].toUpperCase() + st.slice(1)}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </Table>
            <div className="mt-3 flex gap-2"><Button type="submit">Simpan absensi</Button></div>
          </form>

          <div className="flex flex-col gap-4">
            <Card title="Kode absen kelas">
              <p className="text-sm text-muted">Tampilkan kode ini di kelas. Murid memasukkannya di menu Absen.</p>
              <div className="mt-3 rounded-md bg-paper px-3 py-4 text-center font-mono text-2xl font-bold tracking-widest text-ink">{qr?.qr_secret}</div>
            </Card>
            <Card title="Tutup absensi">
              <p className="mb-3 text-sm text-muted">Murid yang belum tercatat pada {tanggal(date)} akan ditandai alpa, dan orang tuanya mendapat notifikasi.</p>
              <form action={closeDay}>
                <input type="hidden" name="class_id" value={classId} />
                <input type="hidden" name="date" value={date} />
                <Button variant="danger" type="submit">Tutup absensi hari ini</Button>
              </form>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
