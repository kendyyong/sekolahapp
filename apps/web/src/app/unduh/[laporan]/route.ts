import { type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, type Role, requireModule, requireRole } from "@/lib/session";
import { tanggal, todayJakarta } from "@/lib/format";
import { classRoster } from "@/lib/queries";
import { fetchAll, monthDays, monthLabel, xlsxResponse } from "@/lib/xlsx";
import { FEE_LABEL, PPDB_STATUS, RELATIONS, type AdmissionStatus } from "@/lib/ppdb";

// Unduhan Excel untuk laporan yang sering diminta dinas, yayasan, dan rapat sekolah.
// Data diambil dengan sesi pengguna, jadi RLS tetap membatasi baris yang terlihat.

const STUDENT_CODE: Record<string, string> = { hadir: "H", terlambat: "T", izin: "I", sakit: "S", alpa: "A" };
const STAFF_CODE: Record<string, string> = { ...STUDENT_CODE, cuti: "C", dinas: "D" };

const month = (req: NextRequest) => {
  const m = req.nextUrl.searchParams.get("bulan") ?? "";
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : todayJakarta().slice(0, 7);
};
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

/** Rekap absensi harian satu kelas dalam sebulan: kode per tanggal dan jumlah per status. */
async function classAttendance(req: NextRequest) {
  const { supabase, active } = await requireRole("teacher", "school_admin", "principal");
  const classId = req.nextUrl.searchParams.get("kelas") ?? "";
  const m = month(req);
  const days = monthDays(m);
  const [{ data: klass }, roster, att] = await Promise.all([
    supabase.from("classes").select("name").eq("id", classId).eq("school_id", active.school_id).maybeSingle(),
    classRoster(supabase, classId),
    fetchAll<{ student_id: string; date: string; status: string }>((from, to) =>
      supabase.from("student_attendance").select("student_id, date, status").eq("class_id", classId)
        .is("teaching_assignment_id", null).gte("date", days[0]).lte("date", days.at(-1)!).order("id").range(from, to)),
  ]);
  if (!klass) return new Response("Kelas tidak ditemukan", { status: 404 });

  const byKey = new Map(att.map((a) => [`${a.student_id}|${a.date}`, a.status]));
  const statuses = Object.keys(STUDENT_CODE);
  const rows = roster.map((s, i) => {
    const codes = days.map((d) => byKey.get(`${s.id}|${d}`));
    const count = (st: string) => codes.filter((c) => c === st).length;
    const recorded = codes.filter(Boolean).length;
    return [
      s.roll ?? i + 1, s.nis ?? "", s.full_name,
      ...codes.map((c) => (c ? STUDENT_CODE[c] : "")),
      ...statuses.map(count),
      pct(count("hadir") + count("terlambat"), recorded),
    ];
  });
  return xlsxResponse({
    filename: `rekap-absensi-${klass.name}-${m}.xlsx`,
    sheet: `Absensi ${klass.name}`,
    title: [active.school_name, `Rekap absensi kelas ${klass.name} · ${monthLabel(m)}`,
      "H hadir · T terlambat · I izin · S sakit · A alpa · kosong = tidak ada catatan (libur atau belum diisi)"],
    head: ["No", "NIS", "Nama", ...days.map((d) => String(Number(d.slice(8)))), "H", "T", "I", "S", "A", "% hadir"],
    rows,
    widths: [5, 12, 28, ...days.map(() => 3.5), 5, 5, 5, 5, 5, 8],
  });
}

/** Rekap kehadiran guru & pegawai sebulan. */
async function staffAttendance(req: NextRequest) {
  const { supabase, active } = await requireModule("staff", "principal", "school_admin");
  const m = month(req);
  const days = monthDays(m);
  const [{ data: staff }, att] = await Promise.all([
    supabase.from("memberships").select("user_id, role, profiles(full_name)").eq("school_id", active.school_id).eq("is_active", true)
      .in("role", ["teacher", "counselor", "finance", "school_admin", "principal"]),
    fetchAll<{ user_id: string; date: string; status: string }>((from, to) =>
      supabase.from("staff_attendance").select("user_id, date, status").eq("school_id", active.school_id)
        .gte("date", days[0]).lte("date", days.at(-1)!).order("id").range(from, to)),
  ]);
  const people = new Map<string, { name: string; roles: string[] }>();
  for (const s of (staff ?? []) as any[]) {
    const p = people.get(s.user_id) ?? { name: s.profiles?.full_name ?? "", roles: [] as string[] };
    p.roles.push(ROLE_LABEL[s.role as Role]);
    people.set(s.user_id, p);
  }
  const byKey = new Map(att.map((a) => [`${a.user_id}|${a.date}`, a.status]));
  const statuses = Object.keys(STAFF_CODE);
  const rows = [...people.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, p], i) => {
    const codes = days.map((d) => byKey.get(`${id}|${d}`));
    return [i + 1, p.name, p.roles.join(", "), ...codes.map((c) => (c ? STAFF_CODE[c] : "")),
      ...statuses.map((st) => codes.filter((c) => c === st).length)];
  });
  return xlsxResponse({
    filename: `rekap-kehadiran-pegawai-${m}.xlsx`,
    sheet: "Kehadiran pegawai",
    title: [active.school_name, `Rekap kehadiran guru & pegawai · ${monthLabel(m)}`,
      "H hadir · T terlambat · I izin · S sakit · C cuti · D dinas · A alpa"],
    head: ["No", "Nama", "Peran", ...days.map((d) => String(Number(d.slice(8)))), "H", "T", "I", "S", "A", "C", "D"],
    rows,
    widths: [5, 28, 20, ...days.map(() => 3.5), 5, 5, 5, 5, 5, 5, 5],
  });
}

async function arrears() {
  const { supabase, active } = await requireModule("finance", "finance", "principal");
  const data = await fetchAll<any>((from, to) =>
    supabase.from("v_student_arrears").select("student_id, full_name, nis, class_name, open_invoices, outstanding, oldest_due_on")
      .eq("school_id", active.school_id).order("outstanding", { ascending: false }).order("student_id").range(from, to));
  const rupiah = "#,##0";
  return xlsxResponse({
    filename: `tunggakan-${todayJakarta()}.xlsx`,
    sheet: "Tunggakan",
    title: [active.school_name, `Daftar tunggakan per ${tanggal(todayJakarta(), true)}`],
    head: ["No", "Nama", "NIS", "Kelas", "Jumlah tagihan", "Tunggakan (Rp)", "Jatuh tempo terlama"],
    rows: [
      ...data.map((r, i) => [i + 1, r.full_name, r.nis ?? "", r.class_name ?? "", r.open_invoices,
        { value: Number(r.outstanding), format: rupiah }, r.oldest_due_on ? new Date(r.oldest_due_on) : ""]),
      [null, { value: "Total", fontWeight: "bold" }, null, null, null,
        { value: data.reduce((s, r) => s + Number(r.outstanding), 0), format: rupiah, fontWeight: "bold" }, null],
    ],
    widths: [5, 28, 12, 10, 10, 16, 14],
  });
}

async function students(supabase: SupabaseClient, schoolId: string, schoolName: string) {
  const data = await fetchAll<any>((from, to) =>
    supabase.from("students")
      .select("full_name, nis, nisn, gender, birth_place, birth_date, address, status, enrollments(classes!inner(name, academic_years!inner(is_active))), guardian_links(relation, profiles(full_name, phone))")
      .eq("school_id", schoolId).order("full_name").order("id").range(from, to));
  return xlsxResponse({
    filename: `data-murid-${todayJakarta()}.xlsx`,
    sheet: "Murid",
    title: [schoolName, `Data murid per ${tanggal(todayJakarta(), true)}`],
    head: ["No", "Nama", "NIS", "NISN", "L/P", "Tempat lahir", "Tanggal lahir", "Kelas", "Status", "Alamat", "Orang tua/wali", "No. HP wali"],
    rows: data.map((s, i) => {
      const klass = (s.enrollments ?? []).find((e: any) => e.classes?.academic_years?.is_active)?.classes?.name ?? "";
      const g = (s.guardian_links ?? []) as any[];
      return [i + 1, s.full_name, s.nis ?? "", s.nisn ?? "", s.gender ?? "", s.birth_place ?? "",
        s.birth_date ? new Date(s.birth_date) : "", klass, s.status, s.address ?? "",
        g.map((x) => `${x.profiles?.full_name ?? ""} (${x.relation})`).join(", "),
        g.map((x) => x.profiles?.phone).filter(Boolean).join(", ")];
    }),
    widths: [5, 28, 12, 13, 5, 14, 13, 8, 8, 30, 30, 16],
  });
}

/** Daftar pendaftar PPDB satu gelombang, lengkap dengan status, biaya, dan keputusan seleksi. */
async function admissions(req: NextRequest) {
  const { supabase, active } = await requireModule("ppdb", "school_admin", "principal", "finance");
  const periodId = req.nextUrl.searchParams.get("periode") ?? "";
  const { data: period } = await supabase.from("admission_periods").select("title, school_year, fee_amount")
    .eq("id", periodId).eq("school_id", active.school_id).maybeSingle();
  if (!period) return new Response("Gelombang tidak ditemukan", { status: 404 });
  const data = await fetchAll<any>((from, to) =>
    supabase.from("admission_applications")
      .select("number, full_name, nisn, gender, birth_place, birth_date, religion, address, previous_school, parent_name, parent_relation, parent_phone, parent_occupation, status, fee_status, submitted_at, admission_reviews(decision, score)")
      .eq("period_id", periodId).neq("status", "draft").order("number").order("id").range(from, to));
  const decision: Record<string, string> = { accepted: "Diterima", waitlisted: "Cadangan", rejected: "Tidak diterima" };
  const relation: Record<string, string> = Object.fromEntries(RELATIONS);
  return xlsxResponse({
    filename: `ppdb-${period.title}-${period.school_year.replace("/", "-")}.xlsx`.replace(/\s+/g, "-").toLowerCase(),
    sheet: "Pendaftar",
    title: [active.school_name, `Pendaftar PPDB ${period.title} · Tahun ajaran ${period.school_year}`, `Diunduh ${tanggal(todayJakarta(), true)}`],
    head: ["No", "No. daftar", "Nama", "NISN", "L/P", "Tempat lahir", "Tanggal lahir", "Agama", "Sekolah asal", "Alamat",
      "Orang tua/wali", "Hubungan", "No. HP", "Pekerjaan", "Dikirim", "Biaya", "Status", "Keputusan", "Nilai"],
    rows: data.map((a, i) => [i + 1, a.number ?? "", a.full_name, a.nisn ?? "", a.gender ?? "", a.birth_place ?? "",
      a.birth_date ? new Date(a.birth_date) : "", a.religion ?? "", a.previous_school ?? "", a.address ?? "",
      a.parent_name ?? "", relation[a.parent_relation] ?? a.parent_relation ?? "", a.parent_phone ?? "", a.parent_occupation ?? "",
      a.submitted_at ? new Date(a.submitted_at) : "", period.fee_amount ? FEE_LABEL[a.fee_status] : "Gratis", PPDB_STATUS[a.status as AdmissionStatus],
      decision[a.admission_reviews?.decision ?? ""] ?? "", a.admission_reviews?.score ?? ""]),
    widths: [5, 16, 28, 13, 5, 14, 13, 10, 22, 30, 24, 10, 16, 16, 13, 12, 16, 14, 8],
  });
}

/** Leger nilai rapor satu kelas: murid × mapel, jumlah, dan rata-rata. */
async function ledger(req: NextRequest) {
  const { supabase, active } = await requireModule("grades", "teacher", "school_admin", "principal");
  const classId = req.nextUrl.searchParams.get("kelas") ?? "";
  const termId = req.nextUrl.searchParams.get("semester") ?? "";
  const [{ data: klass }, { data: term }, { data: tas }, roster] = await Promise.all([
    supabase.from("classes").select("name").eq("id", classId).eq("school_id", active.school_id).maybeSingle(),
    supabase.from("terms").select("name, semester, academic_years(name)").eq("id", termId).maybeSingle(),
    supabase.from("teaching_assignments").select("id, subjects(name, report_order)").eq("class_id", classId),
    classRoster(supabase, classId),
  ]);
  if (!klass || !term) return new Response("Kelas atau semester tidak ditemukan", { status: 404 });
  const subjects = ((tas ?? []) as any[]).sort((a, b) =>
    (a.subjects?.report_order ?? 100) - (b.subjects?.report_order ?? 100) || a.subjects?.name.localeCompare(b.subjects?.name));
  const grades = subjects.length ? await fetchAll<{ student_id: string; teaching_assignment_id: string; score: number | null }>((from, to) =>
    supabase.from("report_grades").select("student_id, teaching_assignment_id, score").eq("term_id", termId)
      .in("teaching_assignment_id", subjects.map((t) => t.id)).order("id").range(from, to)) : [];
  const byKey = new Map(grades.map((g) => [`${g.student_id}|${g.teaching_assignment_id}`, g.score == null ? null : Number(g.score)]));
  const rows = roster.filter((s) => s.status === "aktif").map((s, i) => {
    const scores = subjects.map((t) => byKey.get(`${s.id}|${t.id}`) ?? null);
    const got = scores.filter((v): v is number => v != null);
    const sum = got.reduce((a, b) => a + b, 0);
    return [s.roll ?? i + 1, s.nis ?? "", s.full_name, ...scores.map((v) => v ?? ""), got.length ? sum : "",
      got.length ? { value: Math.round((sum / got.length) * 100) / 100, format: "0.00" } : ""];
  });
  const year = (term.academic_years as unknown as { name: string } | null)?.name ?? "";
  return xlsxResponse({
    filename: `leger-${klass.name}-semester-${term.semester}.xlsx`,
    sheet: `Leger ${klass.name}`,
    title: [active.school_name, `Leger nilai rapor kelas ${klass.name} · Semester ${term.semester} (${term.name}) ${year}`],
    head: ["No", "NIS", "Nama", ...subjects.map((t) => t.subjects?.name ?? ""), "Jumlah", "Rata-rata"],
    rows,
    widths: [5, 12, 28, ...subjects.map(() => 11), 9, 10],
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ laporan: string }> }) {
  const { laporan } = await params;
  switch (laporan) {
    case "absensi-kelas": return classAttendance(req);
    case "kehadiran-pegawai": return staffAttendance(req);
    case "tunggakan": return arrears();
    case "leger": return ledger(req);
    case "ppdb": return admissions(req);
    case "murid": {
      const { supabase, active } = await requireRole("school_admin", "principal");
      return students(supabase, active.school_id, active.school_name);
    }
    default: return new Response("Laporan tidak dikenal", { status: 404 });
  }
}
