// Kantin digital: label dan bentuk data yang dipakai halaman kasir, TU, orang tua, dan murid.
import type { Tone } from "@/lib/format";

export type Entry = "topup" | "purchase" | "refund" | "withdraw" | "adjust";

export const ENTRY_LABEL: Record<Entry, string> = {
  topup: "Isi saldo", purchase: "Jajan", refund: "Pembatalan", withdraw: "Tarik tunai", adjust: "Koreksi",
};
export const ENTRY_TONE: Record<Entry, Tone> = {
  topup: "good", purchase: "neutral", refund: "info", withdraw: "warn", adjust: "warn",
};

export interface CartItem { name: string; price: number; qty: number }

export interface LedgerRow {
  id: string; kind: Entry; amount: number; balance_after: number; created_at: string; note: string | null;
  method: string | null; items: CartItem[] | null; refund_of: string | null; settlement_id: string | null;
  canteen_stalls: { name: string } | null;
}
export const LEDGER_COLUMNS = "id, kind, amount, balance_after, created_at, note, method, items, refund_of, settlement_id, canteen_stalls(name)";

/** "Nasi goreng ×2, Es teh" */
export function itemsText(items: CartItem[] | null | undefined) {
  return (items ?? []).map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(", ");
}

/** Keterangan satu baris buku saldo. */
export function entryDetail(r: Pick<LedgerRow, "kind" | "method" | "items" | "note" | "canteen_stalls">) {
  const where = r.canteen_stalls?.name;
  switch (r.kind) {
    case "purchase": return [where, itemsText(r.items)].filter(Boolean).join(" · ");
    case "refund": return [where, r.note].filter(Boolean).join(" · ");
    case "topup": return [r.method === "online" ? "Bayar tagihan" : "Tunai di TU", r.note].filter(Boolean).join(" · ");
    default: return r.note ?? "";
  }
}

export const TOPUP_PRESETS = [20000, 50000, 100000, 200000];
