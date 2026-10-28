import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TeachingRow {
  id: string;
  class_id: string;
  meeting_url: string | null;
  classes: { id: string; name: string; grade_level: number; homeroom_teacher_id: string | null };
  subjects: { id: string; name: string; code: string };
}

/** Mapel × kelas yang diajar guru. */
export async function myTeaching(sb: SupabaseClient, teacherId: string): Promise<TeachingRow[]> {
  const { data, error } = await sb.from("teaching_assignments")
    .select("id, class_id, meeting_url, classes!inner(id, name, grade_level, homeroom_teacher_id), subjects!inner(id, name, code)")
    .eq("teacher_id", teacherId);
  if (error) throw error;
  return ((data ?? []) as unknown as TeachingRow[])
    .sort((a, b) => a.classes.name.localeCompare(b.classes.name) || a.subjects.name.localeCompare(b.subjects.name));
}

/** Kelas yang diajar atau diwalikan guru (tahun ajaran aktif). */
export async function myClasses(sb: SupabaseClient, teacherId: string, schoolId: string) {
  const [{ data: taught }, { data: homeroom }] = await Promise.all([
    sb.from("teaching_assignments").select("classes!inner(id, name, academic_years!inner(is_active))")
      .eq("teacher_id", teacherId).eq("classes.academic_years.is_active", true),
    sb.from("classes").select("id, name, academic_years!inner(is_active)")
      .eq("homeroom_teacher_id", teacherId).eq("school_id", schoolId).eq("academic_years.is_active", true),
  ]);
  const map = new Map<string, { id: string; name: string; homeroom: boolean }>();
  for (const c of homeroom ?? []) map.set(c.id, { id: c.id, name: c.name, homeroom: true });
  for (const t of (taught ?? []) as any[]) if (!map.has(t.classes.id)) map.set(t.classes.id, { id: t.classes.id, name: t.classes.name, homeroom: false });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function classRoster(sb: SupabaseClient, classId: string) {
  const { data, error } = await sb.from("enrollments")
    .select("roll_number, students!inner(id, full_name, nis, status)")
    .eq("class_id", classId).order("roll_number", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((e) => ({ roll: e.roll_number as number | null, ...e.students }) as {
    roll: number | null; id: string; full_name: string; nis: string | null; status: string;
  });
}

/** Data murid milik akun murid saat ini beserta kelas aktifnya. */
export async function myStudent(sb: SupabaseClient, userId: string, schoolId: string) {
  const { data } = await sb.from("students")
    .select("id, full_name, nis, enrollments(class_id, classes!inner(id, name, homeroom_teacher_id, academic_years!inner(is_active)))")
    .eq("user_id", userId).eq("school_id", schoolId).maybeSingle();
  if (!data) return null;
  const enr = ((data as any).enrollments ?? []).find((e: any) => e.classes?.academic_years?.is_active);
  return { id: data.id as string, full_name: data.full_name as string, nis: data.nis as string | null,
    class: enr ? { id: enr.classes.id as string, name: enr.classes.name as string } : null };
}

/** Anak-anak milik akun orang tua di sekolah ini. */
export async function myChildren(sb: SupabaseClient, userId: string, schoolId: string) {
  const { data } = await sb.from("guardian_links")
    .select("relation, students!inner(id, full_name, nis, school_id, enrollments(classes!inner(id, name, homeroom_teacher_id, academic_years!inner(is_active))))")
    .eq("guardian_id", userId).eq("school_id", schoolId);
  return ((data ?? []) as any[]).map((g) => {
    const enr = (g.students.enrollments ?? []).find((e: any) => e.classes?.academic_years?.is_active);
    return {
      id: g.students.id as string, full_name: g.students.full_name as string, nis: g.students.nis as string | null,
      relation: g.relation as string,
      class: enr ? { id: enr.classes.id as string, name: enr.classes.name as string, homeroom_teacher_id: enr.classes.homeroom_teacher_id as string | null } : null,
    };
  }).sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export async function signedUrl(sb: SupabaseClient, bucket: string, path: string | null) {
  if (!path) return null;
  const { data } = await sb.storage.from(bucket).createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
}
