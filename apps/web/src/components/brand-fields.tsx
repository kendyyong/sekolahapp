"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { BRAND_PRESETS, brandScope, contrastWithWhite } from "@/lib/brand";
import { Field, Input, cx } from "@/components/ui";
import { SchoolMark } from "@/components/school-mark";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Isian warna & nama aplikasi (Enterprise) dengan pratinjau langsung. */
export function BrandFields({ color: initialColor, appName: initialName, school, logo, motto, disabled }: {
  color: string | null; appName: string | null; school: string; logo: string | null; motto: string | null; disabled?: boolean;
}) {
  const [color, setColor] = useState(initialColor ?? "");
  const [name, setName] = useState(initialName ?? "");
  const valid = HEX.test(color);
  const ratio = valid ? contrastWithWhite(color) : null;
  const preview = brandScope(valid ? color : null);

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="flex flex-col gap-4">
        <Field label="Nama aplikasi" hint="Tampil di menu, judul tab browser, halaman masuk, dan aplikasi HP. Kosongkan untuk memakai nama sekolah.">
          <Input name="app_name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder={school} disabled={disabled} />
        </Field>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-ink">Warna utama</span>
          <div className="flex flex-wrap items-center gap-2">
            {BRAND_PRESETS.map((c) => (
              <button key={c} type="button" disabled={disabled} onClick={() => setColor(c)} aria-label={`Pilih warna ${c}`}
                className="grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-sheet transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50"
                style={{ background: c }}>
                {color.toLowerCase() === c && <Check className="size-4 text-white" />}
              </button>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <input type="color" aria-label="Pilih warna bebas" value={valid ? color : "#1f4fb8"} disabled={disabled}
              onChange={(e) => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-sheet p-1" />
            <div className="w-32"><Input name="brand_color" value={color} onChange={(e) => setColor(e.target.value.trim())} placeholder="#1f4fb8" maxLength={7} disabled={disabled} aria-label="Kode warna" /></div>
            {color && <button type="button" onClick={() => setColor("")} disabled={disabled} className="text-xs font-semibold text-muted hover:text-ink">Pakai warna bawaan</button>}
          </div>
          <span className={cx("text-xs", ratio != null && ratio < 4.5 ? "text-bad" : "text-muted")}>
            {color && !valid ? "Format warna: # diikuti 6 digit heksadesimal, misalnya #0f766e."
              : ratio != null && ratio < 4.5 ? `Terlalu terang untuk teks putih (kontras ${ratio.toFixed(1)}:1, minimal 4,5:1). Pilih warna yang lebih gelap.`
              : "Dipakai untuk tombol, tautan, dan menu aktif. Warna terang otomatis disesuaikan pada mode gelap."}
          </span>
        </div>
      </div>

      <div aria-label="Pratinjau" className={cx("overflow-hidden rounded-xl border border-line", preview.className)} style={preview.style}>
        <div className="flex items-center gap-2.5 bg-side px-3 py-3">
          <SchoolMark name={school} logo={logo} className="size-8 text-xs" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">{name || school}</div>
            <div className="truncate text-[11px] text-side-muted">{name ? school : motto ?? "SekolahApp"}</div>
          </div>
        </div>
        <div className="bg-side px-2 pb-3">
          <div className="rounded-md bg-brand-solid px-2.5 py-1.5 text-xs font-medium text-white">Ringkasan</div>
          <div className="px-2.5 py-1.5 text-xs text-side-ink/70">Data Murid</div>
        </div>
        <div className="flex items-center gap-2 bg-paper p-3">
          <span className="rounded-lg bg-brand-solid px-3 py-1.5 text-xs font-semibold text-white">Simpan</span>
          <span className="text-xs font-semibold text-brand">Lihat detail</span>
        </div>
      </div>
    </div>
  );
}
