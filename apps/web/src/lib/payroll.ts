import { rupiah, type Tone } from "@/lib/format";
import type { Role } from "@/lib/session";

export type Calc = "fixed" | "per_attendance" | "per_jp" | "per_late" | "per_absence" | "percent_base";
export type RunStatus = "draft" | "approved" | "paid";

export const CALC_LABEL: Record<Calc, string> = {
  fixed: "Tetap per bulan",
  per_attendance: "Per hari hadir",
  per_jp: "Per JP mengajar",
  per_late: "Per hari terlambat",
  per_absence: "Per hari alpa",
  percent_base: "% dari gaji pokok",
};

export const STAFF_STATUS: Record<string, string> = {
  gty: "Guru tetap yayasan (GTY)",
  gtt: "Guru tidak tetap (GTT)",
  pty: "Pegawai tetap yayasan (PTY)",
  ptt: "Pegawai tidak tetap (PTT)",
  pns: "PNS",
  pppk: "PPPK",
  honorer: "Honorer",
};

export const STAFF_SHORT: Record<string, string> = { gty: "GTY", gtt: "GTT", pty: "PTY", ptt: "PTT", pns: "PNS", pppk: "PPPK", honorer: "Honorer" };

export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draf", tone: "neutral" },
  approved: { label: "Disetujui, belum dibayar", tone: "info" },
  paid: { label: "Dibayar", tone: "good" },
};

/** Peran yang mengelola (TU, admin) dan yang menyetujui (kepala sekolah, admin) penggajian. */
export const MANAGERS: Role[] = ["finance", "school_admin"];
export const APPROVERS: Role[] = ["principal", "school_admin"];
export const STAFF_ROLES = ["school_admin", "principal", "teacher", "counselor", "finance", "canteen"] as const;

export interface SlipLine { name: string; kind: "earning" | "deduction"; calc: Calc; qty: number | null; rate: number; amount: number }
export interface Adjustment { label: string; amount: number }
export interface Attendance { hadir: number; terlambat: number; izin: number; sakit: number; cuti: number; dinas: number; alpa: number; jp_week: number; jp: number }
export interface Slip {
  id: string; run_id: string; employee_id: string; full_name: string; position: string | null; status: string;
  base_salary: number; attendance: Attendance; lines: SlipLine[]; adjustments: Adjustment[];
  gross: number; deductions: number; net: number;
}

/** "Oktober 2026" dari tanggal periode 2026-10-01. */
export function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Rincian hitungan satu baris slip, misalnya "4 hari × Rp20.000". */
export function lineDetail(l: SlipLine) {
  const rate = rupiah(l.rate);
  switch (l.calc) {
    case "per_attendance": case "per_late": case "per_absence": return `${l.qty} hari × ${rate}`;
    case "per_jp": return `${l.qty} JP × ${rate}`;
    case "percent_base": return `${Number(l.rate)}% × gaji pokok`;
    default: return "";
  }
}

export function rateLabel(calc: Calc, rate: number) {
  return calc === "percent_base" ? `${Number(rate)}%` : rupiah(rate);
}
