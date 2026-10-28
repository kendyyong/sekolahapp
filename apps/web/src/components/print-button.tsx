"use client";

export function PrintButton({ label = "Cetak" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()}
      className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong print:hidden">
      {label}
    </button>
  );
}
