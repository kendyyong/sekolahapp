"use client";

import { LEVELS } from "@/lib/kokurikuler";

/** Mengisi satu kolom dimensi untuk semua murid sekaligus; guru tinggal mengubah yang berbeda. */
export function FillColumn({ aspect, disabled }: { aspect: string; disabled?: boolean }) {
  return (
    <select aria-label="Isi semua" disabled={disabled} defaultValue=""
      className="mt-1 w-full rounded border border-line bg-sheet px-1 py-0.5 text-[11px] font-normal normal-case tracking-normal text-ink"
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        document.querySelectorAll<HTMLSelectElement>(`select[data-aspect="${aspect}"]`).forEach((s) => { s.value = v === "-" ? "" : v; });
        e.target.value = "";
      }}>
      <option value="">Isi semua…</option>
      {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
      <option value="-">Kosongkan</option>
    </select>
  );
}
