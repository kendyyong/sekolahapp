import type { CSSProperties } from "react";

/** Warna siap pakai untuk sekolah: semuanya cukup gelap untuk teks putih. */
export const BRAND_PRESETS = ["#1f4fb8", "#0f766e", "#15803d", "#7c2d12", "#9f1239", "#6d28d9", "#334155", "#a16207"];

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** Rasio kontras WCAG antara warna hex dan putih. */
export function contrastWithWhite(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => channel(c / 255));
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

/** Props pembungkus yang menerapkan warna sekolah ke semua token brand (lihat .brand-scope di globals.css). */
export function brandScope(color: string | null | undefined): { className?: string; style?: CSSProperties } {
  return color ? { className: "brand-scope", style: { "--school-brand": color } as CSSProperties } : {};
}
