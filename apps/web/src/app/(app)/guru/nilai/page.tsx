import Link from "next/link";
import { requireModule } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { tanggal, todayJakarta } from "@/lib/format";
import { classRoster, myTeaching } from "@/lib/queries";
import { activeTerms, KIND_LABEL, termLabel } from "@/lib/report";
import { Badge, Card, Empty, Field, Flash, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const back = (fd: FormData) => str(fd, "back");
const score = (v: string) => {
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Nilai "${v}" harus angka 0–100`);
  return n;
};

async function createAssessment(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("grades", "teacher");
  const objectives = fd.getAll("objective").map(String);
  let id = "";
  await run(back(fd), "Penilaian dibuat. Isi nilainya di bawah.", async (sb) => {
    const { data, error } = await sb.from("assessments").insert({
      school_id: schoolId, teaching_assignment_id: str(fd, "ta"), term_id: str(fd, "term"),
      kind: str(fd, "kind"), title: str(fd, "title"), held_on: str(fd, "held_on"), objective_ids: objectives,
    }).select("id").single();
    id = data?.id ?? "";
    return { error };
  }, () => `${back(fd)}&penilaian=${id}`);
}

async function deleteAssessment(fd: FormData) {
  "use server";
  await requireModule("grades", "teacher");
  await run(back(fd), "Penilaian dihapus.", (sb) => sb.from("assessments").delete().eq("id", str(fd, "id")));
}

async function saveScores(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("grades", "teacher");
  const assessment = str(fd, "assessment");
  await run(back(fd), "Nilai disimpan.", async (sb) => {
    const upserts = [], removed: string[] = [];
    for (const id of fd.getAll("student").map(String)) {
      const v = str(fd, `s_${id}`);
      if (v) upserts.push({ assessment_id: assessment, student_id: id, school_id: schoolId, score: score(v) });
      else if (fd.get(`had_${id}`)) removed.push(id);
    }
    if (upserts.length) {
      const { error } = await sb.from("assessment_scores").upsert(upserts, { onConflict: "assessment_id,student_id" });
      if (error) return { error };
    }
    if (removed.length) return sb.from("assessment_scores").delete().eq("assessment_id", assessment).in("student_id", removed);
  });
}

async function computeGrades(fd: FormData) {
  "use server";
  await requireModule("grades", "teacher");
  const term = str(fd, "term"), ta = str(fd, "ta");
  await run(back(fd), "Nilai rapor dihitung dari sumatif dan deskripsi capaian dari TP.", async (sb) => {
    if (fd.get("reset") === "on") {
      const { error } = await sb.from("report_grades").update({ edited: false }).eq("term_id", term).eq("teaching_assignment_id", ta);
      if (error) return { error };
    }
    return sb.rpc("compute_report_grades", { p_term: term, p_ta: ta });
  });
}

async function saveReportGrades(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("grades", "teacher");
  const term = str(fd, "term"), ta = str(fd, "ta");
  await run(back(fd), "Nilai rapor disimpan.", async (sb) => {
    const rows = [];
    for (const id of fd.getAll("student").map(String)) {
      const v = str(fd, `n_${id}`), d = str(fd, `d_${id}`);
      if (v === str(fd, `on_${id}`) && d === str(fd, `od_${id}`)) continue;
      rows.push({ school_id: schoolId, term_id: term, teaching_assignment_id: ta, student_id: id,
        score: v ? score(v) : null, description: d || null, edited: true });
    }
    if (!rows.length) throw new Error("Tidak ada perubahan.");
    return sb.from("report_grades").upsert(rows, { onConflict: "term_id,teaching_assignment_id,student_id" });
  });
}

async function addObjective(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("grades", "teacher");
  await run(back(fd), "Tujuan pembelajaran ditambahkan.", (sb) => sb.from("learning_objectives").insert({
    school_id: schoolId, subject_id: str(fd, "subject"), grade_level: Number(str(fd, "grade")),
    code: str(fd, "code"), description: str(fd, "description").replace(/\.$/, ""),
  }));
}

async function deleteObjective(fd: FormData) {
  "use server";
  await requireModule("grades", "teacher");
  await run(back(fd), "Tujuan pembelajaran dihapus.", (sb) => sb.from("learning_objectives").delete().eq("id", str(fd, "id")));
}

export default async function GradesPage({ searchParams }: {
  searchParams: Promise<{ mapel?: string; semester?: string; penilaian?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireModule("grades", "teacher");
  const [teaching, { terms, term }] = await Promise.all([myTeaching(supabase, user.id), activeTerms(supabase, schoolId, sp.semester)]);
  const ta = teaching.find((t) => t.id === sp.mapel) ?? teaching[0];

  if (!ta || !term) {
    return (
      <>
        <PageHeader title="Nilai & Rapor" />
        <Empty>{!ta ? "Anda belum mengampu mapel di kelas mana pun." : "Admin sekolah belum membuat semester untuk tahun ajaran aktif (menu E-Rapor)."}</Empty>
      </>
    );
  }

  const base = `/guru/nilai?mapel=${ta.id}&semester=${term.id}`;
  const [roster, { data: assessments }, { data: objectives }, { data: grades }, { data: school }] = await Promise.all([
    classRoster(supabase, ta.class_id),
    supabase.from("assessments").select("id, kind, title, held_on, objective_ids, assessment_scores(student_id, score)")
      .eq("teaching_assignment_id", ta.id).eq("term_id", term.id).order("held_on").order("created_at"),
    supabase.from("learning_objectives").select("id, code, description")
      .eq("subject_id", ta.subjects.id).eq("grade_level", ta.classes.grade_level).order("code"),
    supabase.from("report_grades").select("student_id, score, description, edited")
      .eq("teaching_assignment_id", ta.id).eq("term_id", term.id),
    supabase.from("schools").select("settings").eq("id", schoolId).single(),
  ]);
  const kktp = Number((school?.settings as Record<string, unknown> | null)?.kktp ?? 75);
  const students = roster.filter((s) => s.status === "aktif");
  const tpCode = new Map((objectives ?? []).map((o) => [o.id, o.code]));
  const current = (assessments ?? []).find((a) => a.id === sp.penilaian);
  const currentScores = new Map((current?.assessment_scores ?? []).map((s) => [s.student_id, Number(s.score)]));
  const gradeOf = new Map((grades ?? []).map((g) => [g.student_id, g]));
  const locked = !!term.published_at;

  return (
    <>
      <PageHeader title="Nilai & Rapor" subtitle={`${ta.subjects.name} · ${ta.classes.name} · ${termLabel(term)}`} />
      <Flash searchParams={sp} />
      <form className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Mapel & kelas">
          <Select id="mapel" name="mapel" defaultValue={ta.id}>
            {teaching.map((t) => <option key={t.id} value={t.id}>{t.subjects.name} · {t.classes.name}</option>)}
          </Select>
        </Field>
        <Field label="Semester">
          <Select id="semester" name="semester" defaultValue={term.id}>
            {terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
          </Select>
        </Field>
        <SubmitButton variant="secondary">Tampilkan</SubmitButton>
      </form>
      {locked && (
        <p className="mb-5 rounded-md border border-line bg-warn-soft px-4 py-3 text-sm text-ink">
          Rapor semester ini sudah diterbitkan pada {tanggal(term.published_at)}, jadi nilai terkunci. Minta kepala sekolah membuka terbitan bila perlu perbaikan.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {current ? (
            <Card title={`Nilai: ${current.title}`} actions={<Link href={base} className="text-sm font-semibold text-brand">Kembali ke daftar</Link>}>
              <p className="mb-3 text-sm text-muted">
                {KIND_LABEL[current.kind]} · {tanggal(current.held_on)}
                {current.objective_ids.length > 0 && <> · {current.objective_ids.map((id: string) => tpCode.get(id)).filter(Boolean).join(", ")}</>}
              </p>
              <form action={saveScores}>
                <input type="hidden" name="back" value={`${base}&penilaian=${current.id}`} />
                <input type="hidden" name="assessment" value={current.id} />
                <Table head={["No", "Nama", "Nilai (0–100)"]} empty="Belum ada murid di kelas ini.">
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td className="tabular-nums text-muted">{s.roll ?? "–"}</td>
                      <td className="font-semibold">{s.full_name}</td>
                      <td>
                        <input type="hidden" name="student" value={s.id} />
                        {currentScores.has(s.id) && <input type="hidden" name={`had_${s.id}`} value="1" />}
                        <div className="w-24">
                          <Input name={`s_${s.id}`} inputMode="decimal" aria-label={`Nilai ${s.full_name}`}
                            defaultValue={currentScores.get(s.id) ?? ""} disabled={locked} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
                {!locked && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SubmitButton>Simpan nilai</SubmitButton>
                  </div>
                )}
              </form>
              {!locked && (
                <form action={deleteAssessment} className="mt-4 border-t border-line pt-3">
                  <input type="hidden" name="back" value={base} />
                  <input type="hidden" name="id" value={current.id} />
                  <button className="text-sm font-semibold text-bad">Hapus penilaian ini beserta nilainya</button>
                </form>
              )}
            </Card>
          ) : (
            <Card title="Penilaian semester ini">
              <Table head={["Tanggal", "Penilaian", "Jenis", "TP", "Terisi", "Rata-rata", ""]} empty="Belum ada penilaian. Buat dari formulir di samping.">
                {(assessments ?? []).map((a) => {
                  const sc = a.assessment_scores ?? [];
                  const avg = sc.length ? sc.reduce((t, s) => t + Number(s.score), 0) / sc.length : null;
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{tanggal(a.held_on)}</td>
                      <td className="font-semibold">{a.title}</td>
                      <td className="whitespace-nowrap"><Badge tone={a.kind === "formatif" ? "neutral" : a.kind === "sas" ? "warn" : "info"}>{KIND_LABEL[a.kind]}</Badge></td>
                      <td className="text-sm whitespace-nowrap text-muted">{a.objective_ids.map((id: string) => tpCode.get(id)).filter(Boolean).join(", ") || "–"}</td>
                      <td className="tabular-nums">{sc.length}/{students.length}</td>
                      <td className="tabular-nums">{avg === null ? "–" : avg.toFixed(1)}</td>
                      <td className="text-right"><Link href={`${base}&penilaian=${a.id}`} className="text-sm font-semibold whitespace-nowrap text-brand">Isi nilai</Link></td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          )}

          <Card title="Nilai rapor">
            <p className="mb-3 text-sm text-muted">
              Nilai rapor dihitung dari rata-rata sumatif lingkup materi dan sumatif akhir semester (bobot diatur sekolah).
              Deskripsi diambil dari TP dengan capaian tertinggi dan terendah. Nilai dan deskripsi boleh Anda ubah; perubahan Anda tidak ditimpa saat dihitung ulang.
            </p>
            {!locked && (
              <form action={computeGrades} className="mb-4 flex flex-wrap items-center gap-3">
                <input type="hidden" name="back" value={base} />
                <input type="hidden" name="term" value={term.id} />
                <input type="hidden" name="ta" value={ta.id} />
                <SubmitButton>{grades?.length ? "Hitung ulang nilai rapor" : "Hitung nilai rapor"}</SubmitButton>
                {!!grades?.some((g) => g.edited) && (
                  <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="reset" /> Timpa juga yang sudah saya ubah</label>
                )}
              </form>
            )}
            {!grades?.length ? <Empty>Belum dihitung.</Empty> : (
              <form action={saveReportGrades}>
                <input type="hidden" name="back" value={base} />
                <input type="hidden" name="term" value={term.id} />
                <input type="hidden" name="ta" value={ta.id} />
                <Table head={["Nama", "Nilai", "Capaian kompetensi"]}>
                  {students.map((s) => {
                    const g = gradeOf.get(s.id);
                    const n = g?.score == null ? "" : String(Number(g.score));
                    return (
                      <tr key={s.id}>
                        <td className="align-top font-semibold">
                          {s.full_name}
                          {g?.edited && <div className="text-xs font-normal text-muted">diubah manual</div>}
                        </td>
                        <td className="align-top">
                          <input type="hidden" name="student" value={s.id} />
                          <input type="hidden" name={`on_${s.id}`} value={n} />
                          <input type="hidden" name={`od_${s.id}`} value={g?.description ?? ""} />
                          <div className="w-20">
                            <Input name={`n_${s.id}`} inputMode="decimal" defaultValue={n} aria-label={`Nilai rapor ${s.full_name}`}
                              className={g?.score != null && Number(g.score) < kktp ? "text-bad" : ""} disabled={locked} />
                          </div>
                        </td>
                        <td>
                          <Textarea name={`d_${s.id}`} rows={3} defaultValue={g?.description ?? ""} aria-label={`Deskripsi ${s.full_name}`}
                            className="min-w-64" disabled={locked} />
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                {!locked && <SubmitButton className="mt-3">Simpan perubahan</SubmitButton>}
              </form>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {!locked && (
            <Card title="Penilaian baru">
              <form action={createAssessment} className="flex flex-col gap-3">
                <input type="hidden" name="back" value={base} />
                <input type="hidden" name="ta" value={ta.id} />
                <input type="hidden" name="term" value={term.id} />
                <Field label="Jenis">
                  <Select id="kind" name="kind" defaultValue="sumatif">
                    {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Judul"><Input id="title" name="title" required placeholder="Sumatif bab pecahan" /></Field>
                <Field label="Tanggal"><Input id="held_on" name="held_on" type="date" defaultValue={todayJakarta()} required /></Field>
                {!!objectives?.length && (
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1 text-sm font-semibold text-ink">Tujuan pembelajaran yang diukur</legend>
                    {objectives.map((o) => (
                      <label key={o.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name="objective" value={o.id} className="mt-1" />
                        <span><b>{o.code}</b> {o.description}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
                <SubmitButton className="self-start">Buat penilaian</SubmitButton>
              </form>
            </Card>
          )}

          <Card title={`Tujuan pembelajaran · ${ta.subjects.name} kelas ${ta.classes.grade_level}`}>
            {!objectives?.length ? <p className="text-sm text-muted">Belum ada TP. Tambahkan agar deskripsi rapor bisa dibuat otomatis.</p> : (
              <ul className="mb-4 flex flex-col gap-2 text-sm">
                {objectives.map((o) => (
                  <li key={o.id} className="flex items-start justify-between gap-2">
                    <span><b>{o.code}</b> {o.description}</span>
                    <form action={deleteObjective}>
                      <input type="hidden" name="back" value={base} />
                      <input type="hidden" name="id" value={o.id} />
                      <button className="text-xs font-semibold text-bad" aria-label={`Hapus ${o.code}`}>Hapus</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addObjective} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
              <input type="hidden" name="back" value={base} />
              <input type="hidden" name="subject" value={ta.subjects.id} />
              <input type="hidden" name="grade" value={ta.classes.grade_level} />
              <Field label="Kode"><Input id="code" name="code" required defaultValue={`TP ${(objectives?.length ?? 0) + 1}`} /></Field>
              <Field label="Deskripsi" hint="Tulis sebagai frasa, misalnya: menjumlahkan dan mengurangkan pecahan">
                <Textarea id="description" name="description" rows={2} required />
              </Field>
              <SubmitButton variant="secondary" className="self-start">Tambah TP</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
