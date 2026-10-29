import { rupiah, tanggal } from "@/lib/format";
import { STAFF_STATUS, lineDetail, periodLabel, type Adjustment, type RunStatus, type Slip, type SlipLine } from "@/lib/payroll";

export interface PayslipView {
  slip: Slip;
  run: { period: string; status: RunStatus; paid_on: string | null; paid_method: string | null };
  employee: { nip: string | null; bank_name: string | null; bank_account: string | null; account_holder: string | null } | null;
  school: string;
}

/** Slip gaji satu pegawai, siap dicetak A5/A4 atau disimpan PDF. */
export function Payslip({ v }: { v: PayslipView }) {
  const { slip: s, run: r, employee: e } = v;
  const earnings: (SlipLine | Adjustment)[] = [...s.lines.filter((l) => l.kind === "earning"), ...s.adjustments.filter((a) => a.amount > 0)];
  const deductions: (SlipLine | Adjustment)[] = [...s.lines.filter((l) => l.kind === "deduction"), ...s.adjustments.filter((a) => a.amount < 0)];
  const a = s.attendance;
  const row = "flex items-baseline justify-between gap-3 py-1.5";

  const column = (title: string, items: (SlipLine | Adjustment)[], total: number) => (
    <section className="min-w-0">
      <h3 className="border-b-2 border-ink pb-1 text-xs font-bold uppercase tracking-wider text-ink print:border-black">{title}</h3>
      <ul className="divide-y divide-line print:divide-black/20">
        {items.map((i, k) => {
          const isLine = "kind" in i;
          const detail = isLine ? lineDetail(i) : "Penyesuaian";
          return (
            <li key={k} className={row}>
              <span className="min-w-0">
                <span className="block text-ink">{isLine ? i.name : i.label}</span>
                {detail && <span className="block text-xs text-muted print:text-black/60">{detail}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{rupiah(Math.abs(i.amount))}</span>
            </li>
          );
        })}
        {!items.length && <li className="py-1.5 text-muted">–</li>}
      </ul>
      <div className={`${row} border-t border-ink font-semibold print:border-black`}><span>Jumlah</span><span className="tabular-nums">{rupiah(total)}</span></div>
    </section>
  );

  return (
    <article className="relative mx-auto max-w-[190mm] rounded-lg border border-line bg-sheet p-5 text-sm text-ink sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:text-[10.5pt] print:text-black">
      {r.status !== "paid" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span className="-rotate-30 text-7xl font-extrabold tracking-widest text-line/70 print:text-black/10">{r.status === "draft" ? "DRAF" : "BELUM DIBAYAR"}</span>
        </div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4 print:border-black">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted print:text-black/70">{v.school}</div>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight">Slip Gaji · {periodLabel(r.period)}</h2>
        </div>
        <div className="text-right text-xs text-muted print:text-black/70">
          {r.paid_on ? <>Dibayar {tanggal(r.paid_on)}<br />{r.paid_method === "transfer" ? "Transfer bank" : "Tunai"}</> : "Belum dibayar"}
        </div>
      </header>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-1 py-4 sm:grid-cols-2 print:grid-cols-2">
        {[
          ["Nama", s.full_name], ["Jabatan", s.position ?? "–"], ["Status", STAFF_STATUS[s.status] ?? s.status], ["NIP/NUPTK", e?.nip ?? "–"],
        ].map(([k, val]) => (
          <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2"><dt className="text-muted print:text-black/70">{k}</dt><dd className="font-medium">{val}</dd></div>
        ))}
      </dl>

      <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
        {column("Pendapatan", earnings, Number(s.gross))}
        {column("Potongan", deductions, Number(s.deductions))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper px-4 py-3 print:border print:border-black print:bg-transparent">
        <span className="font-semibold">Gaji bersih diterima</span>
        <span className="text-2xl font-extrabold tabular-nums">{rupiah(s.net)}</span>
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-1 text-xs text-muted sm:grid-cols-2 print:grid-cols-2 print:text-black/70">
        <p>
          Kehadiran: hadir {a.hadir + a.dinas}, terlambat {a.terlambat}, izin {a.izin}, sakit {a.sakit}, cuti {a.cuti}, alpa {a.alpa}
          {a.jp_week > 0 && <> · mengajar {a.jp_week} JP/pekan</>}
        </p>
        {e?.bank_account && <p className="sm:text-right print:text-right">Rekening: {e.bank_name} {e.bank_account}{e.account_holder ? ` a.n. ${e.account_holder}` : ""}</p>}
      </div>

      <div className="mt-10 hidden grid-cols-2 gap-8 text-center text-sm print:grid">
        <div>Bendahara / Tata Usaha<div className="mt-16 border-t border-black pt-1">&nbsp;</div></div>
        <div>Penerima<div className="mt-16 border-t border-black pt-1">{s.full_name}</div></div>
      </div>
    </article>
  );
}
