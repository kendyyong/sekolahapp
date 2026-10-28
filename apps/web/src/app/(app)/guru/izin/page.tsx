import { requireRole } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { tanggal, waktu } from "@/lib/format";
import { signedUrl } from "@/lib/queries";
import { Badge, Button, Empty, Flash, PageHeader, StatusBadge, Tabs, Textarea } from "@/components/ui";

async function review(fd: FormData) {
  "use server";
  const approve = str(fd, "decision") === "approve";
  await run("/guru/izin", approve ? "Izin disetujui. Absensi diperbarui otomatis." : "Izin ditolak.", (sb) =>
    sb.rpc("review_student_leave", { p_id: str(fd, "id"), p_approve: approve, p_note: optStr(fd, "note") }));
}

export default async function StudentLeaveReview({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireRole("teacher");
  const status = sp.status ?? "pending";

  // Kelas yang diwalikan guru ini.
  const { data: homeroom } = await supabase.from("classes").select("id, name, enrollments(student_id), academic_years!inner(is_active)")
    .eq("homeroom_teacher_id", user.id).eq("school_id", schoolId).eq("academic_years.is_active", true);
  const studentIds = (homeroom ?? []).flatMap((c: any) => (c.enrollments ?? []).map((e: any) => e.student_id));

  const { data: requests } = studentIds.length
    ? await supabase.from("student_leave_requests")
        .select("id, kind, starts_on, ends_on, reason, attachment_path, status, created_at, review_note, students(full_name), profiles:requested_by(full_name)")
        .in("student_id", studentIds).eq("status", status).order("created_at", { ascending: false }).limit(100)
    : { data: [] };
  const withUrls = await Promise.all((requests ?? []).map(async (r: any) => ({ ...r, url: await signedUrl(supabase, "leave-letters", r.attachment_path) })));

  return (
    <>
      <PageHeader title="Izin Murid" subtitle={homeroom?.length ? `Wali kelas ${homeroom.map((c) => c.name).join(", ")}` : "Anda belum menjadi wali kelas."} />
      <Flash searchParams={sp} />
      <Tabs active={status} items={[
        { key: "pending", label: "Menunggu", href: "/guru/izin?status=pending" },
        { key: "approved", label: "Disetujui", href: "/guru/izin?status=approved" },
        { key: "rejected", label: "Ditolak", href: "/guru/izin?status=rejected" },
      ]} />
      {!withUrls.length ? <Empty>Tidak ada pengajuan pada status ini.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {withUrls.map((r) => (
            <article key={r.id} className="flex flex-col gap-3 rounded-lg border border-line bg-sheet p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-ink">{r.students?.full_name}</h2>
                  <div className="text-xs text-muted">Diajukan {r.profiles?.full_name} · {waktu(r.created_at)}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="info">{r.kind === "sakit" ? "Sakit" : "Izin"}</Badge>
                <span className="font-semibold">{tanggal(r.starts_on)}{r.ends_on !== r.starts_on ? ` – ${tanggal(r.ends_on)}` : ""}</span>
              </div>
              <p className="text-sm">{r.reason}</p>
              {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand underline">Lihat surat (PDF/foto)</a>
                : <span className="text-xs text-muted">Tanpa surat</span>}
              {r.review_note && <p className="text-sm text-muted">Catatan: {r.review_note}</p>}
              {r.status === "pending" && (
                <form action={review} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <Textarea name="note" rows={2} placeholder="Catatan (wajib bila menolak)" aria-label="Catatan" />
                  <div className="flex gap-2">
                    <Button name="decision" value="approve">Setujui</Button>
                    <Button name="decision" value="reject" variant="secondary">Tolak</Button>
                  </div>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
