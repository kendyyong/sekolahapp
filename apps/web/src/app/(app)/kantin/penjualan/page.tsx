import { requireModule } from "@/lib/session";
import { rupiah, tanggal, todayJakarta, waktu } from "@/lib/format";
import { itemsText } from "@/lib/canteen";
import { myStalls } from "@/lib/canteen-server";
import { Badge, Button, Card, DownloadLink, Empty, Field, Input, PageHeader, Stat, Table } from "@/components/ui";
import type { SaleRow } from "../pos";
import { StallTabs } from "../stall-picker";

const isDate = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

export default async function StallSales({ searchParams }: { searchParams: Promise<{ kios?: string; dari?: string; sampai?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId, active } = await requireModule("canteen", "canteen", "finance", "school_admin", "principal");
  const stalls = await myStalls(supabase, schoolId, user.id, active.role !== "canteen");
  const stall = stalls.find((s) => s.id === sp.kios) ?? stalls[0];
  if (!stall) return (<><PageHeader title="Penjualan & Setoran" /><Empty>Belum ada kios untuk Anda.</Empty></>);
  const today = todayJakarta();
  const from = isDate(sp.dari) ? sp.dari! : today.slice(0, 8) + "01";
  const to = isDate(sp.sampai) ? sp.sampai! : today;
  const [{ data: rows }, { data: settlements }, { data: open }] = await Promise.all([
    supabase.rpc("canteen_stall_entries", { p_stall: stall.id, p_from: from, p_to: to }),
    supabase.from("canteen_settlements").select("id, period_to, gross, commission, net, entries, note, created_at, profiles:paid_by(full_name)")
      .eq("stall_id", stall.id).order("created_at", { ascending: false }).limit(24),
    supabase.from("canteen_ledger").select("amount").eq("stall_id", stall.id).is("settlement_id", null).limit(10000),
  ]);
  const sales = (rows ?? []) as SaleRow[];
  const net = (list: { amount: number }[]) => -list.reduce((n, r) => n + Number(r.amount), 0);
  const pending = net(open ?? []);
  const count = sales.filter((r) => r.kind === "purchase" && !r.refunded).length;
  const q = `kios=${stall.id}&dari=${from}&sampai=${to}`;

  return (
    <>
      <PageHeader title={`Penjualan · ${stall.name}`} subtitle={`Bagi hasil sekolah ${Number(stall.commission_pct)}% dari penjualan bersih.`}
        actions={<DownloadLink href={`/unduh/kantin?${q}`}>Unduh Excel</DownloadLink>} />
      <StallTabs stalls={stalls} active={stall.id} base="/kantin/penjualan" />
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <input type="hidden" name="kios" value={stall.id} />
        <Field label="Dari"><Input id="dari" name="dari" type="date" defaultValue={from} /></Field>
        <Field label="Sampai"><Input id="sampai" name="sampai" type="date" defaultValue={to} /></Field>
        <Button variant="secondary">Tampilkan</Button>
      </form>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Penjualan bersih" value={rupiah(net(sales))} hint={`${tanggal(from)} – ${tanggal(to)}`} />
        <Stat label="Transaksi" value={count} />
        <Stat label="Belum disetor TU" value={rupiah(pending)} tone={pending ? "warn" : undefined}
          hint={pending ? `Diterima kios ${rupiah(pending - Math.round((pending * Number(stall.commission_pct)) / 100))}` : "Semua sudah disetor"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Table head={["Waktu", "Murid", "Belanja", "Nominal"]} empty="Tidak ada penjualan pada rentang ini.">
            {sales.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-sm">{waktu(r.created_at)}</td>
                <td className="text-sm">{r.student_name}{r.class_name && <div className="text-xs text-muted">{r.class_name}</div>}</td>
                <td className="text-sm">
                  {r.kind === "refund" ? <Badge tone="info">Pembatalan</Badge> : itemsText(r.items) || "Jajan"}
                  {r.refunded && <span className="ml-1 text-xs text-muted">(dibatalkan)</span>}
                </td>
                <td className={`whitespace-nowrap text-right tabular-nums ${r.kind === "refund" ? "text-good" : ""}`}>
                  {r.kind === "refund" ? "+" : ""}{rupiah(Math.abs(Number(r.amount)))}
                </td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="Riwayat setoran" className="h-fit">
          {!settlements?.length ? <p className="text-sm text-muted">Belum ada setoran. Tata Usaha mencatat setoran saat menyerahkan uang penjualan.</p> : (
            <ul className="divide-y divide-line text-sm">
              {(settlements as unknown as { id: string; period_to: string; gross: number; commission: number; net: number; entries: number; note: string | null; created_at: string; profiles: { full_name: string } | null }[]).map((s) => (
                <li key={s.id} className="py-2">
                  <div className="flex justify-between gap-2"><span className="font-semibold text-ink">s.d. {tanggal(s.period_to)}</span><span className="font-semibold tabular-nums">{rupiah(s.net)}</span></div>
                  <div className="text-xs text-muted">
                    Penjualan {rupiah(s.gross)} − bagi hasil {rupiah(s.commission)} · {s.entries} transaksi · dicatat {waktu(s.created_at)}{s.profiles ? ` oleh ${s.profiles.full_name}` : ""}
                  </div>
                  {s.note && <div className="text-xs text-muted">{s.note}</div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
