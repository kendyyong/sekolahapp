"use client";

import { useState } from "react";
import { FRAMEWORK_LABEL, THEMES, aspectName, byDimension, type Aspect, type Framework } from "@/lib/kokurikuler";
import { Field, Input, Select, Textarea } from "@/components/ui";

export interface ProjectInput {
  framework: Framework; title: string; theme: string | null; description: string | null; class_ids: string[]; aspect_ids: string[];
}

const box = "size-4 shrink-0 accent-[var(--color-brand-solid)]";

/** Isian projek; daftar dimensi mengikuti kerangka yang dipilih. */
export function ProjectFields({ aspects, classes, p }: { aspects: Aspect[]; classes: { id: string; name: string }[]; p?: ProjectInput }) {
  const [framework, setFramework] = useState<Framework>(p?.framework ?? "kokurikuler");
  const chosen = new Set(p?.aspect_ids ?? []);
  const shown = aspects.filter((a) => a.framework === framework);
  return (
    <div className="@container"><div className="grid gap-4 @lg:grid-cols-2">
      <Field label="Nama projek" className="@lg:col-span-2">
        <Input id="title" name="title" required minLength={3} maxLength={150} defaultValue={p?.title} placeholder="Contoh: Kebun Sayur Sekolah" />
      </Field>
      <Field label="Kerangka">
        <Select id="framework" name="framework" value={framework} onChange={(e) => setFramework(e.target.value as Framework)}>
          {(Object.keys(FRAMEWORK_LABEL) as Framework[]).map((f) => <option key={f} value={f}>{FRAMEWORK_LABEL[f]}</option>)}
        </Select>
      </Field>
      <Field label="Tema (opsional)">
        <Input id="theme" name="theme" list="themes" maxLength={150} defaultValue={p?.theme ?? ""} placeholder="Pilih atau tulis tema" />
        <datalist id="themes">{THEMES.map((t) => <option key={t} value={t} />)}</datalist>
      </Field>
      <Field label="Deskripsi kegiatan (opsional)" className="@lg:col-span-2">
        <Textarea id="description" name="description" rows={3} maxLength={4000} defaultValue={p?.description ?? ""}
          placeholder="Tujuan, kegiatan, dan hasil karya yang diharapkan" />
      </Field>
      <fieldset className="@lg:col-span-2">
        <legend className="mb-2 text-sm font-medium text-ink">Kelas peserta</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {classes.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="class" value={c.id} defaultChecked={p?.class_ids.includes(c.id)} className={box} />{c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="@lg:col-span-2">
        <legend className="mb-1 text-sm font-medium text-ink">{framework === "p5" ? "Dimensi & elemen yang dinilai" : "Dimensi profil lulusan yang dinilai"}</legend>
        <p className="mb-2 text-xs text-muted">Pilih 2–4 yang paling relevan dengan kegiatan projek.</p>
        {framework === "kokurikuler" ? (
          <div className="grid gap-2 @md:grid-cols-2">
            {shown.map((a) => (
              <label key={a.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="aspect" value={a.id} defaultChecked={chosen.has(a.id)} className={`${box} mt-0.5`} />{a.dimension}
              </label>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {byDimension(shown).map(([dim, items]) => (
              <div key={dim}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">{dim}</div>
                <div className="mt-1 grid gap-1.5 @md:grid-cols-2">
                  {items.map((a) => (
                    <label key={a.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="aspect" value={a.id} defaultChecked={chosen.has(a.id)} className={`${box} mt-0.5`} />{aspectName(a)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </div></div>
  );
}
