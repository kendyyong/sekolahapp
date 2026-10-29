import { ENTRY_LABEL, ENTRY_TONE, entryDetail, type LedgerRow } from "@/lib/canteen";
import { rupiah, waktu } from "@/lib/format";
import { Badge, Table } from "@/components/ui";

/** Riwayat saldo kantin satu murid (orang tua, murid, dan TU). */
export function CanteenLedger({ rows, empty = "Belum ada transaksi kantin." }: { rows: LedgerRow[]; empty?: string }) {
  return (
    <Table head={["Waktu", "Transaksi", "Keterangan", "Nominal", "Saldo"]} empty={empty}>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className="whitespace-nowrap text-sm">{waktu(r.created_at)}</td>
          <td><Badge tone={ENTRY_TONE[r.kind]}>{ENTRY_LABEL[r.kind]}</Badge></td>
          <td className="max-w-sm text-sm">{entryDetail(r)}</td>
          <td className={`whitespace-nowrap text-right font-semibold tabular-nums ${r.amount > 0 ? "text-good" : "text-ink"}`}>
            {r.amount > 0 ? "+" : "−"}{rupiah(Math.abs(r.amount))}
          </td>
          <td className="whitespace-nowrap text-right tabular-nums text-muted">{rupiah(r.balance_after)}</td>
        </tr>
      ))}
    </Table>
  );
}
