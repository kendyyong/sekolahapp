import { requireModule } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { tanggal, waktu } from "@/lib/format";
import { signedUrl } from "@/lib/queries";
import { Badge, Button, Empty, Flash, PageHeader, StatusBadge, Tabs, Textarea } from "@/components/ui";

const LEAVE_KIND: Record<string, string> = {
  tahunan: "Cuti tahunan", sakit: "Sakit", melahirkan: "Melahirkan", alasan_penting: "Alasan penting", dinas: "Dinas luar",
};

async function review(fd: FormData) {
  "use server";
  const approve = str(fd, "decision") === "approve";
  await run("/kepsek/cuti", approve ? "Cuti disetujui." : "Cuti ditolak.", (sb) =>
    sb.rpc("review_staff_leave", { p_id: str(fd, "id"), p_approve: approve, p_note: optStr(fd, "note") }));
}

export default async function StaffLeaveApprovals({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireModule("staff", "principal");
  const status = sp.status ?? "pending";
  const { data } = await supabase.from("staff_leave_requests")
    .select("id, user_id, kind, starts_on, ends_on, reason, attachment_path, status, review_note, created_at, requester:user_id(full_name), substitute:substitute_id(full_name)")
    .eq("school_id", schoolId).eq("status", status).order("created_at", { ascending: status === "pending" }).limit(100);

  const rows = await Promise.all((data ?? []).map(async (r: any) => {
    const [{ data: bal }, url] = await Promise.all([
      supabase.rpc("staff_leave_balance", { p_school: schoolId, p_user: r.user_id }),
      signedUrl(supabase, "staff-files", r.attachment_path),
    ]);
    return { ...r, balance: (bal as any[])?.[0], url };
  }));

  return (
    <>
      <PageHeader title="Persetujuan Cuti" subtitle="Cuti guru dan pegawai. Saat disetujui, absensi dan guru pengganti diatur otomatis." />
      <Flash searchParams={sp} />
      <Tabs active={status} items={[
        { key: "pending", label: "Menunggu", href: "/kepsek/cuti?status=pending" },
        { key: "approved", label: "Disetujui", href: "/kepsek/cuti?status=approved" },
        { key: "rejected", label: "Ditolak", href: "/kepsek/cuti?status=rejected" },
      ]} />
      {!rows.length ? <Empty>Tidak ada pengajuan pada status ini.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <article key={r.id} className="flex flex-col gap-3 rounded-lg border border-line bg-sheet p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-ink">{r.requester?.full_name}</h2>
                  <div className="text-xs text-muted">Diajukan {waktu(r.created_at)}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="info">{LEAVE_KIND[r.kind]}</Badge>
                <b>{tanggal(r.starts_on)} – {tanggal(r.ends_on)}</b>
              </div>
              <p className="text-sm">{r.reason}</p>
              <div className="text-xs text-muted">
                Pengganti: {r.substitute?.full_name ?? "belum ditunjuk"}
                {r.balance && ` · Sisa cuti tahunan ${r.balance.remaining} dari ${r.balance.quota} hari`}
              </div>
              {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand underline">Lihat lampiran</a>}
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
