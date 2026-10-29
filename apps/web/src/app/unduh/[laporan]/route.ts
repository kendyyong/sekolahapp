import { type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, type Role, requireModule, requireRole } from "@/lib/session";
import { tanggal, todayJakarta, waktu } from "@/lib/format";
import { classRoster } from "@/lib/queries";
import { fetchAll, monthDays, monthLabel, xlsxResponse, xlsxWorkbook } from "@/lib/xlsx";
import { FEE_LABEL, PPDB_STATUS, RELATIONS, type AdmissionStatus } from "@/lib/ppdb";
import { PROMOTION_LABEL } from "@/lib/report";
import { ENTRY_LABEL, entryDetail, itemsText, type Entry } from "@/lib/canteen";
import { FRAMEWORK_SHORT, LEVEL_LABEL, projectNarrative, type Framework, type Level } from "@/lib/kokurikuler";

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

/** Hasil ujian online: nilai dan skor tiap soal per murid (urutan soal asli). */
async function examResults(req: NextRequest) {
  const { supabase, active } = await requireModule("cbt", "teacher", "school_admin", "principal");
  const id = req.nextUrl.searchParams.get("ujian") ?? "";
  const { data: exam } = await supabase.from("exams")
    .select("title, starts_at, teaching_assignments!inner(class_id, classes!inner(name), subjects!inner(name))")
    .eq("id", id).eq("school_id", active.school_id).maybeSingle();
  if (!exam) return new Response("Ujian tidak ditemukan", { status: 404 });
  await supabase.rpc("cbt_close_expired", { p_exam: id });
  const ta = exam.teaching_assignments as unknown as { class_id: string; classes: { name: string }; subjects: { name: string } };
  const [roster, { data: qs }, { data: att }] = await Promise.all([
    classRoster(supabase, ta.class_id),
    supabase.from("exam_questions").select("id, points").eq("exam_id", id).order("position").order("created_at"),
    supabase.from("exam_attempts").select("student_id, started_at, submitted_at, points, score, needs_review, leave_count").eq("exam_id", id),
  ]);
  const questions = qs ?? [];
  const byStudent = new Map((att ?? []).map((a) => [a.student_id, a]));
  return xlsxResponse({
    filename: `ujian-${exam.title}-${ta.classes.name}.xlsx`.replace(/[^\w.-]+/g, "-").toLowerCase(),
    sheet: "Hasil ujian",
    title: [active.school_name, `Hasil ujian ${exam.title} · ${ta.subjects.name} · Kelas ${ta.classes.name}`, `Diunduh ${tanggal(todayJakarta(), true)}`],
    head: ["No", "NIS", "Nama", "Status", "Mulai", "Selesai", "Keluar layar", "Nilai", ...questions.map((q, i) => `S${i + 1} (${Number(q.points)})`)],
    rows: roster.map((st, i) => {
      const a = byStudent.get(st.id);
      const pts = (a?.points ?? {}) as Record<string, number>;
      return [i + 1, st.nis ?? "", st.full_name,
        !a ? "Tidak ikut" : !a.submitted_at ? "Mengerjakan" : a.needs_review ? "Uraian belum dinilai" : "Selesai",
        a ? waktu(a.started_at) : "", a?.submitted_at ? waktu(a.submitted_at) : "", a?.leave_count ?? "",
        a?.submitted_at && !a.needs_review ? Number(a.score) : "",
        ...questions.map((q) => (pts[q.id] != null ? Number(pts[q.id]) : ""))];
    }),
    widths: [5, 10, 28, 18, 14, 14, 8, 8, ...questions.map(() => 7)],
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

/**
 * Data rapor satu kelas untuk dipindahkan ke aplikasi e-Rapor Kemendikdasmen: nilai akhir,
 * deskripsi capaian, kokurikuler/P5, serta kehadiran dan catatan wali kelas, masing-masing satu lembar.
 */
async function eRapor(req: NextRequest) {
  const { supabase, active } = await requireModule("grades", "teacher", "school_admin", "principal");
  const classId = req.nextUrl.searchParams.get("kelas") ?? "";
  const termId = req.nextUrl.searchParams.get("semester") ?? "";
  const [{ data: klass }, { data: term }, { data: tas }, { data: enr }, { data: cards }, { data: projects }, { data: aspects }] = await Promise.all([
    supabase.from("classes").select("name").eq("id", classId).eq("school_id", active.school_id).maybeSingle(),
    supabase.from("terms").select("name, semester, academic_years(name)").eq("id", termId).maybeSingle(),
    supabase.from("teaching_assignments").select("id, subjects(name, report_order)").eq("class_id", classId),
    supabase.from("enrollments").select("roll_number, students!inner(id, full_name, nis, nisn, status)").eq("class_id", classId)
      .eq("students.status", "aktif").order("roll_number", { nullsFirst: false }),
    supabase.from("report_cards").select("student_id, sick, permit, absent, homeroom_note, extracurriculars, promotion, status")
      .eq("term_id", termId).eq("class_id", classId),
    supabase.from("kokurikuler_projects").select("id, title, theme, framework, aspect_ids").eq("term_id", termId)
      .contains("class_ids", [classId]).order("created_at"),
    supabase.from("profile_aspects").select("id, dimension, element, position").order("position"),
  ]);
  if (!klass || !term) return new Response("Kelas atau semester tidak ditemukan", { status: 404 });
  const students = ((enr ?? []) as any[]).map((e, i) => ({ no: e.roll_number ?? i + 1, ...e.students }) as {
    no: number; id: string; full_name: string; nis: string | null; nisn: string | null;
  });
  const ids = (s: { nis: string | null; nisn: string | null; full_name: string }) => [s.nis ?? "", s.nisn ?? "", s.full_name];
  const subjects = ((tas ?? []) as any[]).sort((a, b) =>
    (a.subjects?.report_order ?? 100) - (b.subjects?.report_order ?? 100) || a.subjects?.name.localeCompare(b.subjects?.name));
  const [grades, results] = await Promise.all([
    subjects.length ? fetchAll<{ student_id: string; teaching_assignment_id: string; score: number | null; description: string | null }>((from, to) =>
      supabase.from("report_grades").select("student_id, teaching_assignment_id, score, description").eq("term_id", termId)
        .in("teaching_assignment_id", subjects.map((t) => t.id)).order("id").range(from, to)) : [],
    projects?.length ? fetchAll<{ project_id: string; student_id: string; levels: Record<string, Level>; note: string | null }>((from, to) =>
      supabase.from("kokurikuler_results").select("project_id, student_id, levels, note").in("project_id", projects.map((p) => p.id))
        .order("student_id").range(from, to)) : [],
  ]);
  const grade = new Map(grades.map((g) => [`${g.student_id}|${g.teaching_assignment_id}`, g]));
  const card = new Map((cards ?? []).map((c) => [c.student_id, c]));
  const result = new Map(results.map((r) => [`${r.project_id}|${r.student_id}`, r]));
  const aspectById = new Map((aspects ?? []).map((a) => [a.id as string, a as { id: string; dimension: string; element: string | null; position: number }]));
  const score = (v: number | null | undefined) => (v == null ? "" : Math.round(Number(v)));
  const year = (term.academic_years as unknown as { name: string } | null)?.name ?? "";
  const heading = (what: string) => [active.school_name, `${what} · Kelas ${klass.name} · Semester ${term.semester} (${term.name}) ${year}`];
  const person = ["No", "NIS", "NISN", "Nama"];
  const personW = [5, 12, 13, 28];

  const projectRows = students.flatMap((s) => (projects ?? []).map((p) => {
    const r = result.get(`${p.id}|${s.id}`);
    const used = (p.aspect_ids as string[]).map((a) => aspectById.get(a)).filter((a) => !!a)
      .sort((a, b) => a!.position - b!.position).map((a) => ({ ...a!, level: r?.levels?.[a!.id] ?? null }));
    return { s, p, r, used };
  }));

  return xlsxWorkbook(`erapor-${klass.name}-semester-${term.semester}.xlsx`, [
    {
      sheet: "Nilai Akhir",
      title: [...heading("Nilai akhir"), "Salin kolom nilai ke templat impor nilai di aplikasi e-Rapor sesuai urutan mapelnya."],
      head: [...person, ...subjects.map((t) => t.subjects?.name ?? "")],
      rows: students.map((s) => [s.no, ...ids(s), ...subjects.map((t) => score(grade.get(`${s.id}|${t.id}`)?.score))]),
      widths: [...personW, ...subjects.map(() => 11)],
    },
    {
      sheet: "Deskripsi Capaian",
      title: heading("Nilai & deskripsi capaian kompetensi"),
      head: [...person, "Mata pelajaran", "Nilai akhir", "Capaian kompetensi"],
      rows: students.flatMap((s) => subjects.map((t) => {
        const g = grade.get(`${s.id}|${t.id}`);
        return [s.no, ...ids(s), t.subjects?.name ?? "", score(g?.score), { value: g?.description ?? "", wrap: true }];
      })),
      widths: [...personW, 22, 10, 80],
    },
    {
      sheet: "Kokurikuler",
      title: [...heading("Kokurikuler / P5"), "Deskripsi disusun dari predikat tiap dimensi; catatan proses dari koordinator atau wali kelas."],
      head: [...person, "Projek", "Kerangka", "Tema", "Deskripsi", "Catatan proses"],
      rows: projectRows.map(({ s, p, r, used }) => [s.no, ...ids(s), p.title, FRAMEWORK_SHORT[p.framework as Framework], p.theme ?? "",
        { value: projectNarrative(s.full_name.split(" ")[0], { aspects: used }), wrap: true }, { value: r?.note ?? "", wrap: true }]),
      widths: [...personW, 26, 12, 22, 60, 40],
    },
    {
      sheet: "Predikat Dimensi",
      title: [...heading("Predikat kokurikuler / P5 per dimensi"), "SB sangat berkembang · BSH berkembang sesuai harapan · MB mulai berkembang · BB belum berkembang"],
      head: [...person, "Projek", "Dimensi", "Elemen", "Predikat", "Keterangan"],
      rows: projectRows.flatMap(({ s, p, used }) => used.map((a) => [s.no, ...ids(s), p.title, a.dimension, a.element ?? "",
        a.level ?? "", a.level ? LEVEL_LABEL[a.level] : ""])),
      widths: [...personW, 26, 36, 40, 9, 24],
    },
    {
      sheet: "Kehadiran & Catatan",
      title: heading("Ketidakhadiran, ekstrakurikuler, dan catatan wali kelas"),
      head: [...person, "Sakit", "Izin", "Tanpa keterangan", "Ekstrakurikuler", "Catatan wali kelas", "Keputusan", "Status rapor"],
      rows: students.map((s) => {
        const c = card.get(s.id);
        const ekskul = ((c?.extracurriculars ?? []) as { name: string; grade?: string; note?: string }[])
          .map((e) => [e.name, e.grade && `(${e.grade})`, e.note && `: ${e.note}`].filter(Boolean).join(" ")).join("; ");
        return [s.no, ...ids(s), c?.sick ?? "", c?.permit ?? "", c?.absent ?? "", { value: ekskul, wrap: true },
          { value: c?.homeroom_note ?? "", wrap: true }, c?.promotion ? PROMOTION_LABEL[c.promotion] : "",
          c ? (c.status === "final" ? "Final" : "Draf") : "Belum dibuat"];
      }),
      widths: [...personW, 7, 7, 10, 36, 60, 14, 12],
    },
  ]);
}

/** Transaksi kantin: per kios (kasir/TU) atau seluruh sekolah (TU, admin, kepsek). */
async function canteen(req: NextRequest) {
  const { supabase, active } = await requireModule("canteen", "canteen", "finance", "school_admin", "principal");
  const sp = req.nextUrl.searchParams;
  const today = todayJakarta();
  const isDate = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const from = isDate(sp.get("dari")) ? sp.get("dari")! : today.slice(0, 8) + "01";
  const to = isDate(sp.get("sampai")) ? sp.get("sampai")! : today;
  const stallId = sp.get("kios");
  const title = (what: string) => [active.school_name, `${what} · ${tanggal(from)} – ${tanggal(to)}`];

  if (stallId) {
    const [{ data: stall }, { data, error }] = await Promise.all([
      supabase.from("canteen_stalls").select("name").eq("id", stallId).maybeSingle(),
      supabase.rpc("canteen_stall_entries", { p_stall: stallId, p_from: from, p_to: to }),
    ]);
    if (!stall || error) return new Response("Kios tidak ditemukan", { status: 404 });
    const rows = ((data ?? []) as { kind: Entry; amount: number; items: { name: string; price: number; qty: number }[] | null; created_at: string;
      student_name: string; class_name: string | null; refunded: boolean; settlement_id: string | null }[]).reverse();
    return xlsxResponse({
      filename: `kantin-${stall.name}-${from}-${to}.xlsx`, sheet: stall.name,
      title: title(`Penjualan ${stall.name}`),
      head: ["Waktu", "Murid", "Kelas", "Transaksi", "Belanja", "Nominal", "Status"],
      rows: rows.map((r) => [waktu(r.created_at), r.student_name, r.class_name ?? "", ENTRY_LABEL[r.kind], itemsText(r.items), -Number(r.amount),
        r.refunded ? "Dibatalkan" : r.settlement_id ? "Sudah disetor" : "Belum disetor"]),
      widths: [18, 26, 10, 12, 40, 12, 14],
    });
  }
  if (active.role === "canteen") return new Response("Pilih kios", { status: 400 });
  const rows = await fetchAll<any>((a, b) => supabase.from("canteen_ledger")
    .select("kind, amount, balance_after, created_at, note, method, items, canteen_stalls(name), students(full_name, nis)")
    .eq("school_id", active.school_id).gte("created_at", new Date(from + "T00:00:00+07:00").toISOString())
    .lt("created_at", new Date(new Date(to + "T00:00:00+07:00").getTime() + 864e5).toISOString())
    .order("created_at").range(a, b));
  return xlsxResponse({
    filename: `kantin-${from}-${to}.xlsx`, sheet: "Transaksi kantin",
    title: title("Transaksi kantin digital"),
    head: ["Waktu", "NIS", "Murid", "Transaksi", "Keterangan", "Masuk", "Keluar", "Saldo"],
    rows: rows.map((r) => [waktu(r.created_at), r.students?.nis ?? "", r.students?.full_name ?? "", ENTRY_LABEL[r.kind as Entry], entryDetail(r),
      Number(r.amount) > 0 ? Number(r.amount) : "", Number(r.amount) < 0 ? -Number(r.amount) : "", Number(r.balance_after)]),
    widths: [18, 12, 26, 12, 40, 12, 12, 12],
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ laporan: string }> }) {
  const { laporan } = await params;
  switch (laporan) {
    case "absensi-kelas": return classAttendance(req);
    case "kehadiran-pegawai": return staffAttendance(req);
    case "tunggakan": return arrears();
    case "leger": return ledger(req);
    case "erapor": return eRapor(req);
    case "kantin": return canteen(req);
    case "ppdb": return admissions(req);
    case "ujian": return examResults(req);
    case "murid": {
      const { supabase, active } = await requireRole("school_admin", "principal");
      return students(supabase, active.school_id, active.school_name);
    }
    default: return new Response("Laporan tidak dikenal", { status: 404 });
  }
}
