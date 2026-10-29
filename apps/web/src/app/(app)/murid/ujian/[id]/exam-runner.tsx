"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CloudCheck, CloudOff, LoaderCircle, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LETTERS, type QuestionKind } from "@/lib/cbt";
import { Button, cx } from "@/components/ui";

export interface PaperQuestion {
  id: string; no: number; kind: QuestionKind; prompt: string; image_path: string | null;
  options: { i: number; text: string }[] | null; answer: unknown; flagged: boolean;
}
export interface Paper {
  attempt: { id: string; started_at: string; deadline_at: string; submitted_at: string | null; server_now: string };
  exam: { id: string; title: string; instructions: string | null; subject: string; class: string; duration_minutes: number; ends_at: string };
  questions: PaperQuestion[] | null;
}

type SaveState = "saved" | "saving" | "error";
const isAnswered = (a: unknown) => a != null && a !== "" && !(Array.isArray(a) && a.length === 0);

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Lembar ujian murid: jawaban tersimpan otomatis, waktu habis → dikumpulkan otomatis. */
export function ExamRunner({ paper, images }: { paper: Paper; images: Record<string, string> }) {
  const router = useRouter();
  const sb = useRef(createClient()).current;
  const questions = paper.questions ?? [];
  const attempt = paper.attempt.id;
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => Object.fromEntries(questions.map((q) => [q.id, q.answer])));
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set(questions.filter((q) => q.flagged).map((q) => q.id)));
  const [idx, setIdx] = useState(0);
  const [save, setSave] = useState<Record<string, SaveState>>({});
  const [confirm, setConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Selisih jam perangkat dengan server supaya hitung mundur tidak tertipu jam HP yang salah.
  const offset = useRef(Date.parse(paper.attempt.server_now) - Date.now());
  const deadline = Date.parse(paper.attempt.deadline_at);
  const [left, setLeft] = useState(() => deadline - (Date.now() + offset.current));
  const pending = useRef(new Map<string, { answer: unknown; flag: boolean | null }>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const done = useRef(false);

  const finished = useCallback(() => {
    if (done.current) return;
    done.current = true;
    // Buang ?ok=… dari halaman mulai supaya pesan lama tidak tampil di halaman hasil.
    router.replace(window.location.pathname);
    router.refresh();
  }, [router]);

  const send = useCallback(async (qid: string) => {
    const item = pending.current.get(qid);
    if (!item || done.current) return;
    pending.current.delete(qid);
    setSave((s) => ({ ...s, [qid]: "saving" }));
    const { data, error } = await sb.rpc("cbt_answer", { p_attempt: attempt, p_question: qid, p_answer: item.answer ?? null, p_flagged: item.flag });
    if (error) {
      // Koneksi putus: simpan lagi (jawaban terbaru menang) beberapa detik kemudian.
      if (!pending.current.has(qid)) pending.current.set(qid, item);
      setSave((s) => ({ ...s, [qid]: "error" }));
      timers.current.set(qid, setTimeout(() => send(qid), 4000));
      return;
    }
    if (data === false) return finished();
    setSave((s) => ({ ...s, [qid]: pending.current.has(qid) ? "saving" : "saved" }));
  }, [sb, attempt, finished]);

  const queue = useCallback((qid: string, answer: unknown, flag: boolean | null, delay = 0) => {
    const prev = pending.current.get(qid);
    pending.current.set(qid, { answer, flag: flag ?? prev?.flag ?? null });
    setSave((s) => ({ ...s, [qid]: "saving" }));
    clearTimeout(timers.current.get(qid));
    timers.current.set(qid, setTimeout(() => send(qid), delay));
  }, [send]);

  const flush = useCallback(async () => {
    for (const t of timers.current.values()) clearTimeout(t);
    await Promise.all([...pending.current.keys()].map((qid) => send(qid)));
  }, [send]);

  const submit = useCallback(async () => {
    setFinishing(true);
    setError(null);
    await flush();
    const { error } = await sb.rpc("cbt_submit", { p_attempt: attempt });
    if (error) { setFinishing(false); setError("Gagal mengumpulkan. Periksa koneksi internet lalu coba lagi."); return; }
    finished();
  }, [flush, sb, attempt, finished]);

  useEffect(() => {
    const t = setInterval(() => {
      const ms = deadline - (Date.now() + offset.current);
      setLeft(ms);
      if (ms <= 0 && !done.current) { clearInterval(t); submit(); }
    }, 1000);
    return () => clearInterval(t);
  }, [deadline, submit]);

  useEffect(() => {
    let last = 0;
    const onHide = () => {
      if (document.visibilityState !== "hidden" || done.current || Date.now() - last < 5000) return;
      last = Date.now();
      sb.rpc("cbt_log_leave", { p_attempt: attempt }).then(() => {});
    };
    const onUnload = (ev: BeforeUnloadEvent) => { if (pending.current.size) ev.preventDefault(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => { document.removeEventListener("visibilitychange", onHide); window.removeEventListener("beforeunload", onUnload); };
  }, [sb, attempt]);

  if (!questions.length) return null;
  const q = questions[idx];
  const a = answers[q.id];
  const setAnswer = (value: unknown, delay = 0) => { setAnswers((s) => ({ ...s, [q.id]: value })); queue(q.id, value, null, delay); };
  const toggleFlag = () => {
    const on = !flagged.has(q.id);
    setFlagged((s) => { const n = new Set(s); if (on) n.add(q.id); else n.delete(q.id); return n; });
    queue(q.id, answers[q.id], on);
  };
  const unanswered = questions.filter((x) => !isAnswered(answers[x.id])).length;
  const states = Object.values(save);
  const status = states.includes("error") ? "error" : states.includes("saving") ? "saving" : "saved";
  const urgent = left < 5 * 60_000;

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-sheet/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-ink">{paper.exam.title}</div>
          <div className="text-xs text-muted">{paper.exam.subject} · Soal {idx + 1} dari {questions.length}</div>
        </div>
        <span className={cx("flex items-center gap-1.5 text-xs", status === "error" ? "text-bad" : "text-muted")} aria-live="polite">
          {status === "saving" ? <><LoaderCircle aria-hidden className="size-4 animate-spin" />Menyimpan…</>
            : status === "error" ? <><CloudOff aria-hidden className="size-4" />Belum tersimpan, mencoba lagi…</>
            : <><CloudCheck aria-hidden className="size-4" />Tersimpan</>}
        </span>
        <span className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums",
          urgent ? "bg-bad-soft text-bad" : "bg-paper text-ink")} role="timer" aria-label="Sisa waktu">
          <Timer aria-hidden className="size-5" />{clock(left)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0 rounded-xl border border-line bg-sheet p-5 shadow-card sm:p-6" aria-labelledby="q-title">
          <h2 id="q-title" className="mb-3 text-sm font-semibold text-muted">Soal {idx + 1}
            {q.kind === "pg_kompleks" && <span className="font-normal"> · pilih semua jawaban yang benar</span>}
          </h2>
          <p className="whitespace-pre-line text-[1.0625rem] leading-relaxed text-ink">{q.prompt}</p>
          {q.image_path && images[q.image_path] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={images[q.image_path]} alt={`Gambar soal ${idx + 1}`} className="mt-4 max-h-80 max-w-full rounded-lg border border-line" />
          )}

          <div className="mt-5">
            {q.options && (
              <div className="flex flex-col gap-2" role={q.kind === "pg" ? "radiogroup" : "group"} aria-labelledby="q-title">
                {q.options.map((o, k) => {
                  const picked = q.kind === "pg" ? a === o.i : Array.isArray(a) && (a as number[]).includes(o.i);
                  return (
                    <button key={o.i} type="button" role={q.kind === "pg" ? "radio" : "checkbox"} aria-checked={picked}
                      onClick={() => {
                        if (q.kind === "pg") setAnswer(o.i);
                        else {
                          const cur = Array.isArray(a) ? (a as number[]) : [];
                          setAnswer(picked ? cur.filter((x) => x !== o.i) : [...cur, o.i]);
                        }
                      }}
                      className={cx("flex items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                        picked ? "border-brand bg-brand-soft" : "border-line hover:bg-paper")}>
                      <span className={cx("flex size-7 shrink-0 items-center justify-center text-sm font-bold",
                        q.kind === "pg" ? "rounded-full" : "rounded-md",
                        picked ? "bg-brand-solid text-white" : "border border-line text-muted")}>{LETTERS[k]}</span>
                      <span className="pt-0.5 text-ink">{o.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {q.kind === "benar_salah" && (
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="q-title">
                {[true, false].map((v) => (
                  <button key={String(v)} type="button" role="radio" aria-checked={a === v} onClick={() => setAnswer(v)}
                    className={cx("rounded-lg border px-4 py-3 font-semibold", a === v ? "border-brand bg-brand-soft text-brand" : "border-line text-ink hover:bg-paper")}>
                    {v ? "Benar" : "Salah"}
                  </button>
                ))}
              </div>
            )}
            {q.kind === "isian" && (
              <input key={q.id} aria-label="Jawaban" maxLength={500} defaultValue={(a as string) ?? ""} autoComplete="off"
                onChange={(e) => setAnswer(e.target.value, 1000)} onBlur={() => flush()}
                className="w-full rounded-lg border border-line bg-sheet px-4 py-3 text-ink focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15" />
            )}
            {q.kind === "uraian" && (
              <textarea key={q.id} aria-label="Jawaban" rows={8} maxLength={10000} defaultValue={(a as string) ?? ""}
                onChange={(e) => setAnswer(e.target.value, 1500)} onBlur={() => flush()}
                className="w-full rounded-lg border border-line bg-sheet px-4 py-3 text-ink focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15" />
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <Button variant="secondary" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft aria-hidden className="size-4" />Sebelumnya</Button>
            <label className={cx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold",
              flagged.has(q.id) ? "border-warn/40 bg-warn-soft text-warn" : "border-line text-muted")}>
              <input type="checkbox" checked={flagged.has(q.id)} onChange={toggleFlag} className="size-4 accent-[var(--color-warn)]" />Ragu-ragu
            </label>
            {idx < questions.length - 1
              ? <Button onClick={() => setIdx(idx + 1)}>Berikutnya<ChevronRight aria-hidden className="size-4" /></Button>
              : <Button onClick={() => setConfirm(true)}>Selesai</Button>}
          </div>
        </section>

        <aside className="h-fit rounded-xl border border-line bg-sheet p-4 shadow-card lg:sticky lg:top-24">
          <h2 className="mb-3 text-sm font-semibold text-ink">Nomor soal</h2>
          <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {questions.map((x, i) => (
              <button key={x.id} type="button" onClick={() => setIdx(i)} aria-label={`Soal ${i + 1}`} aria-current={i === idx ? "step" : undefined}
                className={cx("h-9 rounded-md text-sm font-semibold tabular-nums",
                  flagged.has(x.id) ? "bg-warn text-white" : isAnswered(answers[x.id]) ? "bg-brand-solid text-white" : "border border-line text-ink",
                  i === idx && "ring-2 ring-ink ring-offset-1")}>
                {i + 1}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-brand-solid" />Dijawab</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-sm bg-warn" />Ragu-ragu</span>
            <span className="flex items-center gap-1"><span className="size-3 rounded-sm border border-line" />Kosong</span>
          </div>
          <Button className="mt-4 w-full" onClick={() => setConfirm(true)}>Kumpulkan jawaban</Button>
        </aside>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="w-full max-w-sm rounded-xl bg-sheet p-5 shadow-xl">
            <h2 id="confirm-title" className="text-lg font-bold text-ink">Kumpulkan sekarang?</h2>
            <p className="mt-2 text-sm text-muted">
              {unanswered ? `${unanswered} soal belum dijawab. ` : "Semua soal sudah dijawab. "}
              {flagged.size ? `${flagged.size} soal masih ditandai ragu-ragu. ` : ""}
              Setelah dikumpulkan, jawaban tidak bisa diubah.
            </p>
            {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(false)} disabled={finishing}>Kembali</Button>
              <Button onClick={submit} disabled={finishing} aria-busy={finishing}>
                {finishing && <LoaderCircle aria-hidden className="size-4 animate-spin" />}{finishing ? "Mengumpulkan…" : "Ya, kumpulkan"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {finishing && !confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 text-white" role="status">Waktu habis. Mengumpulkan jawaban…</div>
      )}
    </div>
  );
}
