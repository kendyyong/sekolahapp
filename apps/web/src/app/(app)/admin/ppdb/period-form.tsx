import { num, optStr, str } from "@/lib/actions";
import { gradeLabel } from "@/lib/ppdb";
import { todayJakarta } from "@/lib/format";
import { Field, Input, Select, Textarea } from "@/components/ui";

export interface Period {
  id: string; title: string; school_year: string; grade_level: number; opens_on: string; closes_on: string;
  quota: number | null; fee_amount: number; requirements: string | null; documents: string[]; is_published: boolean;
  announced_at: string | null;
}

const DEFAULT_DOCS = ["Akta kelahiran", "Kartu keluarga", "Pas foto"];
const FIRST_GRADE: Record<string, number> = { TK: 0, SD: 1, MI: 1, SMP: 7, MTs: 7, SMA: 10, SMK: 10, MA: 10 };

/** Tahun ajaran tujuan PPDB: mulai Juli, jadi pendaftaran Juli–Desember untuk tahun berikutnya. */
function nextSchoolYear() {
  const [y, m] = todayJakarta().split("-").map(Number);
  const start = m >= 7 ? y + 1 : y;
  return `${start}/${start + 1}`;
}

/** Isian gelombang dari form; dipakai saat membuat maupun mengubah. */
export function periodFromForm(fd: FormData) {
  const documents = str(fd, "documents").split(/\r?\n/).map((d) => d.trim()).filter(Boolean);
  if (documents.length > 10) throw new Error("Maksimal 10 jenis berkas");
  if (new Set(documents.map((d) => d.toLowerCase())).size !== documents.length) throw new Error("Nama berkas tidak boleh sama");
  const schoolYear = str(fd, "school_year");
  if (!/^\d{4}\/\d{4}$/.test(schoolYear)) throw new Error("Tahun ajaran ditulis seperti 2027/2028");
  const quota = optStr(fd, "quota");
  return {
    title: str(fd, "title"), school_year: schoolYear, grade_level: Number(str(fd, "grade_level")),
    opens_on: str(fd, "opens_on"), closes_on: str(fd, "closes_on"),
    quota: quota ? num(fd, "quota") : null, fee_amount: optStr(fd, "fee_amount") ? num(fd, "fee_amount") : 0,
    requirements: optStr(fd, "requirements"), documents, is_published: fd.get("is_published") === "on",
  };
}

export function PeriodFields({ p, level }: { p?: Period; level?: string | null }) {
  const today = todayJakarta();
  return (
    <div className="@container"><div className="grid gap-4 @lg:grid-cols-2">
      <Field label="Nama gelombang" className="@lg:col-span-2"><Input id="title" name="title" required minLength={3} maxLength={120} defaultValue={p?.title ?? "Gelombang 1"} /></Field>
      <Field label="Tahun ajaran"><Input id="school_year" name="school_year" required pattern="\d{4}/\d{4}" defaultValue={p?.school_year ?? nextSchoolYear()} /></Field>
      <Field label="Kelas tujuan">
        <Select id="grade_level" name="grade_level" defaultValue={String(p?.grade_level ?? FIRST_GRADE[level ?? ""] ?? 1)}>
          {Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>{gradeLabel(i)}</option>)}
        </Select>
      </Field>
      <Field label="Dibuka"><Input id="opens_on" name="opens_on" type="date" required defaultValue={p?.opens_on ?? today} /></Field>
      <Field label="Ditutup"><Input id="closes_on" name="closes_on" type="date" required defaultValue={p?.closes_on ?? ""} /></Field>
      <Field label="Kuota (opsional)"><Input id="quota" name="quota" inputMode="numeric" defaultValue={p?.quota ?? ""} /></Field>
      <Field label="Biaya pendaftaran (Rp)" hint="Kosongkan bila gratis"><Input id="fee_amount" name="fee_amount" inputMode="numeric" defaultValue={p?.fee_amount || ""} /></Field>
      <Field label="Berkas wajib" hint="Satu per baris" className="@lg:col-span-2">
        <Textarea id="documents" name="documents" rows={4} defaultValue={(p?.documents ?? DEFAULT_DOCS).join("\n")} />
      </Field>
      <Field label="Syarat & informasi (tampil di halaman publik)" className="@lg:col-span-2">
        <Textarea id="requirements" name="requirements" rows={4} defaultValue={p?.requirements ?? ""}
          placeholder="Contoh: Usia minimal 12 tahun per 1 Juli. Biaya ditransfer ke rekening BSI 123456 a.n. Yayasan …" />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-ink @lg:col-span-2">
        <input type="checkbox" name="is_published" defaultChecked={p?.is_published ?? true} className="size-4 accent-[var(--color-brand-solid)]" />
        Tampilkan di halaman PPDB publik
      </label>
    </div></div>
  );
}
