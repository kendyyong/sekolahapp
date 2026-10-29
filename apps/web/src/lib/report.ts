import type { LetterheadSchool } from "@/components/letterhead";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayJakarta } from "@/lib/format";
import type { ProjectReport } from "@/lib/kokurikuler";

export interface Term {
  id: string; name: string; semester: number; starts_on: string; ends_on: string;
  report_date: string | null; report_place: string | null; published_at: string | null;
}

export const KIND_LABEL: Record<string, string> = { formatif: "Formatif", sumatif: "Sumatif lingkup materi", sas: "Sumatif akhir semester" };
export const PROMOTION_LABEL: Record<string, string> = { naik: "Naik kelas", tinggal: "Tinggal kelas", lulus: "Lulus", tidak_lulus: "Tidak lulus" };
/** Tingkat akhir jenjang: keputusan semester genap berupa kelulusan, bukan kenaikan. */
export const FINAL_GRADES = new Set([6, 9, 12]);

/** Semester tahun ajaran aktif, dan semester yang sedang berjalan (atau yang dipilih). */
export async function activeTerms(sb: SupabaseClient, schoolId: string, selected?: string) {
  const { data } = await sb.from("terms")
    .select("id, name, semester, starts_on, ends_on, report_date, report_place, published_at, academic_years!inner(is_active, name)")
    .eq("school_id", schoolId).eq("academic_years.is_active", true).order("semester");
  const terms = (data ?? []) as unknown as (Term & { academic_years: { name: string } })[];
  const today = todayJakarta();
  const term = terms.find((t) => t.id === selected)
    ?? terms.find((t) => t.starts_on <= today && today <= t.ends_on)
    ?? terms.findLast((t) => t.starts_on <= today)
    ?? terms[0];
  return { terms, term, year: terms[0]?.academic_years.name };
}

export function termLabel(t: Pick<Term, "name" | "semester">) {
  return `Semester ${t.semester} (${t.name})`;
}

/** Isi rapor dari RPC report_card_view. */
export interface ReportView {
  school: LetterheadSchool & { motto: string | null };
  term: { id: string; name: string; semester: number; year: string; report_date: string | null; report_place: string | null; published_at: string | null };
  student: { id: string; full_name: string; nis: string | null; nisn: string | null };
  class: { id: string; name: string; grade_level: number };
  homeroom: string | null;
  homeroom_nip: string | null;
  principal: string | null;
  principal_nip: string | null;
  card: {
    status: "draft" | "final"; homeroom_note: string | null; promotion: string | null;
    extracurriculars: { name: string; grade?: string; note?: string }[];
    sick: number; permit: number; absent: number;
  };
  kktp: number;
  grades: { subject: string; score: number | null; description: string | null }[];
  /** Projek kokurikuler/P5 semester ini (RPC kokurikuler_report). */
  projects: ProjectReport[];
}

/** Rapor satu murid beserta bagian projeknya. Hak lihat diperiksa di database. */
export async function loadReport(sb: SupabaseClient, term: string, student: string) {
  const [view, projects] = await Promise.all([
    sb.rpc("report_card_view", { p_term: term, p_student: student }),
    sb.rpc("kokurikuler_report", { p_term: term, p_student: student }),
  ]);
  if (view.error || !view.data) return { data: null, error: view.error };
  return { data: { ...(view.data as Omit<ReportView, "projects">), projects: (projects.data ?? []) as ProjectReport[] } as ReportView, error: null };
}
