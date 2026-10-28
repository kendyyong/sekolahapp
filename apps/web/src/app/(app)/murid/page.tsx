import Link from "next/link";
import { requireRole } from "@/lib/session";
import { HARI, jam, tanggal, todayJakarta, waktu } from "@/lib/format";
import { myStudent } from "@/lib/queries";
import { Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";

export default async function StudentHome() {
  const { supabase, user, schoolId } = await requireRole("student");
  const me = await myStudent(supabase, user.id, schoolId);
  if (!me?.class) return (<><PageHeader title="Beranda" /><Empty>Akun Anda belum terdaftar di kelas. Hubungi admin sekolah.</Empty></>);

  const today = todayJakarta();
  const isoDow = ((new Date(today + "T12:00:00+07:00").getDay() + 6) % 7) + 1;
  const { data: tas } = await supabase.from("teaching_assignments").select("id, meeting_url, subjects(name), profiles:teacher_id(full_name)").eq("class_id", me.class.id);
  const taIds = (tas ?? []).map((t) => t.id);
  const byTa = new Map(((tas ?? []) as any[]).map((t) => [t.id, t]));

  const [{ data: schedule }, { data: todayAtt }, { data: assignments }, { data: subs }, { data: sessions }, { data: monthAtt }] = await Promise.all([
    supabase.from("schedules").select("id, starts_at, ends_at, room, teaching_assignment_id").in("teaching_assignment_id", taIds).eq("day_of_week", isoDow).order("starts_at"),
    supabase.from("student_attendance").select("status, checked_in_at").eq("student_id", me.id).eq("date", today).is("teaching_assignment_id", null).maybeSingle(),
    supabase.from("assignments").select("id, title, due_at, teaching_assignment_id").in("teaching_assignment_id", taIds)
      .gte("due_at", new Date().toISOString()).order("due_at").limit(8),
    supabase.from("submissions").select("assignment_id").eq("student_id", me.id),
    supabase.from("online_sessions").select("id, title, starts_at, url, teaching_assignment_id").in("teaching_assignment_id", taIds)
      .gte("starts_at", new Date(Date.now() - 2 * 3600_000).toISOString()).order("starts_at").limit(5),
    supabase.from("student_attendance").select("status").eq("student_id", me.id).is("teaching_assignment_id", null).gte("date", today.slice(0, 8) + "01"),
  ]);
  const done = new Set((subs ?? []).map((s) => s.assignment_id));
  const count = (s: string) => (monthAtt ?? []).filter((a) => a.status === s).length;

  return (
    <>
      <PageHeader title={`Halo, ${me.full_name.split(" ")[0]}`} subtitle={`Kelas ${me.class.name} · ${tanggal(today, true)}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Absen hari ini" value={todayAtt ? <StatusBadge status={todayAtt.status} /> : "Belum"} hint={!todayAtt && <Link href="/murid/absen" className="text-brand">Absen sekarang</Link>} />
        <Stat label="Hadir bulan ini" value={count("hadir") + count("terlambat")} />
        <Stat label="Izin/Sakit" value={count("izin") + count("sakit")} />
        <Stat label="Alpa" value={count("alpa")} tone={count("alpa") ? "bad" : undefined} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Jadwal ${HARI[isoDow]}`}>
          {!schedule?.length ? <Empty>Tidak ada pelajaran hari ini.</Empty> : (
            <ul className="divide-y divide-line">
              {schedule.map((s) => {
                const t = byTa.get(s.teaching_assignment_id);
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <div className="font-semibold">{t?.subjects?.name}</div>
                      <div className="text-xs text-muted tabular-nums">{jam(s.starts_at)}–{jam(s.ends_at)} · {t?.profiles?.full_name}{s.room ? ` · ${s.room}` : ""}</div>
                    </div>
                    {t?.meeting_url && <a href={t.meeting_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand">Kelas online</a>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Tugas mendatang" actions={<Link href="/murid/tugas" className="text-sm font-semibold text-brand">Semua</Link>}>
          {!assignments?.length ? <Empty>Tidak ada tugas dengan tenggat dekat.</Empty> : (
            <ul className="divide-y divide-line">
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs text-muted">{byTa.get(a.teaching_assignment_id)?.subjects?.name} · Tenggat {waktu(a.due_at)}</div>
                  </div>
                  {done.has(a.id) ? <StatusBadge status="selesai" /> : <Link href={`/murid/tugas?id=${a.id}`} className="text-sm font-semibold text-brand">Kerjakan</Link>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {!!sessions?.length && (
          <Card title="Kelas online terjadwal">
            <ul className="divide-y divide-line">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div><div className="font-semibold">{s.title}</div><div className="text-xs text-muted">{byTa.get(s.teaching_assignment_id)?.subjects?.name} · {waktu(s.starts_at)}</div></div>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand">Gabung</a>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
