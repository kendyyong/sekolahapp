import Link from "next/link";
import { requirePlatform } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal, waktu } from "@/lib/format";
import { Badge, Button, Card, Empty, Flash, Input, PageHeader, Stat, Table } from "@/components/ui";
import { PLAN_LABEL, PLAN_TONE } from "./plans";

async function review(fd: FormData) {
  "use server";
  await requirePlatform();
  const approve = str(fd, "decision") === "approve";
  await run("/platform", approve ? "Paket sekolah diubah." : "Pengajuan ditolak.", (sb) =>
    sb.rpc("review_plan_change", { p_id: str(fd, "id"), p_approve: approve, p_note: optStr(fd, "note") }));
}

export default async function PlatformHome({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatform();
  const [{ data: o }, { data: requests }, { data: schools }] = await Promise.all([
    supabase.rpc("platform_overview"),
    supabase.from("plan_change_requests").select("id, from_tier, to_tier, note, created_at, schools(name), profiles:requested_by(full_name)")
      .eq("status", "pending").order("created_at"),
    supabase.rpc("platform_schools"),
  ]);
  const ov = (o ?? {}) as Record<string, any>;
  const newest = ((schools ?? []) as any[]).slice(0, 6);

  return (
    <>
      <PageHeader title="Ringkasan Platform" subtitle="Pendapatan langganan, sekolah, dan pengajuan yang perlu ditindaklanjuti." />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Pendapatan bulanan" value={rupiah(ov.mrr)} hint="perkiraan dari murid aktif" tone="good" />
        <Stat label="Sekolah aktif" value={ov.schools_active ?? 0} hint={`${ov.schools_new_30d ?? 0} baru dalam 30 hari`} />
        <Stat label="Murid aktif" value={Number(ov.students_active ?? 0).toLocaleString("id-ID")} />
        <Stat label="Terpotong bulan ini" value={rupiah(ov.fees_this_month)} hint="dari pembayaran online" />
        <Stat label="Tagihan terbuka" value={rupiah(ov.open_bills)} tone={ov.open_bills ? "warn" : undefined} hint={<Link href="/platform/tagihan" className="text-brand">Lihat</Link>} />
        <Stat label="Pengajuan paket" value={ov.pending_plan_requests ?? 0} tone={ov.pending_plan_requests ? "warn" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Pengajuan ganti paket">
            {!requests?.length ? <Empty>Tidak ada pengajuan yang menunggu.</Empty> : (
              <ul className="divide-y divide-line">
                {(requests as any[]).map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>{r.schools?.name}</b>
                      <Badge tone={PLAN_TONE[r.from_tier as keyof typeof PLAN_TONE]}>{PLAN_LABEL[r.from_tier]}</Badge>→
                      <Badge tone={PLAN_TONE[r.to_tier as keyof typeof PLAN_TONE]}>{PLAN_LABEL[r.to_tier]}</Badge>
                      <span className="text-xs text-muted">oleh {r.profiles?.full_name} · {waktu(r.created_at)}</span>
                    </div>
                    {r.note && <p className="text-sm text-muted">“{r.note}”</p>}
                    <form action={review} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <Input name="note" placeholder="Catatan untuk sekolah (opsional)" aria-label="Catatan" className="min-w-0 flex-1" />
                      <Button name="decision" value="approve">Setujui</Button>
                      <Button name="decision" value="reject" variant="secondary">Tolak</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Sekolah terbaru" actions={<Link href="/platform/sekolah" className="text-sm font-semibold text-brand">Semua</Link>}>
            <Table head={["Sekolah", "Paket", "Murid", "Pembayaran", "Terdaftar"]} empty="Belum ada sekolah.">
              {newest.map((s) => (
                <tr key={s.id}>
                  <td><Link href={`/platform/sekolah?id=${s.id}`} className="font-semibold text-brand">{s.name}</Link><div className="text-xs text-muted">{s.admin_email ?? "–"}</div></td>
                  <td><Badge tone={PLAN_TONE[s.plan as keyof typeof PLAN_TONE]}>{PLAN_LABEL[s.plan]}</Badge></td>
                  <td className="tabular-nums">{s.students}</td>
                  <td>{s.payment_status === "live" ? <Badge tone="good">Aktif</Badge> : <Badge>Belum</Badge>}</td>
                  <td className="whitespace-nowrap">{tanggal(s.created_at)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <Card title="Sekolah per paket" className="h-fit">
          <ul className="flex flex-col gap-2 text-sm">
            {["free", "basic", "pro", "enterprise"].map((t) => (
              <li key={t} className="flex items-center justify-between">
                <Badge tone={PLAN_TONE[t as keyof typeof PLAN_TONE]}>{PLAN_LABEL[t]}</Badge>
                <b className="tabular-nums">{ov.by_plan?.[t] ?? 0}</b>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            {ov.payments_pending_setup ?? 0} sekolah aktif belum mengaktifkan pembayaran online. Biaya langganan mereka ditagih lewat tagihan bulanan.
          </p>
        </Card>
      </div>
    </>
  );
}
