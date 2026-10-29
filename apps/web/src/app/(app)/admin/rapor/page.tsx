import Link from "next/link";
import { requireModule, requireRole } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { tanggal } from "@/lib/format";
import { activeTerms, termLabel } from "@/lib/report";
import { Badge, Button, Card, Empty, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const back = (fd: FormData) => `/admin/rapor?semester=${str(fd, "term") || str(fd, "semester")}`;

async function saveTerm(fd: FormData) {
  "use server";
  const { supabase, schoolId } = await requireRole("school_admin");
  const id = str(fd, "id");
  const row = {
    name: str(fd, "name"), semester: Number(str(fd, "semester_no")), starts_on: str(fd, "starts_on"), ends_on: str(fd, "ends_on"),
    report_date: optStr(fd, "report_date"), report_place: optStr(fd, "report_place"),
  };
  if (id) {
    await run(`/admin/rapor?semester=${id}`, "Semester disimpan.", (sb) => sb.from("terms").update(row).eq("id", id));
  } else {
    const { data: year } = await supabase.from("academic_years").select("id").eq("school_id", schoolId).eq("is_active", true).single();
    await run("/admin/rapor", "Semester dibuat.", async (sb) => {
      if (!year) throw new Error("Aktifkan tahun ajaran terlebih dahulu (menu Kelas & Tahun Ajaran).");
      return sb.from("terms").insert({ ...row, school_id: schoolId, academic_year_id: year.id });
    });
  }
}

async function saveRules(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run(back(fd), "Aturan penilaian disimpan.", async (sb) => {
    const kktp = num(fd, "kktp"), weight = num(fd, "weight");
    if (kktp < 0 || kktp > 100 || weight < 0 || weight > 100) throw new Error("KKTP dan bobot harus 0–100");
    const { data: s, error } = await sb.from("schools").select("settings").eq("id", schoolId).single();
    if (error) return { error };
    return sb.from("schools").update({ settings: { ...(s.settings as object), kktp, report_sas_weight: weight } }).eq("id", schoolId);
  });
}

async function saveOrder(fd: FormData) {
  "use server";
  await requireRole("school_admin");
  await run(back(fd), "Urutan mapel di rapor disimpan.", async (sb) => {
    for (const id of fd.getAll("subject").map(String)) {
      const { error } = await sb.from("subjects").update({ report_order: num(fd, `o_${id}`) }).eq("id", id);
      if (error) return { error };
    }
  });
}

async function publish(fd: FormData) {
  "use server";
  await requireRole("school_admin", "principal");
  const on = str(fd, "do") === "publish";
  await run(back(fd), on ? "Rapor diterbitkan. Orang tua dan murid sudah diberi tahu." : "Terbitan rapor dibuka; guru dapat memperbaiki nilai.", (sb) =>
    sb.rpc(on ? "publish_term_reports" : "unpublish_term_reports", { p_term: str(fd, "term") }));
}

export default async function ReportAdmin({ searchParams }: { searchParams: Promise<{ semester?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId, active } = await requireModule("grades", "school_admin", "principal");
  const isAdmin = active.role === "school_admin";
  const [{ terms, term, year }, { data: school }, { data: subjects }] = await Promise.all([
    activeTerms(supabase, schoolId, sp.semester),
    supabase.from("schools").select("settings").eq("id", schoolId).single(),
    supabase.from("subjects").select("id, code, name, report_order").eq("school_id", schoolId).order("report_order").order("name"),
  ]);
  const { data: progress } = term ? await supabase.rpc("term_progress", { p_term: term.id }) : { data: [] };
  const st = (school?.settings ?? {}) as Record<string, any>;
  const rows = (progress ?? []) as { class_id: string; class_name: string; homeroom: string | null; students: number; subjects: number; grades_filled: number; finals: number }[];
  const finals = rows.reduce((t, r) => t + r.finals, 0), students = rows.reduce((t, r) => t + r.students, 0);

  return (
    <>
      <PageHeader title="E-Rapor" subtitle={year ? `Tahun ajaran ${year}` : "Kurikulum Merdeka"} />
      <Flash searchParams={sp} />
      {terms.length > 1 && (
        <form className="mb-5 flex items-end gap-3">
          <Field label="Semester">
            <Select id="semester" name="semester" defaultValue={term?.id}>{terms.map((t) => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}</Select>
          </Field>
          <SubmitButton variant="secondary">Tampilkan</SubmitButton>
        </form>
      )}

      <div className={isAdmin ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" : "flex max-w-4xl flex-col gap-6"}>
        <div className="flex min-w-0 flex-col gap-6">
          {!term ? <Card title="Kemajuan rapor"><Empty>Buat semester terlebih dahulu.</Empty></Card> : (
            <Card title={`Kemajuan rapor · ${termLabel(term)}`} actions={
              term.published_at ? <Badge tone="good">Terbit {tanggal(term.published_at)}</Badge> : <Badge>Belum terbit</Badge>
            }>
              <Table head={["Kelas", "Wali kelas", "Nilai mapel terisi", "Rapor final", ""]} empty="Belum ada kelas di tahun ajaran ini.">
                {rows.map((r) => {
                  const need = r.students * r.subjects;
                  const pct = need ? Math.round((r.grades_filled / need) * 100) : 0;
                  return (
                    <tr key={r.class_id}>
                      <td className="font-semibold">{r.class_name}</td>
                      <td>{r.homeroom ?? <span className="text-muted">belum ada</span>}</td>
                      <td><Badge tone={pct === 100 ? "good" : pct ? "warn" : "neutral"}>{pct}%</Badge> <span className="text-xs text-muted tabular-nums">{r.grades_filled}/{need}</span></td>
                      <td className="tabular-nums">{r.finals}/{r.students}</td>
                      <td className="text-right whitespace-nowrap">
                        <Link href={`/rapor?kelas=${r.class_id}&semester=${term.id}`} className="text-sm font-semibold text-brand">Lihat rapor</Link>
                        <a href={`/unduh/leger?kelas=${r.class_id}&semester=${term.id}`} download className="ml-3 text-sm font-semibold text-brand">Leger</a>
                      </td>
                    </tr>
                  );
                })}
              </Table>
              <form action={publish} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <input type="hidden" name="term" value={term.id} />
                {term.published_at ? (
                  <>
                    <p className="flex-1 text-sm text-muted">Orang tua dan murid sudah bisa melihat rapor final. Nilai semester ini terkunci.</p>
                    <Button name="do" value="unpublish" variant="secondary">Buka terbitan untuk perbaikan</Button>
                  </>
                ) : (
                  <>
                    <p className="flex-1 text-sm text-muted">
                      {finals}/{students} rapor sudah difinalkan wali kelas. Saat diterbitkan, hanya rapor final yang bisa dilihat orang tua dan murid; nilai semester ini terkunci.
                    </p>
                    <Button name="do" value="publish" disabled={!finals}>Terbitkan rapor</Button>
                  </>
                )}
              </form>
            </Card>
          )}

          <Card title="Semester">
            <Table head={["Semester", "Periode", "Tanggal rapor", ""]} empty="Belum ada semester untuk tahun ajaran aktif.">
              {terms.map((t) => (
                <tr key={t.id}>
                  <td className="font-semibold">{termLabel(t)}</td>
                  <td className="whitespace-nowrap">{tanggal(t.starts_on)} – {tanggal(t.ends_on)}</td>
                  <td>{t.report_date ? `${t.report_place ?? ""}${t.report_place ? ", " : ""}${tanggal(t.report_date)}` : <span className="text-muted">belum diisi</span>}</td>
                  <td className="text-right">{isAdmin && <a href={`#t-${t.id}`} className="text-sm font-semibold text-brand">Ubah</a>}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        {isAdmin && (
          <div className="flex flex-col gap-6">
            {[...terms, null].map((t) => (
              <Card key={t?.id ?? "new"} title={t ? `Ubah ${termLabel(t)}` : "Semester baru"}>
                <form action={saveTerm} id={t ? `t-${t.id}` : undefined} className="flex flex-col gap-3">
                  <input type="hidden" name="id" value={t?.id ?? ""} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Semester">
                      <Select name="semester_no" defaultValue={String(t?.semester ?? (terms.length ? 2 : 1))}>
                        <option value="1">1</option><option value="2">2</option>
                      </Select>
                    </Field>
                    <Field label="Nama"><Input name="name" required defaultValue={t?.name ?? (terms.length ? "Genap" : "Ganjil")} /></Field>
                    <Field label="Mulai"><Input name="starts_on" type="date" required defaultValue={t?.starts_on} /></Field>
                    <Field label="Selesai"><Input name="ends_on" type="date" required defaultValue={t?.ends_on} /></Field>
                    <Field label="Tanggal rapor"><Input name="report_date" type="date" defaultValue={t?.report_date ?? ""} /></Field>
                    <Field label="Tempat"><Input name="report_place" placeholder="Kota" defaultValue={t?.report_place ?? ""} /></Field>
                  </div>
                  <SubmitButton variant={t ? "secondary" : "primary"} className="self-start">{t ? "Simpan" : "Buat semester"}</SubmitButton>
                </form>
              </Card>
            ))}

            <Card title="Aturan penilaian">
              <form action={saveRules} className="flex flex-col gap-3">
                <input type="hidden" name="semester" value={term?.id ?? ""} />
                <Field label="KKTP (batas capaian)" hint="Nilai di bawah ini ditandai merah dan deskripsinya “perlu bantuan”.">
                  <Input name="kktp" inputMode="numeric" defaultValue={st.kktp ?? 75} />
                </Field>
                <Field label="Bobot sumatif akhir semester (%)" hint="Sisanya dari rata-rata sumatif lingkup materi. Formatif tidak masuk nilai rapor.">
                  <Input name="weight" inputMode="numeric" defaultValue={st.report_sas_weight ?? 50} />
                </Field>
                <SubmitButton variant="secondary" className="self-start">Simpan</SubmitButton>
              </form>
            </Card>

            <Card title="Urutan mapel di rapor">
              {!subjects?.length ? <Empty>Belum ada mapel.</Empty> : (
                <form action={saveOrder} className="flex flex-col gap-2">
                  <input type="hidden" name="semester" value={term?.id ?? ""} />
                  {subjects.map((s) => (
                    <label key={s.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>{s.name}</span>
                      <input type="hidden" name="subject" value={s.id} />
                      <div className="w-20 shrink-0"><Input name={`o_${s.id}`} inputMode="numeric" defaultValue={s.report_order} aria-label={`Urutan ${s.name}`} /></div>
                    </label>
                  ))}
                  <SubmitButton variant="secondary" className="mt-2 self-start">Simpan urutan</SubmitButton>
                </form>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
