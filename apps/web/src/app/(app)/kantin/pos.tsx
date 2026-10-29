"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { itemsText, type CartItem } from "@/lib/canteen";
import { rupiah } from "@/lib/format";
import { cx } from "@/components/ui";
import { beep, useQrCamera } from "@/components/use-qr-camera";

export interface MenuItem { id: string; name: string; price: number }
export interface SaleRow {
  id: string; kind: "purchase" | "refund"; amount: number; items: CartItem[] | null; created_at: string;
  student_name: string; class_name: string | null; refunded: boolean; settlement_id: string | null;
}
type Result =
  | { ok: true; title: string; name: string; detail: string }
  | { ok: false; title: string; message: string };

const REPEAT_MS = 4000;
const time = (d: string) => new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/**
 * Kasir kios: pilih menu (atau ketik nominal), lalu tempel kartu pelajar ke pemindai/kamera atau ketik NIS.
 * Tanpa isi keranjang, kartu hanya dicek (nama dan sisa jajan hari ini).
 */
export function CanteenPos({ stallId, menu, sales }: { stallId: string; menu: MenuItem[]; sales: SaleRow[] }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [custom, setCustom] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const recent = useRef(new Map<string, number>());
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const busyRef = useRef(false);

  const total = cart.reduce((n, i) => n + i.price * i.qty, 0);
  const add = (name: string, price: number) => setCart((c) => {
    const at = c.findIndex((i) => i.name === name && i.price === price);
    return at < 0 ? [...c, { name, price, qty: 1 }] : c.map((i, k) => (k === at ? { ...i, qty: i.qty + 1 } : i));
  });
  const change = (k: number, d: number) => setCart((c) => c.flatMap((i, j) => (j !== k ? [i] : i.qty + d > 0 ? [{ ...i, qty: i.qty + d }] : [])));

  const submit = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code || busyRef.current) return;
    const t = Date.now();
    if ((recent.current.get(code) ?? 0) > t - REPEAT_MS) return;   // kartu masih di depan kamera
    recent.current.set(code, t);
    busyRef.current = true;
    setBusy(true);
    const items = cartRef.current;
    const amount = items.reduce((n, i) => n + i.price * i.qty, 0);
    try {
      if (amount === 0) {
        const { data, error } = await sb.rpc("canteen_lookup", { p_stall: stallId, p_code: code });
        if (error) throw error;
        const d = data as { full_name: string; class_name: string | null; spendable: number; frozen: boolean; limited: boolean };
        setResult(d.frozen
          ? { ok: false, title: d.full_name, message: "Kartu sedang dibekukan orang tua" }
          : { ok: true, title: "Cek saldo", name: d.full_name,
              detail: `${d.class_name ? `Kelas ${d.class_name} · ` : ""}bisa jajan ${rupiah(d.spendable)}${d.limited ? " hari ini" : ""}` });
        beep(!d.frozen);
      } else {
        const { data, error } = await sb.rpc("canteen_charge", { p_stall: stallId, p_code: code, p_amount: amount, p_items: items });
        if (error) throw error;
        const d = data as { full_name: string; amount: number; balance_after: number };
        setResult({ ok: true, title: `Berhasil ${rupiah(d.amount)}`, name: d.full_name, detail: `Sisa saldo ${rupiah(d.balance_after)}` });
        setCart([]);
        setCustom("");
        beep(true);
        router.refresh();
      }
    } catch (e) {
      setResult({ ok: false, title: amount ? "Pembayaran gagal" : "Kartu tidak bisa dicek", message: (e as { message?: string }).message ?? String(e) });
      beep(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
      input.current?.focus();
    }
  }, [sb, stallId, router]);

  const stopCamera = useCallback(() => setCamera(false), []);
  const camError = useQrCamera(camera, video, submit, stopCamera);

  async function voidSale(s: SaleRow) {
    if (!confirm(`Batalkan jajan ${s.student_name} ${rupiah(-s.amount)}? Saldo dikembalikan.`)) return;
    const { error } = await sb.rpc("canteen_void", { p_entry: s.id, p_reason: "Dibatalkan kasir" });
    setResult(error ? { ok: false, title: "Gagal membatalkan", message: error.message }
                    : { ok: true, title: "Dibatalkan", name: s.student_name, detail: `${rupiah(-s.amount)} dikembalikan ke saldo` });
    router.refresh();
  }

  const purchases = sales.filter((s) => s.kind === "purchase");
  const net = -sales.reduce((n, s) => n + s.amount, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">
        <section aria-label="Menu" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {menu.map((m) => (
            <button key={m.id} type="button" onClick={() => add(m.name, m.price)}
              className="rounded-xl border border-line bg-sheet px-3 py-3 text-left shadow-xs hover:border-brand active:scale-[0.98]">
              <div className="font-semibold text-ink">{m.name}</div>
              <div className="text-sm tabular-nums text-muted">{rupiah(m.price)}</div>
            </button>
          ))}
          <form className="col-span-2 flex gap-2 rounded-xl border border-dashed border-line p-2 sm:col-span-1 lg:col-span-1"
            onSubmit={(e) => { e.preventDefault(); const n = Number(custom.replace(/\D/g, "")); if (n >= 100) { add("Lainnya", n); setCustom(""); } }}>
            <label htmlFor="custom" className="sr-only">Nominal lain</label>
            <input id="custom" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Nominal"
              className="min-w-0 flex-1 rounded-lg border border-line bg-sheet px-2 py-1.5 text-sm text-ink" />
            <button className="rounded-lg bg-paper px-2 text-sm font-semibold text-ink" aria-label="Tambah nominal">+</button>
          </form>
        </section>

        <section className="rounded-xl border border-line bg-sheet p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold text-ink">Belanja</h2>
            {cart.length > 0 && <button type="button" onClick={() => setCart([])} className="text-sm font-semibold text-muted hover:text-bad">Kosongkan</button>}
          </div>
          {!cart.length ? <p className="text-sm text-muted">Pilih menu di atas. Tempel kartu tanpa belanjaan untuk cek saldo.</p> : (
            <ul className="divide-y divide-line">
              {cart.map((i, k) => (
                <li key={`${i.name}-${i.price}`} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-ink">{i.name}</span>
                  <span className="flex items-center gap-1">
                    <button type="button" aria-label={`Kurangi ${i.name}`} onClick={() => change(k, -1)} className="rounded-md border border-line p-1"><Minus className="size-3.5" /></button>
                    <span className="w-6 text-center tabular-nums">{i.qty}</span>
                    <button type="button" aria-label={`Tambah ${i.name}`} onClick={() => change(k, 1)} className="rounded-md border border-line p-1"><Plus className="size-3.5" /></button>
                  </span>
                  <span className="w-20 text-right tabular-nums">{rupiah(i.price * i.qty)}</span>
                  <button type="button" aria-label={`Hapus ${i.name}`} onClick={() => change(k, -i.qty)} className="text-muted hover:text-bad"><X className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm text-muted">Total</span>
            <span className="text-3xl font-extrabold tabular-nums text-ink">{rupiah(total)}</span>
          </div>
        </section>

        <div aria-live="assertive" className={cx("rounded-2xl border-2 p-5 text-center",
          !result && "border-dashed border-line bg-sheet", result?.ok && "border-good bg-good-soft", result && !result.ok && "border-bad bg-bad-soft")}>
          {!result ? (
            <>
              <div className="text-xl font-extrabold text-ink">{total ? `Tempel kartu untuk membayar ${rupiah(total)}` : "Tempel kartu untuk cek saldo"}</div>
              <p className="mt-1 text-sm text-muted">Pemindai QR, kamera, atau ketik NIS lalu Enter</p>
            </>
          ) : result.ok ? (
            <>
              <div className="text-sm font-bold uppercase tracking-wide text-good">{result.title}</div>
              <div className="mt-1 text-3xl font-extrabold text-ink text-balance">{result.name}</div>
              <div className="mt-1 text-muted">{result.detail}</div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold uppercase tracking-wide text-bad">{result.title}</div>
              <div className="mt-1 text-xl font-extrabold text-ink text-balance">{result.message}</div>
            </>
          )}
        </div>

        <form className="flex flex-wrap gap-2"
          onSubmit={(e) => { e.preventDefault(); const v = input.current?.value ?? ""; if (input.current) input.current.value = ""; recent.current.clear(); void submit(v); }}>
          <label htmlFor="pos-code" className="sr-only">Kartu atau NIS</label>
          <input ref={input} id="pos-code" autoFocus autoComplete="off" spellCheck={false} disabled={busy}
            placeholder="Pindai kartu atau ketik NIS lalu Enter"
            className="min-w-0 flex-1 rounded-lg border border-line bg-sheet px-4 py-3 text-ink placeholder:text-muted" />
          <button disabled={busy} className="rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            {busy ? "Memproses…" : total ? "Bayar" : "Cek"}
          </button>
          <button type="button" onClick={() => setCamera((c) => !c)}
            className="rounded-lg border border-line px-3 text-sm font-semibold text-ink hover:bg-paper">{camera ? "Matikan kamera" : "Pakai kamera"}</button>
        </form>
        {camera && <video ref={video} muted playsInline aria-label="Kamera pemindai" className="mx-auto aspect-video w-full max-w-md rounded-xl bg-black object-cover" />}
        {camError && <p className="text-sm text-bad">{camError}</p>}
      </div>

      <aside className="h-fit rounded-2xl border border-line bg-sheet p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-bold text-ink">Hari ini</h2>
          <span className="text-sm text-muted">{purchases.length} transaksi · <b className="text-ink">{rupiah(net)}</b></span>
        </div>
        {!sales.length ? <p className="text-sm text-muted">Belum ada penjualan hari ini.</p> : (
          <ul className="flex max-h-[560px] flex-col divide-y divide-line overflow-y-auto">
            {sales.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className={cx("block truncate font-semibold", s.refunded || s.kind === "refund" ? "text-muted line-through" : "text-ink")}>
                    {s.student_name}{s.class_name && <span className="font-normal text-muted"> · {s.class_name}</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">{s.kind === "refund" ? "Pembatalan" : itemsText(s.items) || "Jajan"} · {time(s.created_at)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cx("block tabular-nums", s.kind === "refund" ? "text-good" : "text-ink")}>{s.kind === "refund" ? "+" : ""}{rupiah(Math.abs(s.amount))}</span>
                  {s.kind === "purchase" && !s.refunded && !s.settlement_id && (
                    <button type="button" onClick={() => void voidSale(s)} className="text-xs font-semibold text-bad hover:underline">Batalkan</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
