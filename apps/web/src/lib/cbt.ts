/** Ujian online (CBT): tipe data, label, dan pengurai impor soal. Dipakai di server maupun klien. */

export type QuestionKind = "pg" | "pg_kompleks" | "benar_salah" | "isian" | "uraian";

export const KIND_LABEL: Record<QuestionKind, string> = {
  pg: "Pilihan ganda",
  pg_kompleks: "Pilihan ganda kompleks",
  benar_salah: "Benar / salah",
  isian: "Isian singkat",
  uraian: "Uraian",
};

export const KIND_HINT: Record<QuestionKind, string> = {
  pg: "Satu jawaban benar",
  pg_kompleks: "Bisa lebih dari satu jawaban benar; murid harus memilih semuanya",
  benar_salah: "Murid memilih Benar atau Salah",
  isian: "Jawaban singkat; huruf besar/kecil dan spasi diabaikan",
  uraian: "Dinilai guru secara manual",
};

export const MEDIA_BUCKET = "exam-media";
export const LETTERS = "ABCDEFGH";
export const MAX_OPTIONS = 8;

export interface Exam {
  id: string; teaching_assignment_id: string; title: string; instructions: string | null;
  starts_at: string; ends_at: string; duration_minutes: number; token: string | null;
  shuffle_questions: boolean; shuffle_options: boolean; show_score: boolean; show_review: boolean;
  is_published: boolean; assessment_id: string | null;
}

export interface Question {
  id: string; position: number; kind: QuestionKind; prompt: string; image_path: string | null;
  options: string[] | null; answer: unknown; points: number; explanation: string | null;
}

/** Status ujian menurut jadwal. */
export function examPhase(e: Pick<Exam, "is_published" | "starts_at" | "ends_at">, now = Date.now()) {
  if (!e.is_published) return { label: "Draf", tone: "neutral" as const };
  if (now < Date.parse(e.starts_at)) return { label: "Terjadwal", tone: "info" as const };
  if (now < Date.parse(e.ends_at)) return { label: "Berlangsung", tone: "good" as const };
  return { label: "Selesai", tone: "neutral" as const };
}

/** ISO → nilai input datetime-local dalam WIB. */
export function toWibInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(Date.parse(iso) + 7 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Nilai input datetime-local (WIB) → ISO. */
export function fromWibInput(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error("Tanggal & jam belum diisi lengkap");
  return new Date(`${v}:00+07:00`).toISOString();
}

/** Token acak tanpa huruf yang mudah tertukar (O/0, I/1). */
export function randomToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

/** Teks kunci jawaban untuk ditampilkan. */
export function keyText(q: Pick<Question, "kind" | "answer" | "options">) {
  switch (q.kind) {
    case "pg": return LETTERS[q.answer as number] ?? "–";
    case "pg_kompleks": return ((q.answer as number[]) ?? []).slice().sort().map((i) => LETTERS[i]).join(", ");
    case "benar_salah": return q.answer ? "Benar" : "Salah";
    case "isian": return ((q.answer as string[]) ?? []).join(" / ");
    default: return "Dinilai guru";
  }
}

export interface ParsedQuestion {
  kind: QuestionKind; prompt: string; options: string[] | null; answer: unknown; points: number; explanation: string | null;
}

/**
 * Mengurai soal yang ditempel dari Word/Docs, contoh:
 *
 *   1. Hasil 1/2 + 1/4 adalah ...
 *   A. 3/4
 *   B. 2/6
 *   Kunci: A
 *   Bobot: 2
 *   Pembahasan: samakan penyebut.
 *
 * Kunci "A, C" → pilihan ganda kompleks; tanpa pilihan: "Benar"/"Salah" → benar/salah,
 * teks lain → isian (pisahkan jawaban alternatif dengan |); tanpa kunci → uraian.
 */
export function parseQuestions(text: string): ParsedQuestion[] {
  const blocks: string[][] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const start = line.match(/^(\d{1,3})\s*[.)]\s*(.*)$/);
    if (start) blocks.push([start[2]]);
    else if (line && blocks.length) blocks[blocks.length - 1].push(line);
    else if (line) blocks.push([line]);
  }
  return blocks.map((lines, n) => {
    const no = n + 1;
    const prompt: string[] = [];
    const options: string[] = [];
    let key: string | null = null, points = 1, explanation: string | null = null, essay = false;
    for (const line of lines) {
      const opt = line.match(/^([A-Ha-h])\s*[.)]\s+(.+)$/);
      const field = line.match(/^(kunci(?: jawaban)?|jawaban|bobot|skor|pembahasan)\s*:\s*(.*)$/i);
      if (field) {
        const name = field[1].toLowerCase();
        if (name.startsWith("kunci") || name === "jawaban") key = field[2].trim();
        else if (name === "bobot" || name === "skor") {
          points = Number(field[2].replace(",", "."));
          if (!(points > 0 && points <= 100)) throw new Error(`Soal ${no}: bobot harus angka 1–100`);
        } else explanation = field[2].trim() || null;
      } else if (/^\(?uraian\)?$/i.test(line)) essay = true;
      else if (opt && (options.length > 0 || prompt.length > 0) && opt[1].toUpperCase() === LETTERS[options.length]) options.push(opt[2].trim());
      else if (options.length) options[options.length - 1] += `\n${line}`;
      else prompt.push(line);
    }
    const body = prompt.join("\n").trim();
    if (!body) throw new Error(`Soal ${no}: teks soal kosong`);
    if (options.length > MAX_OPTIONS) throw new Error(`Soal ${no}: pilihan maksimal ${MAX_OPTIONS}`);
    const base = { prompt: body, points, explanation };
    if (options.length) {
      if (options.length < 2) throw new Error(`Soal ${no}: pilihan minimal 2`);
      const letters = (key ?? "").toUpperCase().split(/[\s,;/&]+|\bdan\b/i).filter(Boolean);
      const idx = letters.map((l) => LETTERS.indexOf(l));
      if (!letters.length) throw new Error(`Soal ${no}: tulis "Kunci: A" (atau huruf lain)`);
      if (idx.some((i) => i < 0 || i >= options.length)) throw new Error(`Soal ${no}: kunci "${key}" tidak ada di pilihan`);
      const uniq = [...new Set(idx)];
      return uniq.length === 1 ? { ...base, kind: "pg", options, answer: uniq[0] } : { ...base, kind: "pg_kompleks", options, answer: uniq };
    }
    if (essay || !key || key === "-") return { ...base, kind: "uraian", options: null, answer: null };
    if (/^(b|benar|true)$/i.test(key)) return { ...base, kind: "benar_salah", options: null, answer: true };
    if (/^(s|salah|false)$/i.test(key)) return { ...base, kind: "benar_salah", options: null, answer: false };
    const accepted = key.split("|").map((k) => k.trim()).filter(Boolean);
    if (accepted.length > 10) throw new Error(`Soal ${no}: jawaban isian maksimal 10 variasi`);
    return { ...base, kind: "isian", options: null, answer: accepted };
  });
}
