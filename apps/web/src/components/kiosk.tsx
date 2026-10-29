"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SchoolMark } from "@/components/school-mark";
import { cx } from "@/components/ui";
import { beep, useQrCamera } from "@/components/use-qr-camera";

type Direction = "in" | "out";
interface ScanOk {
  ok: true; at: string; full_name: string; class_name: string; nis: string | null;
  status: string; direction: Direction; duplicate: boolean;
}
interface ScanErr { ok: false; at: string; message: string }
type Scan = ScanOk | ScanErr;

const STATUS: Record<string, string> = { hadir: "Hadir", terlambat: "Terlambat", izin: "Izin", sakit: "Sakit", alpa: "Alpa" };
const REPEAT_MS = 4000;

function headline(s: ScanOk) {
  if (s.duplicate) return s.direction === "in" ? "Sudah absen masuk" : "Sudah absen pulang";
  if (s.direction === "out") return "Hati-hati di jalan";
  return s.status === "terlambat" ? "Terlambat" : "Selamat datang";
}

function tone(s: Scan) {
  if (!s.ok) return "bad";
  return s.status === "terlambat" && s.direction === "in" && !s.duplicate ? "warn" : "good";
}

const clockIn = (timeZone: string) => () => new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone });

/**
 * Kios absen: pemindai QR USB/Bluetooth (bekerja seperti keyboard + Enter) atau kamera perangkat.
 * Dipakai di tablet gerbang, laptop piket, atau HP guru.
 */
export function Kiosk({ schoolName, logo, timeZone }: { schoolName: string; logo: string | null; timeZone: string }) {
  const sb = useMemo(() => createClient(), []);
  const clock = useMemo(() => clockIn(timeZone), [timeZone]);
  // Setelah pukul 12 waktu sekolah, kios otomatis mencatat pulang.
  const [direction, setDirection] = useState<Direction>(() => (Number(clock().slice(0, 2)) >= 12 ? "out" : "in"));
  const [last, setLast] = useState<Scan | null>(null);
  const [log, setLog] = useState<Scan[]>([]);
  const [now, setNow] = useState(clock);
  const [camera, setCamera] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const recent = useRef(new Map<string, number>());
  const dirRef = useRef(direction);
  dirRef.current = direction;

  const submit = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const t = Date.now();
    const key = `${dirRef.current}:${code}`;
    if ((recent.current.get(key) ?? 0) > t - REPEAT_MS) return;   // kartu masih menempel di kamera
    recent.current.set(key, t);
    const { data, error } = await sb.rpc("card_scan", { p_code: code, p_direction: dirRef.current });
    const scan: Scan = error ? { ok: false, at: clock(), message: error.message } : { ok: true, at: clock(), ...(data as Omit<ScanOk, "ok" | "at">) };
    setLast(scan);
    setLog((l) => [scan, ...l].slice(0, 12));
    beep(scan.ok);
  }, [sb, clock]);

  // Jam & menjaga fokus di kotak input agar pemindai USB selalu masuk.
  useEffect(() => {
    const id = setInterval(() => {
      setNow(clock());
      if (document.activeElement === document.body) input.current?.focus();
    }, 1000);
    return () => clearInterval(id);
  }, [clock]);

  const stopCamera = useCallback(() => setCamera(false), []);
  const camError = useQrCamera(camera, video, submit, stopCamera);

  const t = last ? tone(last) : null;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sheet px-4 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <SchoolMark name={schoolName} logo={logo} className="size-12" />
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Kios Absen</div>
            <div className="text-lg font-extrabold text-ink">{schoolName}</div>
          </div>
        </div>
        <div className="text-3xl font-extrabold tabular-nums text-ink">{now}</div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Arah absen" className="flex rounded-lg border border-line p-1">
            {(["in", "out"] as const).map((d) => (
              <button key={d} role="radio" aria-checked={direction === d} onClick={() => { setDirection(d); input.current?.focus(); }}
                className={cx("rounded-md px-4 py-2 text-sm font-bold", direction === d ? "bg-brand-solid text-white" : "text-muted hover:text-ink")}>
                {d === "in" ? "Masuk" : "Pulang"}
              </button>
            ))}
          </div>
          <button onClick={() => setCamera((c) => !c)}
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-paper">
            {camera ? "Matikan kamera" : "Pakai kamera"}
          </button>
          <button onClick={() => void document.documentElement.requestFullscreen?.()}
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-paper">Layar penuh</button>
          <Link href="/mulai" className="px-2 text-sm font-semibold text-muted hover:text-ink">Keluar</Link>
        </div>
      </header>

      <main className="grid flex-1 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-8">
        <section className="flex flex-col gap-4">
          <div aria-live="assertive" className={cx(
            "flex min-h-[260px] flex-1 flex-col items-center justify-center rounded-2xl border-2 p-8 text-center",
            t === "good" && "border-good bg-good-soft", t === "warn" && "border-warn bg-warn-soft",
            t === "bad" && "border-bad bg-bad-soft", !t && "border-dashed border-line bg-sheet")}>
            {!last ? (
              <>
                <div className="text-3xl font-extrabold text-ink text-balance">Tempelkan kartu pelajar</div>
                <p className="mt-2 text-muted">Absen {direction === "in" ? "masuk" : "pulang"} · arahkan QR kartu ke pemindai atau kamera</p>
              </>
            ) : last.ok ? (
              <>
                <div className={cx("text-lg font-bold uppercase tracking-wide", t === "warn" ? "text-warn" : "text-good")}>{headline(last)}</div>
                <div className="mt-2 text-5xl font-extrabold tracking-tight text-ink text-balance">{last.full_name}</div>
                <div className="mt-3 text-xl text-muted">
                  Kelas {last.class_name} · {last.direction === "in" ? STATUS[last.status] ?? last.status : "Pulang"} · {last.at}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold uppercase tracking-wide text-bad">Tidak tercatat</div>
                <div className="mt-2 text-3xl font-extrabold text-ink text-balance">{last.message}</div>
                <p className="mt-2 text-muted">Hubungi guru piket bila kartu bermasalah.</p>
              </>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); const v = input.current?.value ?? ""; if (input.current) input.current.value = ""; void submit(v); }}
            className="flex gap-2">
            <label htmlFor="kiosk-code" className="sr-only">Kode kartu</label>
            <input ref={input} id="kiosk-code" autoFocus autoComplete="off" spellCheck={false}
              placeholder="Pemindai USB mengetik di sini otomatis, atau ketik kode kartu lalu Enter"
              className="min-w-0 flex-1 rounded-lg border border-line bg-sheet px-4 py-3 text-ink placeholder:text-muted" />
            <button className="rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong">Catat</button>
          </form>

          {camera && (
            <video ref={video} muted playsInline aria-label="Kamera pemindai"
              className="mx-auto aspect-video w-full max-w-xl rounded-xl bg-black object-cover" />
          )}
          {camError && <p className="text-sm text-bad">{camError}</p>}
        </section>

        <aside className="rounded-2xl border border-line bg-sheet p-4">
          <h2 className="mb-3 font-bold text-ink">Baru saja</h2>
          {!log.length ? <p className="text-sm text-muted">Belum ada yang absen di perangkat ini.</p> : (
            <ul className="flex flex-col divide-y divide-line">
              {log.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-ink">{s.ok ? s.full_name : s.message}</span>
                  <span className={cx("shrink-0 tabular-nums", s.ok ? (tone(s) === "warn" ? "text-warn" : "text-good") : "text-bad")}>
                    {s.ok ? `${s.direction === "in" ? STATUS[s.status] ?? s.status : "Pulang"} · ${s.at}` : s.at}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}
