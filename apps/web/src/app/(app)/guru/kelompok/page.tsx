import { requireRole } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { waktu } from "@/lib/format";
import { Badge, Button, Empty, Flash, PageHeader, StatusBadge, Tabs, Textarea } from "@/components/ui";

const POSITION: Record<string, string> = { ketua: "Ketua", sekretaris: "Sekretaris", bendahara: "Bendahara", anggota: "Anggota" };
const ORDER = ["ketua", "sekretaris", "bendahara", "anggota"];

async function review(fd: FormData) {
  "use server";
  const decision = str(fd, "decision");
  const label = decision === "verified" ? "diverifikasi" : decision === "revision" ? "dikembalikan untuk perbaikan" : "ditolak";
  await run("/guru/kelompok", `Kelompok ${label}.`, (sb) =>
    sb.rpc("review_work_group", { p_group: str(fd, "group_id"), p_decision: decision, p_note: optStr(fd, "note") }));
}

export default async function GroupVerification({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId, user } = await requireRole("teacher");
  const status = sp.status ?? "pending";

  const { data: groups } = await supabase.from("work_groups")
    .select(`id, name, status, submitted_at, review_note, class_id, created_at,
      classes(name, homeroom_teacher_id), teaching_assignments(teacher_id, subjects(name)), assignments(title),
      work_group_members(position, invite_status, students(full_name))`)
    .eq("school_id", schoolId).eq("status", status).order("submitted_at", { ascending: true }).limit(100);

  // Hanya kelompok yang menjadi wewenang guru ini: guru mapelnya, atau wali kelas bila tanpa mapel.
  const mine = (groups ?? []).filter((g: any) =>
    g.teaching_assignments ? g.teaching_assignments.teacher_id === user.id : g.classes?.homeroom_teacher_id === user.id);

  return (
    <>
      <PageHeader title="Verifikasi Kelompok Kerja" subtitle="Periksa susunan Ketua, Sekretaris, Bendahara, dan Anggota sebelum kelompok bisa mengerjakan tugas." />
      <Flash searchParams={sp} />
      <Tabs active={status} items={[
        { key: "pending", label: "Menunggu", href: "/guru/kelompok?status=pending" },
        { key: "verified", label: "Terverifikasi", href: "/guru/kelompok?status=verified" },
        { key: "revision", label: "Perlu perbaikan", href: "/guru/kelompok?status=revision" },
        { key: "rejected", label: "Ditolak", href: "/guru/kelompok?status=rejected" },
      ]} />
      {!mine.length ? <Empty>Tidak ada kelompok pada status ini.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {mine.map((g: any) => {
            const members = [...(g.work_group_members ?? [])].sort((a: any, b: any) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position));
            return (
              <article key={g.id} className="flex flex-col gap-3 rounded-lg border border-line bg-sheet p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-ink">{g.name}</h2>
                    <div className="text-xs text-muted">
                      Kelas {g.classes?.name}{g.teaching_assignments ? ` · ${g.teaching_assignments.subjects.name}` : ""}
                      {g.assignments ? ` · ${g.assignments.title}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={g.status} />
                </div>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {members.map((m: any, i: number) => (
                    <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-semibold">{m.students?.full_name}</span>
                      <span className="flex gap-1">
                        <Badge tone={m.position === "anggota" ? "neutral" : "info"}>{POSITION[m.position]}</Badge>
                        {m.invite_status !== "accepted" && <StatusBadge status={m.invite_status} />}
                      </span>
                    </li>
                  ))}
                </ul>
                {g.submitted_at && <div className="text-xs text-muted">Diajukan {waktu(g.submitted_at)}</div>}
                {g.review_note && <div className="text-sm text-muted">Catatan: {g.review_note}</div>}
                {g.status === "pending" && (
                  <form action={review} className="flex flex-col gap-2">
                    <input type="hidden" name="group_id" value={g.id} />
                    <Textarea name="note" rows={2} placeholder="Catatan untuk kelompok (wajib bila perlu perbaikan/ditolak)" aria-label="Catatan" />
                    <div className="flex flex-wrap gap-2">
                      <Button name="decision" value="verified">Verifikasi</Button>
                      <Button name="decision" value="revision" variant="secondary">Minta perbaikan</Button>
                      <Button name="decision" value="rejected" variant="ghost">Tolak</Button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
