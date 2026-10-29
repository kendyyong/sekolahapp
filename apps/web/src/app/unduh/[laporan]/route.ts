import { type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, type Role, requireModule, requireRole } from "@/lib/session";
import { tanggal, todayJakarta } from "@/lib/format";
import { classRoster } from "@/lib/queries";
import { fetchAll, monthDays, monthLabel, xlsxResponse } from "@/lib/xlsx";

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ laporan: string }> }) {
  const { laporan } = await params;
  switch (laporan) {
    case "absensi-kelas": return classAttendance(req);
    case "kehadiran-pegawai": return staffAttendance(req);
    case "tunggakan": return arrears();
    case "murid": {
      const { supabase, active } = await requireRole("school_admin", "principal");
      return students(supabase, active.school_id, active.school_name);
    }
    default: return new Response("Laporan tidak dikenal", { status: 404 });
  }
}
