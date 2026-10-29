"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { KIND_HINT, KIND_LABEL, LETTERS, MAX_OPTIONS, type Question, type QuestionKind } from "@/lib/cbt";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

/** Form satu soal; isian kunci jawaban menyesuaikan jenis soal. */
export function QuestionForm({ action, examId, q, submitLabel }: {
  action: (fd: FormData) => Promise<void>; examId: string; q?: Question; submitLabel: string;
}) {
  const [kind, setKind] = useState<QuestionKind>(q?.kind ?? "pg");
  const [options, setOptions] = useState<string[]>(q?.options ?? ["", "", "", ""]);
  const keys = new Set(q?.kind === "pg" ? [q.answer as number] : q?.kind === "pg_kompleks" ? (q.answer as number[]) : []);
  const withOptions = kind === "pg" || kind === "pg_kompleks";
  const id = q?.id ?? "new";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="exam_id" value={examId} />
      {q && <input type="hidden" name="id" value={q.id} />}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
        <Field label="Jenis soal" hint={KIND_HINT[kind]}>
          <Select id={`kind-${id}`} name="kind" value={kind} onChange={(e) => setKind(e.target.value as QuestionKind)} disabled={!!q}>
            {(Object.keys(KIND_LABEL) as QuestionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </Field>
        <Field label="Bobot"><Input id={`points-${id}`} name="points" inputMode="decimal" required defaultValue={q?.points ?? (kind === "uraian" ? 5 : 1)} /></Field>
      </div>
      {q && <input type="hidden" name="kind" value={kind} />}
      <Field label="Pertanyaan"><Textarea id={`prompt-${id}`} name="prompt" rows={3} required maxLength={5000} defaultValue={q?.prompt} /></Field>
      <Field label={q?.image_path ? "Ganti gambar (opsional)" : "Gambar (opsional, maks. 2 MB)"}>
        <Input id={`image-${id}`} name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
      </Field>
      {q?.image_path && (
        <label className="-mt-2 flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="remove_image" className="size-4" /> Hapus gambar</label>
      )}

      {withOptions && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-ink">
            Pilihan jawaban <span className="font-normal text-muted">· centang {kind === "pg" ? "kunci jawabannya" : "semua jawaban benar"}</span>
          </legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type={kind === "pg" ? "radio" : "checkbox"} name={kind === "pg" ? "key" : "keys"} value={i}
                defaultChecked={keys.has(i)} aria-label={`Kunci ${LETTERS[i]}`} className="size-4 shrink-0 accent-[var(--color-brand-solid)]" />
              <span className="w-4 shrink-0 text-sm font-bold text-muted">{LETTERS[i]}</span>
              <Input name="option" value={o} required maxLength={1000} aria-label={`Pilihan ${LETTERS[i]}`}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  className="rounded p-1 text-muted hover:bg-paper hover:text-bad" aria-label={`Hapus pilihan ${LETTERS[i]}`}>
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <button type="button" onClick={() => setOptions([...options, ""])}
              className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-brand">
              <Plus aria-hidden className="size-4" />Tambah pilihan
            </button>
          )}
        </fieldset>
      )}
      {kind === "benar_salah" && (
        <fieldset className="flex gap-6 text-sm">
          <legend className="mb-1 text-sm font-medium text-ink">Kunci jawaban</legend>
          <label className="flex items-center gap-2"><input type="radio" name="key_bool" value="true" required defaultChecked={q?.answer === true} className="size-4" /> Benar</label>
          <label className="flex items-center gap-2"><input type="radio" name="key_bool" value="false" defaultChecked={q?.answer === false} className="size-4" /> Salah</label>
        </fieldset>
      )}
      {kind === "isian" && (
        <Field label="Jawaban yang diterima" hint="Pisahkan jawaban lain yang juga benar dengan | (contoh: 0,25 | 0.25 | seperempat)">
          <Input id={`accepted-${id}`} name="accepted" required defaultValue={((q?.answer as string[]) ?? []).join(" | ")} />
        </Field>
      )}
      <Field label={kind === "uraian" ? "Pedoman penilaian / jawaban ideal (opsional)" : "Pembahasan (opsional)"}
        hint={kind === "uraian" ? "Tampil untuk Anda saat menilai, dan untuk murid bila pembahasan dibuka" : "Tampil untuk murid bila pembahasan dibuka"}>
        <Textarea id={`explanation-${id}`} name="explanation" rows={2} maxLength={4000} defaultValue={q?.explanation ?? ""} />
      </Field>
      <SubmitButton pendingLabel="Menyimpan…">{submitLabel}</SubmitButton>
    </form>
  );
}
