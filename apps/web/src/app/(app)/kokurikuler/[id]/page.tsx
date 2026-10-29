import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { termLabel } from "@/lib/report";
import { FRAMEWORK_LABEL, LEVELS, LEVEL_LABEL, aspectName, projectNarrative, type Aspect, type Framework, type Level } from "@/lib/kokurikuler";
import { Badge, Card, Empty, Flash, PageHeader, Tabs, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ProjectFields } from "../project-form";
import { projectFromForm } from "../project-input";
import { FillColumn } from "./fill-column";

const ROLES = ["teacher", "school_admin", "principal"] as const;
const page = (id: string, kelas?: string) => `/kokurikuler/${id}${kelas ? `?kelas=${kelas}` : ""}`;

async function saveResults(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("grades", ...ROLES);
  const project = str(fd, "project");
  const aspects = fd.getAll("aspect").map(String);
  const students = fd.getAll("student").map(String);
  await run(page(project, optStr(fd, "kelas") ?? undefined), "Penilaian projek disimpan.", async (sb) => {
    const rows = students.map((student_id) => ({
      project_id: project, student_id, school_id: schoolId, note: optStr(fd, `n_${student_id}`),
      levels: Object.fromEntries(aspects.flatMap((a) => { const v = str(fd, `l_${student_id}_${a}`); return v ? [[a, v]] : []; })),
    }));
    const filled = rows.filter((r) => r.note || Object.keys(r.levels).length);
    const empty = rows.filter((r) => !filled.includes(r)).map((r) => r.student_id);
    if (filled.length) {
      const { error } = await sb.from("kokurikuler_results").upsert(filled, { onConflict: "project_id,student_id" });
      if (error) return { error };
    }
    if (empty.length) return sb.from("kokurikuler_results").delete().eq("project_id", project).in("student_id", empty);
  });
}

async function updateProject(fd: FormData) {
  "use server";
  await requireModule("grades", ...ROLES);
  const id = str(fd, "project");
  await run(page(id), "Projek disimpan.", (sb) => sb.from("kokurikuler_projects").update(projectFromForm(fd)).eq("id", id));
}

async function deleteProject(fd: FormData) {
  "use server";
  await requireModule("grades", ...ROLES);
  const id = str(fd, "project");
  await run(page(id), "Projek dihapus.", (sb) => sb.from("kokurikuler_projects").delete().eq("id", id), () => `/kokurikuler?semester=${str(fd, "term")}`);
}

interface Project {
  id: string; term_id: string; framework: Framework; title: string; theme: string | null; description: string | null;
  class_ids: string[]; aspect_ids: string[]; coordinator_id: string | null; profiles: { full_name: string } | null;
  terms: { name: string; semester: number; published_at: string | null };
}
interface SheetRow {
  student_id: string; full_name: string; nis: string | null; class_id: string; class_name: string;
  roll_number: number | null; levels: Record<string, Level> | null; note: string | null;
}

export default async function ProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ kelas?: string; ok?: string; err?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, user, schoolId, active } = await requireModule("grades", ...ROLES);
  const { data } = await supabase.from("kokurikuler_projects")
    .select("*, profiles(full_name), terms(name, semester, published_at)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as unknown as Project;
  const [{ data: aspects }, { data: classes }, { data: sheet }, { data: assessor }] = await Promise.all([
    supabase.from("profile_aspects").select("*").order("position"),
    supabase.from("classes").select("id, name, academic_years!inner(is_active)").eq("school_id", schoolId)
      .eq("academic_years.is_active", true).order("grade_level").order("name"),
    supabase.rpc("kokurikuler_sheet", { p_project: id }),
    supabase.rpc("can_assess_project", { p_project: id }),
  ]);
  const all = (aspects ?? []) as Aspect[];
  const used = all.filter((a) => p.aspect_ids.includes(a.id));
  const rows = (sheet ?? []) as SheetRow[];
  const canEdit = active.role !== "teacher" || p.coordinator_id === user.id;
  const locked = !!p.terms.published_at;

  // Kelas yang muridnya tampil di lembar ini, satu tab per kelas.
  const shownClasses = [...new Map(rows.map((r) => [r.class_id, r.class_name])).entries()];
  const kelas = shownClasses.find(([c]) => c === sp.kelas)?.[0] ?? shownClasses[0]?.[0];
  const students = rows.filter((r) => r.class_id === kelas);
  const sheetEditable = !!assessor && !locked;
  const cell = "border-b border-line px-2 py-2 align-top";

  return (
    <>
      <Link href={`/kokurikuler?semester=${p.term_id}`} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft aria-hidden className="size-4" /> Semua projek
      </Link>
      <PageHeader title={p.title}
        subtitle={`${FRAMEWORK_LABEL[p.framework]}${p.theme ? ` · Tema ${p.theme}` : ""} · ${termLabel(p.terms)} · Koordinator ${p.profiles?.full_name ?? "–"}`}
        actions={locked ? <Badge tone="neutral">Rapor terbit · terkunci</Badge> : undefined} />
      <Flash searchParams={sp} />
      {p.description && <p className="mb-5 max-w-3xl whitespace-pre-line text-sm text-ink">{p.description}</p>}

      <div className="flex flex-col gap-6">
        <Card title="Lembar penilaian">
          {!rows.length ? (
            <Empty>Belum ada murid aktif di kelas peserta yang bisa Anda lihat.</Empty>
          ) : (
            <>
              {shownClasses.length > 1 && (
                <Tabs active={kelas!} items={shownClasses.map(([c, name]) => ({ key: c, label: name, href: page(id, c) }))} />
              )}
              <p className="mb-3 text-xs text-muted">
                {LEVELS.map((l) => `${l} = ${LEVEL_LABEL[l]}`).join(" · ")}. Deskripsi rapor tersusun otomatis dari predikat; catatan proses ikut tampil di rapor.
                {!assessor && " Anda hanya bisa melihat; penilai adalah koordinator, wali kelas peserta, dan pengelola sekolah."}
              </p>
              <form action={saveResults}>
                <input type="hidden" name="project" value={id} />
                <input type="hidden" name="kelas" value={kelas} />
                {used.map((a) => <input key={a.id} type="hidden" name="aspect" value={a.id} />)}
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="bg-paper text-left text-[11px] uppercase tracking-wider text-muted">
                        <th className={`${cell} w-8`}>No</th>
                        <th className={`${cell} sticky left-0 z-10 min-w-36 bg-paper`}>Murid</th>
                        {used.map((a) => (
                          <th key={a.id} className={`${cell} w-28`} title={a.element ? `${a.dimension} — ${a.element}` : a.dimension}>
                            <span className="line-clamp-3">{aspectName(a)}</span>
                            {sheetEditable && <FillColumn aspect={a.id} />}
                          </th>
                        ))}
                        <th className={`${cell} min-w-64`}>Catatan proses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s, i) => (
                        <tr key={s.student_id}>
                          <td className={`${cell} tabular-nums`}>{s.roll_number ?? i + 1}<input type="hidden" name="student" value={s.student_id} /></td>
                          <td className={`${cell} sticky left-0 z-10 bg-sheet`}><div className="font-medium text-ink">{s.full_name}</div><div className="text-xs text-muted">{s.nis ?? ""}</div></td>
                          {used.map((a) => (
                            <td key={a.id} className={cell}>
                              <select name={`l_${s.student_id}_${a.id}`} data-aspect={a.id} defaultValue={s.levels?.[a.id] ?? ""} disabled={!sheetEditable}
                                aria-label={`${aspectName(a)} ${s.full_name}`}
                                className="w-full rounded border border-line bg-sheet px-1.5 py-1 text-sm text-ink disabled:bg-paper">
                                <option value="">–</option>
                                {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                              </select>
                            </td>
                          ))}
                          <td className={cell}>
                            <Textarea name={`n_${s.student_id}`} rows={2} maxLength={2000} defaultValue={s.note ?? ""} disabled={!sheetEditable}
                              aria-label={`Catatan ${s.full_name}`} placeholder="Contoh: Aktif memimpin diskusi kelompok." />
                            {s.levels && Object.keys(s.levels).length > 0 && (
                              <p className="mt-1 text-xs text-muted">
                                {projectNarrative(s.full_name.split(" ")[0], { aspects: used.map((a) => ({ ...a, level: s.levels?.[a.id] ?? null })) })}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sheetEditable && <SubmitButton className="mt-4" pendingLabel="Menyimpan…">Simpan penilaian</SubmitButton>}
              </form>
            </>
          )}
        </Card>

        {canEdit && !locked && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card title="Ubah projek">
              <form action={updateProject} className="flex flex-col gap-4">
                <input type="hidden" name="project" value={id} />
                <ProjectFields aspects={all} classes={(classes ?? []) as { id: string; name: string }[]} p={p} />
                <p className="text-xs text-muted">Nilai dimensi yang dihapus dari projek tidak ikut tampil di rapor.</p>
                <SubmitButton className="w-fit" pendingLabel="Menyimpan…">Simpan projek</SubmitButton>
              </form>
            </Card>
            <Card title="Hapus projek" className="h-fit">
              <form action={deleteProject}>
                <input type="hidden" name="project" value={id} /><input type="hidden" name="term" value={p.term_id} />
                <SubmitButton variant="ghost" className="-ml-3 text-bad hover:bg-bad-soft">Hapus projek beserta nilainya</SubmitButton>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
