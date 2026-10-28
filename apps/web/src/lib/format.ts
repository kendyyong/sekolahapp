const TZ = "Asia/Jakarta";

export function rupiah(n: number | string | null | undefined): string {
  return "Rp" + Number(n ?? 0).toLocaleString("id-ID");
}

export function tanggal(d: string | Date | null | undefined, withDay = false): string {
  if (!d) return "–";
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00+07:00") : new Date(d);
  return date.toLocaleDateString("id-ID", {
    timeZone: TZ, day: "numeric", month: "short", year: "numeric", ...(withDay ? { weekday: "long" } : {}),
  });
}

export function waktu(d: string | Date | null | undefined): string {
  if (!d) return "–";
  return new Date(d).toLocaleString("id-ID", {
    timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function jam(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "–";
}

export function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export const HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  draft: "Draf",
  revision: "Perlu perbaikan",
  verified: "Terverifikasi",
  unpaid: "Belum bayar",
  partial: "Sebagian",
  paid: "Lunas",
  void: "Batal",
  expired: "Kedaluwarsa",
  failed: "Gagal",
  hadir: "Hadir",
  terlambat: "Terlambat",
  izin: "Izin",
  sakit: "Sakit",
  alpa: "Alpa",
  cuti: "Cuti",
  dinas: "Dinas",
  baru: "Baru",
  dikerjakan: "Dikerjakan",
  selesai: "Selesai",
  invited: "Diundang",
  accepted: "Bergabung",
  declined: "Menolak",
};

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

export const STATUS_TONE: Record<string, Tone> = {
  pending: "warn", approved: "good", rejected: "bad", cancelled: "neutral",
  draft: "neutral", revision: "warn", verified: "good",
  unpaid: "warn", partial: "info", paid: "good", void: "neutral", expired: "neutral", failed: "bad",
  hadir: "good", terlambat: "warn", izin: "info", sakit: "info", alpa: "bad", cuti: "info", dinas: "info",
  baru: "warn", dikerjakan: "info", selesai: "good",
  invited: "warn", accepted: "good", declined: "neutral",
};
