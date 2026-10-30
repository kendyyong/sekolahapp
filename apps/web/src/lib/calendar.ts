// Kalender pendidikan: jenis agenda, sasaran, dan pembantu tanggal (tanpa zona waktu, format yyyy-mm-dd).
import type { Tone } from "@/lib/format";

export type CalendarKind = "libur" | "ujian" | "rapor" | "kegiatan" | "akademik" | "lainnya";
export type CalendarAudience = "all" | "staff" | "students";

export interface CalendarEvent {
  id: string; title: string; description: string | null; kind: CalendarKind;
  starts_on: string; ends_on: string; audience: CalendarAudience; notify_members: boolean;
}

export const CALENDAR_COLUMNS = "id, title, description, kind, starts_on, ends_on, audience, notify_members";

export const KIND_LABEL: Record<CalendarKind, string> = {
  libur: "Hari libur",
  ujian: "Ujian / asesmen",
  rapor: "Pembagian rapor",
  kegiatan: "Kegiatan sekolah",
  akademik: "Awal/akhir semester, MPLS",
  lainnya: "Lainnya",
};
export const KIND_SHORT: Record<CalendarKind, string> = {
  libur: "Libur", ujian: "Ujian", rapor: "Rapor", kegiatan: "Kegiatan", akademik: "Akademik", lainnya: "Agenda",
};
export const KIND_TONE: Record<CalendarKind, Tone> = {
  libur: "bad", ujian: "warn", rapor: "good", kegiatan: "info", akademik: "neutral", lainnya: "neutral",
};

export const AUDIENCE_LABEL: Record<CalendarAudience, string> = {
  all: "Semua warga sekolah", staff: "Guru & pegawai", students: "Murid & orang tua",
};

export const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** Tambah n hari ke tanggal yyyy-mm-dd. */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 1 = Senin … 7 = Minggu. */
export function isoDow(iso: string): number {
  return ((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
}

/** "2026-11" → "November 2026". */
export function monthLabel(ym: string): string {
  return `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
}

export function shiftMonth(ym: string, n: number): string {
  const d = new Date(ym + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

/** "3 Nov" atau "3–5 Nov 2026" atau "28 Nov – 2 Des 2026". */
export function rangeLabel(from: string, to: string, withYear = true): string {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const mon = (m: number) => BULAN[m - 1].slice(0, 3);
  const year = (y: number) => (withYear ? ` ${y}` : "");
  if (from === to) return `${d1} ${mon(m1)}${year(y1)}`;
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${mon(m1)}${year(y1)}`;
  if (y1 === y2) return `${d1} ${mon(m1)} – ${d2} ${mon(m2)}${year(y1)}`;
  return `${d1} ${mon(m1)} ${y1} – ${d2} ${mon(m2)} ${y2}`;
}

/** Libur yang berlaku untuk murid pada tanggal itu (sama dengan holiday_on di database). */
export function holidayOn(events: CalendarEvent[], date: string): CalendarEvent[] {
  return events.filter((e) => e.kind === "libur" && e.audience !== "staff" && e.starts_on <= date && date <= e.ends_on);
}
