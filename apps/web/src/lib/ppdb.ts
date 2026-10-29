import type { Tone } from "@/lib/format";
import type { SchoolBrand } from "@/lib/session";

export const PPDB_BUCKET = "admission-docs";

export type AdmissionStatus = "draft" | "submitted" | "verified" | "accepted" | "waitlisted" | "rejected" | "enrolled" | "withdrawn";

/** Label untuk pendaftar; "accepted" di tempat lain berarti bergabung kelompok, jadi PPDB punya kamus sendiri. */
export const PPDB_STATUS: Record<AdmissionStatus, string> = {
  draft: "Draf",
  submitted: "Terkirim",
  verified: "Terverifikasi",
  accepted: "Diterima",
  waitlisted: "Cadangan",
  rejected: "Belum diterima",
  enrolled: "Sudah jadi murid",
  withdrawn: "Dibatalkan",
};

export const PPDB_TONE: Record<AdmissionStatus, Tone> = {
  draft: "neutral", submitted: "warn", verified: "info", accepted: "good",
  waitlisted: "warn", rejected: "bad", enrolled: "good", withdrawn: "neutral",
};

export const FEE_LABEL: Record<string, string> = { unpaid: "Belum bayar", paid: "Lunas", waived: "Dibebaskan" };
export const FEE_METHOD: Record<string, string> = { cash: "Tunai", transfer: "Transfer", waived: "Dibebaskan" };

export const RELIGIONS = ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu", "Lainnya"];
export const RELATIONS = [["ibu", "Ibu"], ["ayah", "Ayah"], ["wali", "Wali"]] as const;
export const relationLabel = (r: string | null) => RELATIONS.find(([k]) => k === r)?.[1] ?? r ?? "";

export function gradeLabel(level: number) {
  return level === 0 ? "TK" : `Kelas ${level}`;
}

export interface PublicPeriod {
  id: string; title: string; school_year: string; grade_level: number;
  opens_on: string; closes_on: string; quota: number | null; fee_amount: number;
  requirements: string | null; documents: string[]; is_open: boolean; announced: boolean;
}

export interface PpdbPublic {
  school: SchoolBrand & { id: string; level: string | null; address: string | null; phone: string | null; email: string | null; website: string | null };
  periods: PublicPeriod[];
}

/** Kolom formulir yang diisi orang tua. */
export const APPLICATION_FIELDS = [
  "full_name", "nisn", "gender", "birth_place", "birth_date", "religion", "address", "previous_school",
  "parent_name", "parent_relation", "parent_phone", "parent_occupation", "notes",
] as const;

/** Nama berkas aman untuk Storage dari label dokumen, mis. "Kartu keluarga" → "kartu-keluarga". */
export function docSlug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "berkas";
}

export const DOC_TYPES: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
};
