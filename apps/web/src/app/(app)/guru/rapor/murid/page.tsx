import Link from "next/link";
import { requireModule } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { tanggal } from "@/lib/format";
import { FINAL_GRADES, PROMOTION_LABEL, type ReportView, termLabel } from "@/lib/report";
import { Badge, Card, Empty, Field, Flash, Input, LinkButton, PageHeader, Select, Table, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const EXTRA_ROWS = 3;

async function saveCard(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("grades", "teacher");
  const finalize = str(fd, "action") === "final";
  const extracurriculars = Array.from({ length: EXTRA_ROWS }, (_, i) => ({
    name: str(fd, `ex_name_${i}`), grade: str(fd, `ex_grade_${i}`), note: str(fd, `ex_note_${i}`),
  })).filter((e) => e.name);
  await run(str(fd, "back"), finalize ? "Rapor difinalkan. Kepala sekolah dapat menerbitkannya." : "Rapor disimpan sebagai draf.", (sb) =>
    sb.from("report_cards").upsert({
      school_id: schoolId, term_id: str(fd, "term"), student_id: str(fd, "student"), class_id: str(fd, "class"),
      homeroom_note: str(fd, "homeroom_note") || null, extracurriculars,
      promotion: str(fd, "promotion") || null, status: finalize ? "final" : "draft",
    }, { onConflict: "term_id,student_id" }));
}

async function reopen(fd: FormData) {
  "use server";
  await requireModule("grades", "teacher");
  await run(str(fd, "back"), "Rapor dibuka kembali sebagai draf.", (sb) =>
    sb.from("report_cards").update({ status: "draft" }).eq("term_id", str(fd, "term")).eq("student_id", str(fd, "student")));
}

export default async function StudentReportEditor({ searchParams }: {
  searchParams: Promise<{ murid?: string; kelas?: string; semester?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireModule("grades", "teacher");
  if (!sp.murid || !sp.semester || !sp.kelas) return <Empty>Pilih murid dari halaman Rapor Kelas.</Empty>;
  const { data, error } = await supabase.rpc("report_card_view", { p_term: sp.semester, p_student: sp.murid });
  if (error || !data) return <Empty>{error?.message ?? "Rapor tidak ditemukan."}</Empty>;
  const r = data as ReportView;
  const { data: roster } = await supabase.from("enrollments").select("roll_number, students!inner(id, full_name, status)")
    .eq("class_id", sp.kelas).order("roll_number", { nullsFirst: false });
  const ids = ((roster ?? []) as any[]).filter((e) => e.students.status === "aktif").map((e) => e.students.id as string);
  const at = ids.indexOf(r.student.id);
  const nav = (id?: string) => id && `/guru/rapor/murid?murid=${id}&kelas=${sp.kelas}&semester=${sp.semester}`;
  const back = nav(r.student.id)!;
  const final = r.card.status === "final";
  const locked = final || !!r.term.published_at;
  const promotionOptions = FINAL_GRADES.has(r.class.grade_level) ? ["lulus", "tidak_lulus"] : ["naik", "tinggal"];

  return (
    <>
      <PageHeader title={r.student.full_name} subtitle={`${r.class.name} · ${termLabel(r.term)}`} actions={
        <div className="flex flex-wrap gap-2">
          {at > 0 && <LinkButton href={nav(ids[at - 1])!}>← Sebelumnya</LinkButton>}
          {at >= 0 && at < ids.length - 1 && <LinkButton href={nav(ids[at + 1])!}>Berikutnya →</LinkButton>}
          <LinkButton href={`/rapor?murid=${r.student.id}&semester=${r.term.id}`}>Pratinjau</LinkButton>
        </div>
      } />
      <Flash searchParams={sp} />
      <p className="mb-5 text-sm"><Link href={`/guru/rapor?kelas=${sp.kelas}&semester=${sp.semester}`} className="font-semibold text-brand">← Rapor kelas {r.class.name}</Link></p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title="Bagian wali kelas" actions={final ? <Badge tone="good">Final</Badge> : <Badge tone="warn">Draf</Badge>}>
          <form action={saveCard} className="flex flex-col gap-4">
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="term" value={r.term.id} />
            <input type="hidden" name="student" value={r.student.id} />
            <input type="hidden" name="class" value={r.class.id} />
            <Field label="Catatan wali kelas">
              <Textarea id="homeroom_note" name="homeroom_note" rows={4} defaultValue={r.card.homeroom_note ?? ""} disabled={locked}
                placeholder="Contoh: Andi aktif bertanya dan tekun. Tingkatkan ketelitian dalam mengerjakan soal." />
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">Ekstrakurikuler</legend>
              <div className="flex flex-col gap-2">
                {Array.from({ length: EXTRA_ROWS }, (_, i) => {
                  const e = r.card.extracurriculars[i];
                  return (
                    <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_1.4fr]">
                      <Input name={`ex_name_${i}`} placeholder="Kegiatan, mis. Pramuka" aria-label={`Ekstrakurikuler ${i + 1}`} defaultValue={e?.name ?? ""} disabled={locked} />
                      <Select name={`ex_grade_${i}`} aria-label={`Predikat ${i + 1}`} defaultValue={e?.grade ?? ""} disabled={locked}>
                        <option value="">Predikat</option>
                        {["Sangat baik", "Baik", "Cukup", "Kurang"].map((g) => <option key={g}>{g}</option>)}
                      </Select>
                      <Input name={`ex_note_${i}`} placeholder="Keterangan" aria-label={`Keterangan ${i + 1}`} defaultValue={e?.note ?? ""} disabled={locked} />
                    </div>
                  );
                })}
              </div>
            </fieldset>
            {r.term.semester === 2 && (
              <Field label={FINAL_GRADES.has(r.class.grade_level) ? "Kelulusan" : "Kenaikan kelas"}>
                <Select id="promotion" name="promotion" defaultValue={r.card.promotion ?? ""} disabled={locked}>
                  <option value="">Belum ditentukan</option>
                  {promotionOptions.map((p) => <option key={p} value={p}>{PROMOTION_LABEL[p]}</option>)}
                </Select>
              </Field>
            )}
            {!locked && (
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="action" value="draft" variant="secondary">Simpan draf</SubmitButton>
                <SubmitButton name="action" value="final">Simpan & finalkan</SubmitButton>
              </div>
            )}
          </form>
          {final && !r.term.published_at && (
            <form action={reopen} className="mt-4 border-t border-line pt-3">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="term" value={r.term.id} />
              <input type="hidden" name="student" value={r.student.id} />
              <button className="text-sm font-semibold text-brand">Buka kembali untuk diubah</button>
            </form>
          )}
          {r.term.published_at && <p className="mt-4 text-sm text-muted">Rapor sudah diterbitkan {tanggal(r.term.published_at)}; perubahan memerlukan kepala sekolah membuka terbitan.</p>}
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Ketidakhadiran">
            <p className="mb-2 text-xs text-muted">{final ? "Tercatat saat rapor difinalkan." : "Dihitung otomatis dari absensi harian semester ini."}</p>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[["Sakit", r.card.sick], ["Izin", r.card.permit], ["Alpa", r.card.absent]].map(([k, v]) => (
                <div key={k} className="rounded-md bg-paper p-2"><dt className="text-xs text-muted">{k}</dt><dd className="text-lg font-bold tabular-nums">{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card title="Nilai mapel">
            <Table head={["Mapel", "Nilai"]}>
              {r.grades.map((g) => (
                <tr key={g.subject}>
                  <td>{g.subject}</td>
                  <td className={`tabular-nums font-semibold ${g.score == null ? "text-muted" : g.score < r.kktp ? "text-bad" : ""}`}>{g.score == null ? "belum" : Math.round(g.score)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
