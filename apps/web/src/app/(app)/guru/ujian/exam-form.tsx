import { num, optStr, str } from "@/lib/actions";
import { fromWibInput, randomToken, toWibInput, type Exam } from "@/lib/cbt";
import { Field, Input, Textarea } from "@/components/ui";

/** Isian ujian dari form; dipakai saat membuat maupun mengubah. */
export function examFromForm(fd: FormData, current?: Pick<Exam, "token">) {
  const startsAt = fromWibInput(str(fd, "starts_at"));
  const endsAt = fromWibInput(str(fd, "ends_at"));
  if (endsAt <= startsAt) throw new Error("Jam tutup harus setelah jam buka");
  const duration = num(fd, "duration_minutes");
  if (!(duration >= 5 && duration <= 600)) throw new Error("Durasi 5 sampai 600 menit");
  const useToken = fd.get("use_token") === "on";
  return {
    title: str(fd, "title"), instructions: optStr(fd, "instructions"),
    starts_at: startsAt, ends_at: endsAt, duration_minutes: duration,
    token: useToken ? (current?.token ?? randomToken()) : null,
    shuffle_questions: fd.get("shuffle_questions") === "on", shuffle_options: fd.get("shuffle_options") === "on",
    show_score: fd.get("show_score") === "on", show_review: fd.get("show_review") === "on",
  };
}

function Check({ name, label, hint, on }: { name: string; label: string; hint?: string; on: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 size-4 accent-[var(--color-brand-solid)]" />
      <span><span className="font-medium text-ink">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

export function ExamFields({ e }: { e?: Exam }) {
  const soon = new Date(Date.now() + 864e5);
  soon.setUTCHours(0, 30, 0, 0);   // besok 07.30 WIB
  const defStart = e?.starts_at ?? soon.toISOString();
  const defEnd = e?.ends_at ?? new Date(Date.parse(defStart) + 2 * 3600_000).toISOString();
  return (
    <div className="@container"><div className="grid gap-4 @lg:grid-cols-2">
      <Field label="Nama ujian" className="@lg:col-span-2">
        <Input id="title" name="title" required minLength={3} maxLength={150} defaultValue={e?.title} placeholder="Contoh: Ulangan Harian Bab 2" />
      </Field>
      <Field label="Dibuka (WIB)"><Input id="starts_at" name="starts_at" type="datetime-local" required defaultValue={toWibInput(defStart)} /></Field>
      <Field label="Ditutup (WIB)" hint="Murid tidak bisa mulai setelah jam ini"><Input id="ends_at" name="ends_at" type="datetime-local" required defaultValue={toWibInput(defEnd)} /></Field>
      <Field label="Durasi mengerjakan (menit)" hint="Dihitung sejak murid menekan Mulai">
        <Input id="duration_minutes" name="duration_minutes" type="number" min={5} max={600} required defaultValue={e?.duration_minutes ?? 60} />
      </Field>
      <Field label="Petunjuk untuk murid (opsional)" className="@lg:col-span-2">
        <Textarea id="instructions" name="instructions" rows={3} maxLength={4000} defaultValue={e?.instructions ?? ""}
          placeholder="Contoh: Kerjakan sendiri. Kalkulator tidak diperbolehkan." />
      </Field>
      <div className="flex flex-col gap-3 @lg:col-span-2">
        <Check name="use_token" label="Pakai token" on={e ? e.token != null : true}
          hint="Murid harus memasukkan kode yang Anda bacakan di kelas sebelum mulai" />
        <Check name="shuffle_questions" label="Acak urutan soal" on={e?.shuffle_questions ?? true} />
        <Check name="shuffle_options" label="Acak urutan pilihan jawaban" on={e?.shuffle_options ?? true} />
        <Check name="show_score" label="Tampilkan nilai ke murid setelah selesai" on={e?.show_score ?? true}
          hint="Bila ada soal uraian, nilai tampil setelah Anda menilainya" />
        <Check name="show_review" label="Tampilkan pembahasan setelah ujian ditutup" on={e?.show_review ?? false}
          hint="Murid melihat kunci jawaban dan pembahasan setelah jam tutup" />
      </div>
    </div></div>
  );
}
