import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tone } from "@/lib/format";

/** Satu baris dari RPC cbt_my_exams. */
export interface MyExam {
  id: string; title: string; subject: string; class: string; teacher: string | null;
  starts_at: string; ends_at: string; duration_minutes: number; has_token: boolean; question_count: number;
  attempt_id: string | null; started_at: string | null; deadline_at: string | null; submitted_at: string | null;
  score: number | null; needs_review: boolean; review_open: boolean;
}

export async function myExams(sb: SupabaseClient) {
  const { data, error } = await sb.rpc("cbt_my_exams");
  if (error) throw error;
  return (data ?? []) as MyExam[];
}

/** Keadaan ujian dari sisi murid. */
export function studentExamState(e: MyExam, now = Date.now()): { label: string; tone: Tone; canStart: boolean } {
  if (e.submitted_at) return { label: e.needs_review ? "Menunggu nilai uraian" : "Selesai", tone: "neutral", canStart: false };
  if (e.attempt_id) return { label: "Sedang dikerjakan", tone: "warn", canStart: true };
  if (now < Date.parse(e.starts_at)) return { label: "Belum dibuka", tone: "info", canStart: false };
  if (now >= Date.parse(e.ends_at)) return { label: "Tidak dikerjakan", tone: "bad", canStart: false };
  return { label: "Bisa dikerjakan", tone: "good", canStart: true };
}
