import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, PageHeader, Stat } from "@/components/ui";

export default async function AdminHome() {
  const { supabase, schoolId, active } = await requireRole("school_admin");
  const [{ count: students }, { count: classes }, { count: subjects }, { data: members }, { data: year }, { data: school }] = await Promise.all([
    supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "aktif"),
    supabase.from("classes").select("id, academic_years!inner(is_active)", { count: "exact", head: true }).eq("school_id", schoolId).eq("academic_years.is_active", true),
    supabase.from("subjects").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("memberships").select("role").eq("school_id", schoolId).eq("is_active", true),
    supabase.from("academic_years").select("name").eq("school_id", schoolId).eq("is_active", true).maybeSingle(),
    supabase.from("schools").select("plan, plans(name, price_per_student, max_students)").eq("id", schoolId).single(),
  ]);
  const count = (r: string) => (members ?? []).filter((m) => m.role === r).length;
  const plan = (school as any)?.plans;

  const steps = [
    { done: !!year, label: "Buat tahun ajaran aktif", href: "/admin/kelas" },
    { done: (classes ?? 0) > 0, label: "Buat kelas dan tetapkan wali kelas", href: "/admin/kelas" },
    { done: (subjects ?? 0) > 0, label: "Tambahkan mapel dan guru pengampu", href: "/admin/mapel" },
    { done: (students ?? 0) > 0, label: "Masukkan data murid ke kelas", href: "/admin/murid" },
    { done: count("guardian") > 0, label: "Buat akun orang tua dan tautkan ke anak", href: "/admin/pengguna" },
  ];

  return (
    <>
      <PageHeader title="Admin Sekolah" subtitle={`${active.school_name} · Tahun ajaran ${year?.name ?? "belum diatur"}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Murid aktif" value={students ?? 0} hint={plan?.max_students ? `Batas paket ${plan.max_students}` : undefined} />
        <Stat label="Guru" value={count("teacher")} />
        <Stat label="Orang tua" value={count("guardian")} />
        <Stat label="Paket" value={plan?.name ?? "–"} hint={plan?.price_per_student ? `Rp${Number(plan.price_per_student).toLocaleString("id-ID")}/siswa/bulan` : "Tanpa biaya"} />
      </div>
      <Card title="Langkah penyiapan">
        <ol className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2.5 text-sm">
              <span className="flex items-center gap-3">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-good text-white" : "border border-line text-muted"}`}>{s.done ? "✓" : i + 1}</span>
                <span className={s.done ? "text-muted line-through" : "font-semibold"}>{s.label}</span>
              </span>
              <Link href={s.href} className="font-semibold text-brand">Buka</Link>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
