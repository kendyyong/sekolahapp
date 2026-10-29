"use client";
import { type RefObject, useEffect, useState } from "react";
import jsQR from "jsqr";

/**
 * Membaca QR dari kamera ke elemen <video>: BarcodeDetector bila tersedia (Chrome Android),
 * selain itu jsQR. Dipakai kios absen dan kasir kantin. Mengembalikan pesan galat kamera.
 */
export function useQrCamera(enabled: boolean, video: RefObject<HTMLVideoElement | null>, onCode: (code: string) => unknown, onFail?: () => void) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;

    const tick = async () => {
      const v = video.current;
      if (stopped || !v) return;
      if (v.readyState >= 2) {
        let code: string | null = null;
        if (detector) {
          code = (await detector.detect(v).catch(() => []))[0]?.rawValue ?? null;
        } else if (ctx) {
          canvas.width = v.videoWidth; canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data ?? null;
        }
        if (code) await onCode(code);
      }
      timer = setTimeout(tick, 250);
    };

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (video.current) { video.current.srcObject = s; void video.current.play(); }
        setError(null);
        void tick();
      })
      .catch(() => { setError("Kamera tidak bisa dibuka. Izinkan akses kamera atau pakai pemindai USB."); onFail?.(); });

    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [enabled, video, onCode, onFail]);
  return error;
}

/** Bunyi singkat: nada tinggi berhasil, nada rendah gagal. */
export function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.4));
    osc.onended = () => ctx.close();
  } catch { /* perangkat tanpa audio */ }
}
