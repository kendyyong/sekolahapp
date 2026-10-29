import Link from "next/link";
import { headers } from "next/headers";
import { ExternalLink } from "lucide-react";
import { requireModule } from "@/lib/session";
import { run } from "@/lib/actions";
import { gradeLabel } from "@/lib/ppdb";
import { rupiah, tanggal, todayJakarta } from "@/lib/format";
import { Badge, Card, Empty, Flash, PageHeader, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PeriodFields, periodFromForm, type Period } from "./period-form";

async function createPeriod(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("ppdb", "school_admin");
  let id = "";
  await run("/admin/ppdb", "Gelombang PPDB dibuat.", async (sb) => {
    const { data, error } = await sb.from("admission_periods").insert({ school_id: schoolId, ...periodFromForm(fd) }).select("id").single();
    if (error) return { error };
    id = data.id;
  }, () => `/admin/ppdb/${id}`);
}

function periodBadge(p: Period) {
  const today = todayJakarta();
  if (!p.is_published) return <Badge>Belum tampil</Badge>;
  if (p.announced_at) return <Badge tone="info">Hasil diumumkan</Badge>;
  if (today < p.opens_on) return <Badge tone="info">Belum dibuka</Badge>;
  if (today > p.closes_on) return <Badge tone="neutral">Ditutup</Badge>;
  return <Badge tone="good">Dibuka</Badge>;
}

export default async function PpdbAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId, active, brand } = await requireModule("ppdb", "school_admin", "principal", "finance");
  const isAdmin = active.role === "school_admin";
  const [{ data: periods }, { data: school }] = await Promise.all([
    supabase.from("admission_periods").select("*, admission_applications(status)").eq("school_id", schoolId).order("opens_on", { ascending: false }),
    supabase.from("schools").select("slug, level").eq("id", schoolId).single(),
  ]);
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const slug = school?.slug ?? brand?.slug;
  const publicUrl = `${origin}/ppdb/${slug}`;
  const rows = ((periods ?? []) as (Period & { admission_applications: { status: string }[] })[]).map((p) => {
    const apps = p.admission_applications;
    const count = (...st: string[]) => apps.filter((a) => st.includes(a.status)).length;
    return { ...p, sent: count("submitted", "verified", "accepted", "waitlisted", "rejected", "enrolled"), waiting: count("submitted"),
      accepted: count("accepted", "enrolled"), drafts: count("draft") };
  });

  return (
    <>
      <PageHeader title="PPDB Online" subtitle="Penerimaan murid baru: gelombang pendaftaran, verifikasi berkas, seleksi, dan daftar ulang."
        actions={<Link href={`/ppdb/${slug}`} target="_blank" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">Halaman publik<ExternalLink aria-hidden className="size-4" /></Link>} />
      <Flash searchParams={sp} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Tautan pendaftaran">
            <p className="text-sm text-muted">Bagikan tautan ini di media sosial, situs sekolah, atau grup WhatsApp. Orang tua mendaftar dan memantau hasil dari sini.</p>
            <p className="mt-3 break-all rounded-lg bg-paper px-3 py-2 font-mono text-sm text-ink ring-1 ring-line">{publicUrl}</p>
          </Card>
          {rows.length === 0 ? <Empty>Belum ada gelombang pendaftaran.</Empty> : (
            <Table head={["Gelombang", "Jadwal", "Biaya", "Pendaftar", "Perlu dicek", "Diterima", "Status"]}>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/ppdb/${p.id}`} className="font-semibold text-brand">{p.title}</Link>
                    <div className="text-xs text-muted">{gradeLabel(p.grade_level)} · {p.school_year}</div>
                  </td>
                  <td className="whitespace-nowrap text-sm">{tanggal(p.opens_on)} – {tanggal(p.closes_on)}</td>
                  <td className="whitespace-nowrap tabular-nums">{p.fee_amount ? rupiah(p.fee_amount) : "Gratis"}</td>
                  <td className="tabular-nums">{p.sent}{p.drafts > 0 && <span className="text-xs text-muted"> +{p.drafts} draf</span>}</td>
                  <td className="tabular-nums">{p.waiting > 0 ? <Badge tone="warn">{p.waiting}</Badge> : "0"}</td>
                  <td className="tabular-nums">{p.accepted}{p.quota ? ` / ${p.quota}` : ""}</td>
                  <td>{periodBadge(p)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        {isAdmin && (
          <Card title="Buka gelombang baru">
            <form action={createPeriod} className="flex flex-col gap-4">
              <PeriodFields level={school?.level} />
              <SubmitButton pendingLabel="Menyimpan…">Buat gelombang</SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
