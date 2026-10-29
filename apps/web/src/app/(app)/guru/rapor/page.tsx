import Link from "next/link";
import { requireModule } from "@/lib/session";
import { classRoster } from "@/lib/queries";
import { activeTerms, termLabel } from "@/lib/report";
import { Badge, Card, DownloadLink, Empty, Field, Flash, LinkButton, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

// Rapor kelas untuk wali kelas: kelengkapan nilai per mapel dan status rapor tiap murid.
export default async function HomeroomReports({ searchParams }: {
  searchParams: Promise<{ kelas?: string; semester?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireModule("grades", "teacher");
  const [{ data: classes }, { terms, term }] = await Promise.all([
    supabase.from("classes").select("id, name, grade_level, academic_years!inner(is_active)")
      .eq("school_id", schoolId).eq("homeroom_teacher_id", user.id).eq("academic_years.is_active", true).order("name"),
    activeTerms(supabase, schoolId, sp.semester),
  ]);
  const cls = (classes ?? []).find((c) => c.id === sp.kelas) ?? classes?.[0];
  if (!cls || !term) {
    return (
      <>
        <PageHeader title="Rapor Kelas" />
        <Empty>{!cls ? "Menu ini untuk wali kelas. Anda belum menjadi wali kelas di tahun ajaran aktif." : "Admin sekolah belum membuat semester (menu E-Rapor)."}</Empty>
      </>
    );
  }

  const [roster, { data: tas }, { data: cards }] = await Promise.all([
    classRoster(supabase, cls.id),
    supabase.from("teaching_assignments").select("id, subjects(name, report_order), profiles:teacher_id(full_name)").eq("class_id", cls.id),
    supabase.from("report_cards").select("student_id, status").eq("term_id", term.id).eq("class_id", cls.id),
  ]);
  const taIds = (tas ?? []).map((t) => t.id);
  const { data: rg } = taIds.length
    ? await supabase.from("report_grades").select("student_id, teaching_assignment_id, score").eq("term_id", term.id).in("teaching_assignment_id", taIds)
    : { data: [] };
  const students = roster.filter((s) => s.status === "aktif");
  const filled = (rg ?? []).filter((g) => g.score != null);
  const perStudent = new Map<string, number>();
  const perTa = new Map<string, number>();
  for (const g of filled) {
    perStudent.set(g.student_id, (perStudent.get(g.student_id) ?? 0) + 1);
    perTa.set(g.teaching_assignment_id, (perTa.get(g.teaching_assignment_id) ?? 0) + 1);
  }
  const status = new Map((cards ?? []).map((c) => [c.student_id, c.status]));
  const finals = (cards ?? []).filter((c) => c.status === "final").length;
  const subjects = ((tas ?? []) as any[]).sort((a, b) => (a.subjects?.report_order ?? 100) - (b.subjects?.report_order ?? 100) || a.subjects?.name.localeCompare(b.subjects?.name));
  const q = `semester=${term.id}`;

  return (
    <>
      <PageHeader title="Rapor Kelas" subtitle={`${cls.name} · ${termLabel(term)}`} actions={
        <div className="flex flex-wrap gap-2">
          <DownloadLink href={`/unduh/leger?kelas=${cls.id}&${q}`}>Leger nilai (Excel)</DownloadLink>
          <LinkButton href={`/rapor?kelas=${cls.id}&${q}`}>Lihat & cetak semua</LinkButton>
        </div>
      } />
      <Flash searchParams={sp} />
      <form className="mb-5 flex flex-wrap items-end gap-3">
        {(classes ?? []).length > 1 && (
          <Field label="Kelas">
            <Select id="kelas" name="kelas" defaultValue={cls.id}>{classes!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
        )}
        <Field label="Semester">
          <Select id="semester" name="semester" defaultValue={term.id}>{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</Select>
        </Field>
        <SubmitButton variant="secondary">Tampilkan</SubmitButton>
      </form>
      {term.published_at && <p className="mb-5 rounded-md bg-good-soft px-4 py-3 text-sm text-ink">Rapor semester ini sudah diterbitkan dan bisa dilihat orang tua.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title={`Murid · ${finals}/${students.length} rapor final`}>
          <Table head={["No", "Nama", "Nilai mapel", "Status", ""]} empty="Belum ada murid di kelas ini.">
            {students.map((s) => {
              const st = status.get(s.id);
              const n = perStudent.get(s.id) ?? 0;
              return (
                <tr key={s.id}>
                  <td className="tabular-nums text-muted">{s.roll ?? "–"}</td>
                  <td className="font-semibold">{s.full_name}</td>
                  <td className={`tabular-nums ${n < subjects.length ? "text-warn" : ""}`}>{n}/{subjects.length}</td>
                  <td>{st === "final" ? <Badge tone="good">Final</Badge> : st ? <Badge tone="warn">Draf</Badge> : <Badge>Belum diisi</Badge>}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/guru/rapor/murid?murid=${s.id}&kelas=${cls.id}&${q}`} className="text-sm font-semibold text-brand">Isi rapor</Link>
                    <Link href={`/rapor?murid=${s.id}&${q}`} className="ml-3 text-sm font-semibold text-brand">Lihat</Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <Card title="Kelengkapan nilai per mapel" className="h-fit">
          <ul className="flex flex-col gap-2 text-sm">
            {subjects.map((t) => {
              const n = perTa.get(t.id) ?? 0;
              return (
                <li key={t.id} className="flex items-start justify-between gap-3">
                  <span>{t.subjects?.name}<span className="block text-xs text-muted">{t.profiles?.full_name}</span></span>
                  <Badge tone={n >= students.length && n > 0 ? "good" : n ? "warn" : "neutral"}>{n}/{students.length}</Badge>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Nilai rapor tiap mapel diisi guru pengampunya di menu Nilai & Rapor.</p>
        </Card>
      </div>
    </>
  );
}
