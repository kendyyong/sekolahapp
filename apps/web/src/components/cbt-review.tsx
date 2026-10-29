import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { KIND_LABEL, keyText, LETTERS, type QuestionKind } from "@/lib/cbt";
import { Badge, cx } from "@/components/ui";

export interface ReviewItem {
  id: string; no: number; kind: QuestionKind; prompt: string; image_path: string | null; options: string[] | null;
  key: unknown; explanation: string | null; max: number; answer: unknown; points: number | null; manual: number | null;
}

/** Hasil RPC cbt_result. */
export interface CbtResult {
  attempt_id: string; exam_id: string; title: string; ends_at: string;
  student: { id: string; full_name: string; nis: string | null };
  started_at: string; submitted_at: string | null; leave_count: number; needs_review: boolean;
  score: number | null; answered: number; total: number; review: ReviewItem[] | null;
}

function answerText(q: ReviewItem) {
  const a = q.answer;
  if (a == null || a === "") return null;
  switch (q.kind) {
    case "pg": return `${LETTERS[a as number]}. ${q.options?.[a as number] ?? ""}`;
    case "pg_kompleks": return (a as number[]).slice().sort().map((i) => LETTERS[i]).join(", ");
    case "benar_salah": return a ? "Benar" : "Salah";
    default: return String(a);
  }
}

/** Daftar soal beserta jawaban murid, kunci, skor, dan pembahasan. */
export function ReviewList({ review, images, gradeSlot }: {
  review: ReviewItem[]; images: Record<string, string>; gradeSlot?: (q: ReviewItem) => ReactNode;
}) {
  return (
    <ol className="flex flex-col gap-4">
      {review.map((q) => {
        const full = q.points != null && Number(q.points) >= Number(q.max);
        const chosen = new Set(q.kind === "pg" && q.answer != null ? [q.answer as number] : q.kind === "pg_kompleks" ? (q.answer as number[] ?? []) : []);
        const keys = new Set(q.kind === "pg" ? [q.key as number] : q.kind === "pg_kompleks" ? (q.key as number[]) : []);
        return (
          <li key={q.id} className="rounded-xl border border-line bg-sheet p-5 shadow-card">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-bold text-ink">Soal {q.no}</span>
              <Badge>{KIND_LABEL[q.kind]}</Badge>
              <span className="ml-auto">
                {q.points == null ? <Badge tone="warn">Belum dinilai</Badge>
                  : <Badge tone={full ? "good" : Number(q.points) > 0 ? "warn" : "bad"}>{Number(q.points)} / {Number(q.max)} poin</Badge>}
              </span>
            </div>
            <p className="whitespace-pre-line text-ink">{q.prompt}</p>
            {q.image_path && images[q.image_path] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[q.image_path]} alt={`Gambar soal ${q.no}`} className="mt-3 max-h-64 rounded-lg border border-line" />
            )}
            {q.options ? (
              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {q.options.map((o, i) => (
                  <li key={i} className={cx("flex items-start gap-2 rounded-lg border px-3 py-2",
                    keys.has(i) ? "border-good/40 bg-good-soft" : chosen.has(i) ? "border-bad/40 bg-bad-soft" : "border-line")}>
                    <span className="font-bold text-muted">{LETTERS[i]}.</span>
                    <span className="flex-1 text-ink">{o}</span>
                    {chosen.has(i) && <span className="text-xs font-semibold text-muted">jawaban murid</span>}
                    {keys.has(i) ? <Check aria-label="kunci" className="size-4 text-good" /> : chosen.has(i) && <X aria-label="salah" className="size-4 text-bad" />}
                  </li>
                ))}
              </ul>
            ) : (
              <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
                <dt className="text-muted">Jawaban murid</dt>
                <dd className="whitespace-pre-line text-ink">{answerText(q) ?? <span className="text-muted">Tidak dijawab</span>}</dd>
                {q.kind !== "uraian" && (<><dt className="text-muted">Kunci</dt><dd className="font-semibold text-good">{keyText({ kind: q.kind, answer: q.key, options: q.options })}</dd></>)}
              </dl>
            )}
            {q.explanation && (
              <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm text-muted">
                <span className="font-semibold text-ink">{q.kind === "uraian" ? "Pedoman: " : "Pembahasan: "}</span>{q.explanation}
              </p>
            )}
            {q.kind === "uraian" && gradeSlot?.(q)}
          </li>
        );
      })}
    </ol>
  );
}
