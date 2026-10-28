import Link from "next/link";
import { requireRole } from "@/lib/session";
import { rupiah, tanggal, todayJakarta, waktu } from "@/lib/format";
import { myChildren } from "@/lib/queries";
import { Badge, Card, Empty, LinkButton, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { ChildTabs, pickChild } from "./child-tabs";

export default async function GuardianHome({ searchParams }: { searchParams: Promise<{ anak?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireRole("guardian");
  const children = await myChildren(supabase, user.id, schoolId);
  const child = pickChild(children, sp.anak);
  if (!child) return (<><PageHeader title="Beranda" /><Empty>Akun Anda belum ditautkan ke data murid. Hubungi admin sekolah.</Empty></>);

  const today = todayJakarta();
  const monthStart = today.slice(0, 8) + "01";
  const [{ data: att }, { data: grades }, { data: invoices }, { data: behavior }, { data: leaves }, { data: news }] = await Promise.all([
    supabase.from("student_attendance").select("date, status").eq("student_id", child.id).is("teaching_assignment_id", null)
      .gte("date", monthStart).order("date", { ascending: false }),
    supabase.from("submissions").select("id, score, graded_at, assignments(title, max_score, teaching_assignments(subjects(name)))")
      .eq("student_id", child.id).not("score", "is", null).order("graded_at", { ascending: false }).limit(6),
    supabase.from("invoices").select("id, title, due_on, total, paid_amount, status").eq("student_id", child.id).in("status", ["unpaid", "partial"]).order("due_on"),
    supabase.from("behavior_records").select("id, kind, points, description, occurred_on").eq("student_id", child.id).order("occurred_on", { ascending: false }).limit(6),
    supabase.from("student_leave_requests").select("id").eq("student_id", child.id).eq("status", "pending"),
    supabase.from("announcements").select("id, title, published_at").eq("school_id", schoolId).order("published_at", { ascending: false }).limit(4),
  ]);
  const count = (...s: string[]) => (att ?? []).filter((a) => s.includes(a.status)).length;
  const todayRow = att?.find((a) => a.date === today);
  const owed = (invoices ?? []).reduce((n, i) => n + Number(i.total) - Number(i.paid_amount), 0);

  return (
    <>
      <PageHeader title={child.full_name} subtitle={`${child.class ? `Kelas ${child.class.name}` : "Belum terdaftar di kelas"} · ${tanggal(today, true)}`}
        actions={<LinkButton href={`/ortu/izin?anak=${child.id}`}>Ajukan izin</LinkButton>} />
      <ChildTabs items={children} active={child.id} base="/ortu" />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Hari ini" value={todayRow ? <StatusBadge status={todayRow.status} /> : "Belum absen"} />
        <Stat label="Hadir bulan ini" value={count("hadir", "terlambat")} hint={count("terlambat") ? `${count("terlambat")} kali terlambat` : undefined} />
        <Stat label="Izin / Sakit / Alpa" value={`${count("izin")} / ${count("sakit")} / ${count("alpa")}`} tone={count("alpa") ? "bad" : undefined} />
        <Stat label="Tagihan belum lunas" value={rupiah(owed)} tone={owed ? "warn" : "good"}
          hint={owed ? <Link href={`/ortu/tagihan?anak=${child.id}`} className="text-brand">Bayar</Link> : "Semua lunas"} />
      </div>
      {!!leaves?.length && <p className="mb-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{leaves.length} pengajuan izin menunggu persetujuan wali kelas.</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Nilai terbaru">
          {!grades?.length ? <Empty>Belum ada nilai.</Empty> : (
            <ul className="divide-y divide-line">
              {grades.map((g: any) => (
                <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div><div className="font-semibold">{g.assignments?.title}</div>
                    <div className="text-xs text-muted">{g.assignments?.teaching_assignments?.subjects?.name} · {waktu(g.graded_at)}</div></div>
                  <b className="tabular-nums">{g.score}<span className="text-xs font-normal text-muted">/{g.assignments?.max_score}</span></b>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Prestasi & catatan sikap">
          {!behavior?.length ? <Empty>Belum ada catatan.</Empty> : (
            <ul className="divide-y divide-line">
              {behavior.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div><div className="text-sm">{b.description}</div><div className="text-xs text-muted">{tanggal(b.occurred_on)}</div></div>
                  <Badge tone={b.kind === "prestasi" ? "good" : "bad"}>{b.kind === "prestasi" ? "Prestasi" : "Pelanggaran"} · {b.points}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Absen bulan ini">
          {!att?.length ? <Empty>Belum ada data absen bulan ini.</Empty> : (
            <ul className="flex flex-wrap gap-1.5">
              {[...att].reverse().map((a) => (
                <li key={a.date} title={tanggal(a.date)} className="flex flex-col items-center gap-1 text-[11px] text-muted">
                  <StatusBadge status={a.status} />{a.date.slice(8)}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Pengumuman sekolah" actions={<Link href="/pengumuman" className="text-sm font-semibold text-brand">Semua</Link>}>
          {!news?.length ? <Empty>Belum ada pengumuman.</Empty> : (
            <ul className="divide-y divide-line">
              {news.map((n) => <li key={n.id} className="py-2.5"><div className="font-semibold">{n.title}</div><div className="text-xs text-muted">{waktu(n.published_at)}</div></li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
