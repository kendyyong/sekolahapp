import Link from "next/link";
import { requireRole } from "@/lib/session";
import { HARI, jam, tanggal, todayJakarta } from "@/lib/format";
import { myTeaching } from "@/lib/queries";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";

export default async function TeacherHome() {
  const { supabase, user, schoolId, profile } = await requireRole("teacher");
  const today = todayJakarta();
  const isoDow = ((new Date(today + "T12:00:00+07:00").getDay() + 6) % 7) + 1;
  const teaching = await myTeaching(supabase, user.id);
  const taIds = teaching.map((t) => t.id);

  const [{ data: schedule }, { count: pendingLeave }, { count: pendingGroups }, { data: toGrade }, { count: newDirectives }] = await Promise.all([
    taIds.length
      ? supabase.from("schedules").select("id, starts_at, ends_at, room, teaching_assignment_id")
          .in("teaching_assignment_id", taIds).eq("day_of_week", isoDow).order("starts_at")
      : Promise.resolve({ data: [] as { id: string; starts_at: string; ends_at: string; room: string | null; teaching_assignment_id: string }[] }),
    supabase.from("student_leave_requests").select("id, students!inner(enrollments!inner(classes!inner(homeroom_teacher_id)))", { count: "exact", head: true })
      .eq("status", "pending").eq("students.enrollments.classes.homeroom_teacher_id", user.id),
    supabase.from("work_groups").select("id", { count: "exact", head: true }).eq("status", "pending").eq("school_id", schoolId),
    taIds.length
      ? supabase.from("submissions").select("id, assignments!inner(id, title, teaching_assignment_id)")
          .is("score", null).in("assignments.teaching_assignment_id", taIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
    supabase.from("directive_recipients").select("directive_id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "baru"),
  ]);

  const byTa = new Map(teaching.map((t) => [t.id, t]));
  return (
    <>
      <PageHeader title={`Selamat datang, ${profile?.full_name?.split(",")[0] ?? "Guru"}`} subtitle={tanggal(today, true)} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Izin menunggu" value={pendingLeave ?? 0} tone={pendingLeave ? "warn" : undefined} hint={<Link className="text-brand" href="/guru/izin">Tinjau</Link>} />
        <Stat label="Kelompok menunggu" value={pendingGroups ?? 0} tone={pendingGroups ? "warn" : undefined} hint={<Link className="text-brand" href="/guru/kelompok">Verifikasi</Link>} />
        <Stat label="Tugas belum dinilai" value={toGrade?.length ?? 0} hint={<Link className="text-brand" href="/guru/tugas">Nilai</Link>} />
        <Stat label="Arahan baru" value={newDirectives ?? 0} tone={newDirectives ? "warn" : undefined} hint={<Link className="text-brand" href="/pegawai/arahan">Lihat</Link>} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Jadwal ${HARI[isoDow]}`}>
          {!schedule?.length ? <Empty>Tidak ada jadwal mengajar hari ini.</Empty> : (
            <ul className="divide-y divide-line">
              {schedule.map((s) => {
                const t = byTa.get(s.teaching_assignment_id)!;
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <div className="font-semibold text-ink">{t.subjects.name} · {t.classes.name}</div>
                      <div className="text-xs text-muted tabular-nums">{jam(s.starts_at)}–{jam(s.ends_at)}{s.room ? ` · ${s.room}` : ""}</div>
                    </div>
                    <Link href={`/guru/absensi?kelas=${t.class_id}`} className="text-sm font-semibold text-brand">Absensi</Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Kelas yang saya ajar">
          {!teaching.length ? <Empty>Belum ada mapel yang ditugaskan. Hubungi admin sekolah.</Empty> : (
            <ul className="divide-y divide-line">
              {teaching.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-semibold text-ink">{t.subjects.name}</div>
                    <div className="text-xs text-muted">Kelas {t.classes.name}{t.classes.homeroom_teacher_id === user.id ? " · Wali kelas" : ""}</div>
                  </div>
                  <Link href={`/guru/tugas?mapel=${t.id}`} className="text-sm font-semibold text-brand">Tugas</Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
