import { requireRole } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal, waktu } from "@/lib/format";
import { Badge, Button, Card, Empty, Field, Flash, PageHeader, Stat, StatusBadge, Table, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PAYMENT_LABEL, PLAN_LABEL } from "../../platform/plans";

const MODULE_LABEL: Record<string, string> = {
  core: "Absensi, tugas, izin, pengumuman, pesan", staff: "Absen & cuti guru, arahan", finance: "SPP & bayar online",
  grades: "Penilaian", counseling: "BK", dashboard: "Dasbor kepala sekolah", foundation: "Dasbor yayasan", whitelabel: "Logo & nama sendiri", ppdb: "PPDB online", cbt: "Ujian online", whatsapp: "Notifikasi WhatsApp",
};

async function requestChange(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/langganan", "Pengajuan terkirim. Tim kami akan menghubungi Anda.", (sb) =>
    sb.rpc("request_plan_change", { p_school: schoolId, p_tier: str(fd, "tier"), p_note: optStr(fd, "note") }));
}

async function cancelRequest(fd: FormData) {
  "use server";
  await requireRole("school_admin");
  await run("/admin/langganan", "Pengajuan dibatalkan.", (sb) => sb.rpc("cancel_plan_change", { p_id: str(fd, "id") }));
}

export default async function Subscription({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireRole("school_admin");
  const [{ data: school }, { data: plans }, { count: students }, { data: requests }, { data: bills }, { data: account }] = await Promise.all([
    supabase.from("schools").select("plan, settings").eq("id", schoolId).single(),
    supabase.from("plans").select("tier, name, price_per_student, max_students, modules"),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "aktif"),
    supabase.from("plan_change_requests").select("id, from_tier, to_tier, status, note, review_note, created_at").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(5),
    supabase.from("platform_bills").select("id, period, active_students, price_per_student, gross_amount, collected_by_split, amount_due, status").eq("school_id", schoolId).order("period", { ascending: false }).limit(12),
    supabase.from("school_payment_accounts").select("status, service_fee_bearer").eq("school_id", schoolId).maybeSingle(),
  ]);
  const order = ["free", "basic", "pro", "enterprise"];
  const all = (plans ?? []).sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
  const current = all.find((p) => p.tier === school?.plan);
  const custom = (school?.settings as any)?.custom_price_per_student;
  const price = custom ?? current?.price_per_student ?? 0;
  const pending = requests?.find((r) => r.status === "pending");
  const over = current?.max_students != null && (students ?? 0) > current.max_students;

  return (
    <>
      <PageHeader title="Langganan & Paket" subtitle="Biaya dihitung per murid aktif setiap bulan." />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Paket saat ini" value={current?.name ?? "–"} />
        <Stat label="Murid aktif" value={students ?? 0} tone={over ? "bad" : undefined}
          hint={current?.max_students ? `Batas paket ${current.max_students}${over ? " (terlampaui)" : ""}` : "Tanpa batas"} />
        <Stat label="Harga per murid" value={rupiah(price)} hint={custom != null ? "Harga khusus" : "per bulan"} />
        <Stat label="Perkiraan per bulan" value={rupiah(price * (students ?? 0))} />
      </div>
      {over && <p className="mb-4 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">Jumlah murid aktif melebihi batas paket Gratis. Ajukan paket Dasar agar bisa menambah murid baru.</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {all.map((p) => {
          const isCurrent = p.tier === school?.plan;
          return (
            <div key={p.tier} className={cx("flex flex-col rounded-lg border bg-sheet p-4", isCurrent ? "border-brand ring-1 ring-brand" : "border-line")}>
              <div className="flex items-center justify-between"><b>{p.name}</b>{isCurrent && <Badge tone="info">Paket Anda</Badge>}</div>
              <div className="mt-2 text-2xl font-extrabold tabular-nums">{p.tier === "enterprise" ? "Khusus" : rupiah(p.price_per_student)}</div>
              <div className="text-xs text-muted">{p.tier === "free" ? `sampai ${p.max_students} murid` : "per murid / bulan"}</div>
              <ul className="mt-3 flex flex-1 flex-col gap-1 text-xs text-muted">{(p.modules as string[]).map((m) => <li key={m}>✓ {MODULE_LABEL[m] ?? m}</li>)}</ul>
              {!isCurrent && !pending && (
                <form action={requestChange} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="tier" value={p.tier} />
                  <Textarea name="note" rows={2} placeholder="Catatan (opsional)" aria-label={`Catatan pengajuan ${p.name}`} />
                  <SubmitButton variant={order.indexOf(p.tier) > order.indexOf(school?.plan ?? "free") ? "primary" : "secondary"}>
                    Ajukan {order.indexOf(p.tier) > order.indexOf(school?.plan ?? "free") ? "naik" : "turun"} ke {p.name}
                  </SubmitButton>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Tagihan langganan">
          <Table head={["Bulan", "Murid", "Nilai", "Terpotong otomatis", "Ditagih", "Status"]} empty="Belum ada tagihan langganan.">
            {(bills ?? []).map((b) => (
              <tr key={b.id}>
                <td>{tanggal(b.period).replace(/^\d+ /, "")}</td>
                <td className="tabular-nums">{b.active_students}</td>
                <td className="tabular-nums">{rupiah(b.gross_amount)}</td>
                <td className="tabular-nums">{rupiah(b.collected_by_split)}</td>
                <td className="tabular-nums font-bold">{rupiah(b.amount_due)}</td>
                <td><StatusBadge status={b.status === "open" ? "unpaid" : b.status === "paid" ? "paid" : "void"} /></td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="flex flex-col gap-4">
          <Card title="Pengajuan paket">
            {!requests?.length ? <Empty>Belum ada pengajuan.</Empty> : (
              <ul className="flex flex-col gap-3 text-sm">
                {requests.map((r) => (
                  <li key={r.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{PLAN_LABEL[r.from_tier]} → <b>{PLAN_LABEL[r.to_tier]}</b></span><StatusBadge status={r.status} />
                    </div>
                    <div className="text-xs text-muted">{waktu(r.created_at)}{r.review_note ? ` · ${r.review_note}` : ""}</div>
                    {r.status === "pending" && (
                      <form action={cancelRequest}><input type="hidden" name="id" value={r.id} /><Button variant="ghost" className="mt-1 px-0 py-0 text-xs">Batalkan</Button></form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Pembayaran online">
            <p className="text-sm">{account ? <Badge tone={account.status === "live" ? "good" : "warn"}>{PAYMENT_LABEL[account.status]}</Badge> : <Badge>Belum diajukan</Badge>}</p>
            <p className="mt-2 text-xs text-muted">
              {account?.status === "live"
                ? `Biaya langganan dipotong otomatis dari setiap pembayaran SPP online. Biaya layanan ditanggung ${account.service_fee_bearer === "school" ? "sekolah" : "orang tua"}.`
                : "Setelah rekening sekolah diverifikasi, orang tua bisa membayar lewat QRIS, VA, dan e-wallet, dan biaya langganan dipotong otomatis."}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
