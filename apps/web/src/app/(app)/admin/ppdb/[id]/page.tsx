import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { FEE_LABEL, gradeLabel, PPDB_STATUS, PPDB_TONE, type AdmissionStatus } from "@/lib/ppdb";
import { rupiah, tanggal, waktu } from "@/lib/format";
import { Badge, Card, DownloadLink, Flash, PageHeader, Stat, Table, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PeriodFields, periodFromForm, type Period } from "../period-form";

const DECISION_LABEL: Record<string, string> = { accepted: "Diterima", waitlisted: "Cadangan", rejected: "Tidak diterima" };

async function savePeriod(fd: FormData) {
  "use server";
  await requireModule("ppdb", "school_admin");
  const id = str(fd, "id");
  await run(`/admin/ppdb/${id}`, "Gelombang disimpan.", (sb) => sb.from("admission_periods").update(periodFromForm(fd)).eq("id", id));
}

async function deletePeriod(fd: FormData) {
  "use server";
  await requireModule("ppdb", "school_admin");
  const id = str(fd, "id");
  await run(`/admin/ppdb/${id}`, "Gelombang dihapus.", async (sb) => {
    const { count } = await sb.from("admission_applications").select("id", { count: "exact", head: true }).eq("period_id", id);
    if (count) throw new Error("Gelombang yang sudah punya pendaftar tidak bisa dihapus. Sembunyikan dari halaman publik saja.");
    return sb.from("admission_periods").delete().eq("id", id);
  }, () => "/admin/ppdb");
}

async function announce(fd: FormData) {
  "use server";
  await requireModule("ppdb", "school_admin");
  const id = str(fd, "id");
  await run(`/admin/ppdb/${id}`, "Hasil seleksi diumumkan ke pendaftar.", (sb) => sb.rpc("ppdb_announce", { p_period: id }));
}

interface Row {
  id: string; number: string | null; full_name: string; gender: string | null; birth_date: string | null; previous_school: string | null;
  status: AdmissionStatus; fee_status: string; submitted_at: string | null;
  admission_reviews: { decision: string | null; score: number | null } | null;
}

const TABS: { key: string; label: string; statuses: AdmissionStatus[] }[] = [
  { key: "semua", label: "Semua", statuses: ["submitted", "verified", "accepted", "waitlisted", "rejected", "enrolled", "withdrawn"] },
  { key: "cek", label: "Perlu dicek", statuses: ["submitted"] },
  { key: "seleksi", label: "Terverifikasi", statuses: ["verified"] },
  { key: "diterima", label: "Diterima", statuses: ["accepted", "enrolled"] },
  { key: "cadangan", label: "Cadangan", statuses: ["waitlisted"] },
  { key: "ditolak", label: "Tidak diterima", statuses: ["rejected"] },
  { key: "draf", label: "Draf", statuses: ["draft"] },
];

export default async function PeriodDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; ok?: string; err?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, schoolId, active } = await requireModule("ppdb", "school_admin", "principal", "finance");
  const isAdmin = active.role === "school_admin";
  const [{ data: period }, { data: apps }, { data: school }] = await Promise.all([
    supabase.from("admission_periods").select("*").eq("id", id).eq("school_id", schoolId).maybeSingle(),
    supabase.from("admission_applications")
      .select("id, number, full_name, gender, birth_date, previous_school, status, fee_status, submitted_at, admission_reviews(decision, score)")
      .eq("period_id", id).order("number", { nullsFirst: false }).order("created_at"),
    supabase.from("schools").select("level").eq("id", schoolId).single(),
  ]);
  if (!period) notFound();
  const p = period as Period;
  const all = (apps ?? []) as unknown as Row[];
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const rows = all.filter((a) => tab.statuses.includes(a.status));
  const count = (...st: AdmissionStatus[]) => all.filter((a) => st.includes(a.status)).length;
  const verified = all.filter((a) => a.status === "verified");
  const undecided = verified.filter((a) => !a.admission_reviews?.decision).length;
  const plannedAccept = verified.filter((a) => a.admission_reviews?.decision === "accepted").length;

  return (
    <>
      <Link href="/admin/ppdb" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft aria-hidden className="size-4" />PPDB Online</Link>
      <PageHeader title={p.title} subtitle={`${gradeLabel(p.grade_level)} · Tahun ajaran ${p.school_year} · ${tanggal(p.opens_on)} – ${tanggal(p.closes_on)}`}
        actions={<DownloadLink href={`/unduh/ppdb?periode=${p.id}`}>Unduh Excel</DownloadLink>} />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Formulir terkirim" value={count("submitted", "verified", "accepted", "waitlisted", "rejected", "enrolled")} hint={`${count("draft")} masih draf`} />
        <Stat label="Perlu dicek" value={count("submitted")} tone={count("submitted") ? "warn" : undefined} />
        <Stat label="Diterima" value={count("accepted", "enrolled")} hint={p.quota ? `kuota ${p.quota}` : "tanpa kuota"} tone="good" />
        <Stat label="Sudah jadi murid" value={count("enrolled")} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <Tabs active={tab.key} items={TABS.map((t) => ({ key: t.key, label: `${t.label} (${count(...t.statuses)})`, href: `/admin/ppdb/${p.id}?tab=${t.key}` }))} />
          <Table head={["No. daftar", "Nama", "Asal sekolah", "Biaya", "Status", "Keputusan"]} empty="Tidak ada pendaftar di sini.">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap font-mono text-xs">{a.number ?? "–"}</td>
                <td>
                  <Link href={`/admin/ppdb/pendaftar/${a.id}`} className="font-semibold text-brand">{a.full_name}</Link>
                  <div className="text-xs text-muted">{[a.gender, a.birth_date && tanggal(a.birth_date), a.submitted_at && `dikirim ${waktu(a.submitted_at)}`].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="text-sm">{a.previous_school ?? "–"}</td>
                <td><Badge tone={a.fee_status === "unpaid" ? (p.fee_amount ? "warn" : "neutral") : "good"}>{p.fee_amount ? FEE_LABEL[a.fee_status] : "Gratis"}</Badge></td>
                <td><Badge tone={PPDB_TONE[a.status]}>{PPDB_STATUS[a.status]}</Badge></td>
                <td className="whitespace-nowrap text-sm">
                  {a.admission_reviews?.decision ? DECISION_LABEL[a.admission_reviews.decision] : "–"}
                  {a.admission_reviews?.score != null && <span className="text-muted"> · {a.admission_reviews.score}</span>}
                </td>
              </tr>
            ))}
          </Table>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Pengumuman hasil">
            {p.announced_at ? (
              <p className="text-sm text-muted">Hasil diumumkan {waktu(p.announced_at)}. Keputusan yang diubah sesudahnya langsung terlihat pendaftar.</p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Keputusan seleksi baru terlihat pendaftar setelah diumumkan. Saat ini {plannedAccept} akan diterima
                  {p.quota ? ` dari kuota ${p.quota}` : ""}{undecided ? `, ${undecided} pendaftar terverifikasi belum diberi keputusan` : ""}.
                </p>
                {isAdmin && (
                  <form action={announce} className="mt-4">
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton disabled={verified.length === 0} pendingLabel="Mengumumkan…">Umumkan hasil</SubmitButton>
                  </form>
                )}
              </>
            )}
          </Card>
          {isAdmin ? (
            <Card title="Pengaturan gelombang">
              <form action={savePeriod} className="flex flex-col gap-4">
                <input type="hidden" name="id" value={p.id} />
                <PeriodFields p={p} level={school?.level} />
                <SubmitButton pendingLabel="Menyimpan…">Simpan</SubmitButton>
              </form>
              {all.length === 0 && (
                <form action={deletePeriod} className="mt-3">
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton variant="ghost" className="-ml-3 text-bad hover:bg-bad-soft">Hapus gelombang</SubmitButton>
                </form>
              )}
            </Card>
          ) : (
            <Card title="Ringkasan gelombang">
              <p className="text-sm text-muted">Biaya pendaftaran {p.fee_amount ? rupiah(p.fee_amount) : "gratis"}. Berkas wajib: {p.documents.join(", ")}.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
