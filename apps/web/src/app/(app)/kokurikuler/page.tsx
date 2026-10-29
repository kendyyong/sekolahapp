import Link from "next/link";
import { requireModule } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { activeTerms, termLabel } from "@/lib/report";
import { FRAMEWORK_SHORT, type Aspect, type Framework } from "@/lib/kokurikuler";
import { Badge, Button, Card, Empty, Field, Flash, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ProjectFields } from "./project-form";
import { projectFromForm } from "./project-input";

async function createProject(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("grades", "teacher", "school_admin", "principal");
  const term = str(fd, "term");
  let id = "";
  await run(`/kokurikuler?semester=${term}`, "Projek dibuat. Sekarang nilai murid per dimensi.", async (sb) => {
    const { data, error } = await sb.from("kokurikuler_projects")
      .insert({ school_id: schoolId, term_id: term, ...projectFromForm(fd) }).select("id").single();
    if (error) return { error };
    id = data.id;
  }, () => `/kokurikuler/${id}`);
}

interface Row {
  id: string; title: string; theme: string | null; framework: Framework; class_ids: string[]; aspect_ids: string[];
  coordinator_id: string | null; profiles: { full_name: string } | null;
}

export default async function Projects({ searchParams }: { searchParams: Promise<{ semester?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId, active } = await requireModule("grades", "teacher", "school_admin", "principal");
  const { terms, term } = await activeTerms(supabase, schoolId, sp.semester);
  if (!term) return (<><PageHeader title="Kokurikuler & P5" /><Empty>Admin sekolah belum membuat semester (menu E-Rapor).</Empty></>);

  const [{ data: projects }, { data: classes }, { data: aspects }] = await Promise.all([
    supabase.from("kokurikuler_projects").select("id, title, theme, framework, class_ids, aspect_ids, coordinator_id, profiles(full_name)")
      .eq("term_id", term.id).order("created_at"),
    supabase.from("classes").select("id, name, grade_level, homeroom_teacher_id, academic_years!inner(is_active)")
      .eq("school_id", schoolId).eq("academic_years.is_active", true).order("grade_level").order("name"),
    supabase.from("profile_aspects").select("*").order("position"),
  ]);
  const rows = (projects ?? []) as unknown as Row[];
  const cls = (classes ?? []) as unknown as { id: string; name: string; homeroom_teacher_id: string | null }[];
  const className = new Map(cls.map((c) => [c.id, c.name]));
  // Kemajuan penilaian dihitung dari murid yang terlihat oleh pengguna di lembar projek.
  const sheets = await Promise.all(rows.map((p) => supabase.rpc("kokurikuler_sheet", { p_project: p.id })));
  const progress = new Map(rows.map((p, i) => {
    const list = (sheets[i].data ?? []) as { levels: Record<string, string> | null }[];
    return [p.id, { total: list.length, done: list.filter((r) => Object.keys(r.levels ?? {}).length).length }];
  }));
  const manager = active.role !== "teacher";
  const homeroomOf = new Set(cls.filter((c) => c.homeroom_teacher_id === user.id).map((c) => c.id));
  const mine = (p: Row) => manager || p.coordinator_id === user.id || p.class_ids.some((c) => homeroomOf.has(c));

  return (
    <>
      <PageHeader title="Kokurikuler & P5"
        subtitle="Projek lintas mapel per semester. Koordinator dan wali kelas menilai tiap dimensi; deskripsinya otomatis masuk rapor." />
      <Flash searchParams={sp} />
      {terms.length > 1 && (
        <form className="mb-5 flex items-end gap-2">
          <Field label="Semester">
            <Select id="semester" name="semester" defaultValue={term.id}>
              {terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
            </Select>
          </Field>
          <Button variant="secondary">Tampilkan</Button>
        </form>
      )}
      {term.published_at && <p className="mb-4 text-sm text-muted">Rapor semester ini sudah diterbitkan, jadi nilai projek terkunci.</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <Table head={["Projek", "Kelas", "Dimensi", "Dinilai", "Koordinator"]} empty="Belum ada projek semester ini.">
            {rows.map((p) => {
              const { total, done } = progress.get(p.id)!;
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/kokurikuler/${p.id}`} className="font-semibold text-brand">{p.title}</Link>
                    <div className="text-xs text-muted">{FRAMEWORK_SHORT[p.framework]}{p.theme ? ` · ${p.theme}` : ""}</div>
                  </td>
                  <td className="text-sm">{p.class_ids.map((c) => className.get(c) ?? "?").join(", ")}</td>
                  <td className="tabular-nums">{p.aspect_ids.length}</td>
                  <td>
                    <Badge tone={total && done >= total ? "good" : done ? "warn" : "neutral"}>{done}/{total}</Badge>
                  </td>
                  <td className="text-sm">
                    {p.profiles?.full_name ?? "–"}
                    {!manager && mine(p) && <div className="text-xs text-muted">{p.coordinator_id === user.id ? "Anda koordinator" : "Anda wali kelas"}</div>}
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
        <Card title="Buat projek baru" className="h-fit">
          {!cls.length ? <p className="text-sm text-muted">Belum ada kelas di tahun ajaran aktif.</p> : term.published_at ? (
            <p className="text-sm text-muted">Rapor semester ini sudah diterbitkan.</p>
          ) : (
            <form action={createProject} className="flex flex-col gap-4">
              <input type="hidden" name="term" value={term.id} />
              <ProjectFields aspects={(aspects ?? []) as Aspect[]} classes={cls} />
              <p className="text-xs text-muted">Anda menjadi koordinator projek. Wali kelas peserta juga bisa menilai murid kelasnya.</p>
              <SubmitButton pendingLabel="Menyimpan…">Buat projek</SubmitButton>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
