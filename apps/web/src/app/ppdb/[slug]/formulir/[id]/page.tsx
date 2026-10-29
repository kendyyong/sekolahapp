import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, FileCheck2, FileWarning, MessageSquareWarning } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { loadPpdb } from "@/lib/ppdb-server";
import { optStr, run, str } from "@/lib/actions";
import {
  APPLICATION_FIELDS, DOC_TYPES, docSlug, FEE_LABEL, gradeLabel, PPDB_BUCKET, PPDB_STATUS, PPDB_TONE, relationLabel, RELATIONS, RELIGIONS,
  type AdmissionStatus,
} from "@/lib/ppdb";
import { rupiah, tanggal, waktu } from "@/lib/format";
import { Badge, Card, Field, Flash, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PrintButton } from "@/components/print-button";
import { PpdbShell } from "@/components/ppdb-shell";

export const metadata: Metadata = { title: "Formulir PPDB" };

interface Application {
  id: string; school_id: string; number: string | null; status: AdmissionStatus; full_name: string; nisn: string | null;
  gender: string | null; birth_place: string | null; birth_date: string | null; religion: string | null; address: string | null;
  previous_school: string | null; parent_name: string | null; parent_relation: string; parent_phone: string | null;
  parent_occupation: string | null; notes: string | null; documents: Record<string, string>; staff_note: string | null;
  fee_status: string; submitted_at: string | null; verified_at: string | null; created_at: string;
  admission_periods: { title: string; school_year: string; grade_level: number; fee_amount: number; documents: string[]; closes_on: string };
}

const page = (slug: string, id: string) => `/ppdb/${slug}/formulir/${id}`;

async function load(sb: SupabaseClient, id: string) {
  const { data } = await sb.from("admission_applications")
    .select("*, admission_periods(title, school_year, grade_level, fee_amount, documents, closes_on)").eq("id", id).maybeSingle();
  return data as Application | null;
}

async function saveForm(fd: FormData) {
  "use server";
  const slug = str(fd, "slug"), id = str(fd, "id");
  await run(page(slug, id), "Formulir disimpan.", async (sb) => {
    const app = await load(sb, id);
    if (!app) throw new Error("Formulir tidak ditemukan");
    const patch: Record<string, unknown> = Object.fromEntries(APPLICATION_FIELDS.map((k) => [k, optStr(fd, k)]));
    if (!patch.full_name) throw new Error("Nama calon murid wajib diisi");
    if (patch.nisn && !/^\d{10}$/.test(String(patch.nisn))) throw new Error("NISN harus 10 digit angka");
    patch.parent_relation ??= "orang tua";

    // Berkas baru menggantikan yang lama untuk dokumen yang sama.
    const documents = { ...app.documents };
    const replaced: string[] = [];
    for (const [i, label] of app.admission_periods.documents.entries()) {
      const file = fd.get(`doc_${i}`);
      if (!(file instanceof File) || file.size === 0) continue;
      const ext = DOC_TYPES[file.type];
      if (!ext) throw new Error(`${label}: unggah foto (JPG/PNG/WEBP) atau PDF`);
      if (file.size > 5 * 1024 * 1024) throw new Error(`${label}: ukuran maksimal 5 MB`);
      const path = `${app.school_id}/${app.id}/${docSlug(label)}-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from(PPDB_BUCKET).upload(path, file, { contentType: file.type });
      if (error) throw new Error(`Gagal mengunggah ${label}: ${error.message}`);
      if (documents[label]) replaced.push(documents[label]);
      documents[label] = path;
    }
    const res = await sb.from("admission_applications").update({ ...patch, documents }).eq("id", id);
    if (!res.error && replaced.length) await sb.storage.from(PPDB_BUCKET).remove(replaced);
    return res;
  });
}

async function submitForm(fd: FormData) {
  "use server";
  const slug = str(fd, "slug"), id = str(fd, "id");
  await run(page(slug, id), "Formulir terkirim. Panitia akan memeriksa berkas Anda.", (sb) => sb.rpc("ppdb_submit", { p_app: id }));
}

async function deleteDraft(fd: FormData) {
  "use server";
  const slug = str(fd, "slug"), id = str(fd, "id");
  await run(page(slug, id), "Formulir dihapus.", async (sb) => {
    const app = await load(sb, id);
    const paths = Object.values(app?.documents ?? {});
    const res = await sb.from("admission_applications").delete().eq("id", id).eq("status", "draft");
    if (!res.error && paths.length) await sb.storage.from(PPDB_BUCKET).remove(paths);
    return res;
  }, () => `/ppdb/${slug}/formulir`);
}

async function withdraw(fd: FormData) {
  "use server";
  const slug = str(fd, "slug"), id = str(fd, "id");
  await run(page(slug, id), "Pendaftaran dibatalkan.", (sb) => sb.rpc("ppdb_withdraw", { p_app: id }));
}

const STEPS: { key: AdmissionStatus[]; label: string }[] = [
  { key: ["submitted", "verified", "accepted", "waitlisted", "rejected", "enrolled"], label: "Formulir terkirim" },
  { key: ["verified", "accepted", "waitlisted", "rejected", "enrolled"], label: "Berkas terverifikasi" },
  { key: ["accepted", "waitlisted", "rejected", "enrolled"], label: "Hasil seleksi diumumkan" },
  { key: ["enrolled"], label: "Terdaftar sebagai murid" },
];

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-1.5 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="text-muted">{label}</dt><dd className="text-ink">{value || "–"}</dd>
    </div>
  );
}

export default async function ApplicationPage({ params, searchParams }: {
  params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [{ slug, id }, sp] = await Promise.all([params, searchParams]);
  const data = await loadPpdb(slug);
  if (!data) notFound();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/masuk/${data.school.slug}?next=${page(data.school.slug, id)}`);
  const app = await load(sb, id);
  if (!app || app.school_id !== data.school.id) notFound();
  const { school } = data;
  const period = app.admission_periods;
  const draft = app.status === "draft";
  const docPaths = Object.values(app.documents ?? {});
  const { data: signed } = docPaths.length ? await sb.storage.from(PPDB_BUCKET).createSignedUrls(docPaths, 600) : { data: [] };
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const missing = period.documents.filter((d) => !app.documents?.[d]);
  const hidden = (<><input type="hidden" name="slug" value={school.slug} /><input type="hidden" name="id" value={app.id} /></>);

  return (
    <PpdbShell school={school} email={user.email ?? ""}>
      <Link href={`/ppdb/${school.slug}/formulir`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden">
        <ArrowLeft aria-hidden className="size-4" />Pendaftaran saya
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{app.full_name}</h1>
          <p className="mt-1 text-sm text-muted">{period.title} · {gradeLabel(period.grade_level)} · Tahun ajaran {period.school_year}</p>
        </div>
        <Badge tone={PPDB_TONE[app.status]}>{PPDB_STATUS[app.status]}</Badge>
      </div>
      <div className="mt-5 print:hidden"><Flash searchParams={sp} /></div>

      {draft && app.staff_note && (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <MessageSquareWarning aria-hidden className="mt-px size-4 shrink-0" />
          <span><b>Catatan panitia:</b> {app.staff_note}. Perbaiki lalu kirim ulang formulir.</span>
        </div>
      )}

      {draft ? (
        <>
          <form action={saveForm} className="flex flex-col gap-6">
            {hidden}
            <Card title="Data calon murid">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama lengkap" className="sm:col-span-2"><Input id="full_name" name="full_name" required defaultValue={app.full_name} /></Field>
                <Field label="NISN (opsional)" hint="10 digit, bila sudah punya"><Input id="nisn" name="nisn" inputMode="numeric" pattern="\d{10}" defaultValue={app.nisn ?? ""} /></Field>
                <Field label="Jenis kelamin">
                  <Select id="gender" name="gender" defaultValue={app.gender ?? ""}>
                    <option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
                  </Select>
                </Field>
                <Field label="Tempat lahir"><Input id="birth_place" name="birth_place" defaultValue={app.birth_place ?? ""} /></Field>
                <Field label="Tanggal lahir"><Input id="birth_date" name="birth_date" type="date" defaultValue={app.birth_date ?? ""} /></Field>
                <Field label="Agama">
                  <Select id="religion" name="religion" defaultValue={app.religion ?? ""}>
                    <option value="">Pilih</option>{RELIGIONS.map((r) => <option key={r}>{r}</option>)}
                  </Select>
                </Field>
                <Field label="Sekolah asal"><Input id="previous_school" name="previous_school" defaultValue={app.previous_school ?? ""} /></Field>
                <Field label="Alamat rumah" className="sm:col-span-2"><Textarea id="address" name="address" rows={2} defaultValue={app.address ?? ""} /></Field>
              </div>
            </Card>
            <Card title="Data orang tua / wali">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama orang tua/wali"><Input id="parent_name" name="parent_name" defaultValue={app.parent_name ?? ""} /></Field>
                <Field label="Hubungan">
                  <Select id="parent_relation" name="parent_relation" defaultValue={app.parent_relation}>
                    {RELATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    <option value="orang tua">Orang tua</option>
                  </Select>
                </Field>
                <Field label="Nomor HP/WA"><Input id="parent_phone" name="parent_phone" type="tel" inputMode="tel" defaultValue={app.parent_phone ?? ""} /></Field>
                <Field label="Pekerjaan"><Input id="parent_occupation" name="parent_occupation" defaultValue={app.parent_occupation ?? ""} /></Field>
                <Field label="Catatan untuk panitia (opsional)" className="sm:col-span-2"><Textarea id="notes" name="notes" rows={2} defaultValue={app.notes ?? ""} /></Field>
              </div>
            </Card>
            <Card title="Berkas persyaratan">
              <p className="mb-4 text-sm text-muted">Foto yang jelas atau PDF, maksimal 5 MB per berkas. Memilih berkas baru akan mengganti berkas lama.</p>
              <ul className="flex flex-col divide-y divide-line">
                {period.documents.map((label, i) => {
                  const path = app.documents?.[label];
                  const url = path ? urlOf.get(path) : null;
                  return (
                    <li key={label} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        {path ? <FileCheck2 aria-hidden className="size-5 text-good" /> : <FileWarning aria-hidden className="size-5 text-warn" />}
                        <span className="font-semibold text-ink">{label}</span>
                        {url && <a href={url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand">Lihat</a>}
                      </div>
                      <input type="file" name={`doc_${i}`} accept="image/png,image/jpeg,image/webp,application/pdf" aria-label={`Berkas ${label}`}
                        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand" />
                    </li>
                  );
                })}
              </ul>
            </Card>
            <div className="flex flex-wrap gap-3">
              <SubmitButton variant="secondary" pendingLabel="Menyimpan…">Simpan</SubmitButton>
            </div>
          </form>

          <div className="mt-8 rounded-xl border border-line bg-sheet p-5 shadow-card">
            <h2 className="font-bold text-ink">Kirim formulir</h2>
            <p className="mt-1 text-sm text-muted">
              Simpan dulu perubahan Anda. Setelah dikirim, formulir tidak bisa diubah kecuali panitia mengembalikannya.
              {period.fee_amount > 0 && ` Biaya pendaftaran ${rupiah(period.fee_amount)} dibayarkan ke panitia sesuai petunjuk sekolah.`}
              {` Pendaftaran ditutup ${tanggal(period.closes_on)}.`}
            </p>
            {missing.length > 0 && <p className="mt-2 text-sm text-warn">Berkas belum lengkap: {missing.join(", ")}.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <form action={submitForm}>{hidden}<SubmitButton pendingLabel="Mengirim…">Kirim formulir</SubmitButton></form>
              <form action={deleteDraft}>{hidden}<SubmitButton variant="ghost" className="text-bad hover:bg-bad-soft" pendingLabel="Menghapus…">Hapus formulir</SubmitButton></form>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-6">
          <Card title="Status pendaftaran" actions={<span className="print:hidden"><PrintButton label="Cetak bukti" /></span>}>
            {app.number && (
              <p className="mb-4 text-sm text-muted">Nomor pendaftaran <span className="ml-1 rounded-md bg-paper px-2 py-1 font-mono text-base font-bold text-ink ring-1 ring-line">{app.number}</span></p>
            )}
            {app.status === "withdrawn" ? (
              <p className="text-sm text-muted">Pendaftaran ini sudah dibatalkan.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {STEPS.map((s) => {
                  const done = s.key.includes(app.status);
                  return (
                    <li key={s.label} className="flex items-center gap-2.5 text-sm">
                      {done ? <CheckCircle2 aria-hidden className="size-5 text-good" /> : <Circle aria-hidden className="size-5 text-line" />}
                      <span className={done ? "font-semibold text-ink" : "text-muted"}>{s.label}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {app.status === "accepted" && <p className="mt-4 rounded-lg bg-good-soft px-4 py-3 text-sm font-semibold text-good">Selamat, {app.full_name} diterima. Panitia akan menghubungi Anda untuk daftar ulang.</p>}
            {app.status === "waitlisted" && <p className="mt-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{app.full_name} masuk daftar cadangan. Kami akan mengabari bila ada kursi kosong.</p>}
            {app.status === "rejected" && <p className="mt-4 rounded-lg bg-paper px-4 py-3 text-sm text-ink ring-1 ring-line">Mohon maaf, {app.full_name} belum diterima pada gelombang ini. Terima kasih telah mendaftar.</p>}
            {app.status === "enrolled" && (
              <p className="mt-4 rounded-lg bg-good-soft px-4 py-3 text-sm text-good">
                {app.full_name} sudah terdaftar sebagai murid. <Link href="/mulai" className="font-semibold underline">Buka dasbor orang tua</Link>
              </p>
            )}
            {app.staff_note && <p className="mt-4 text-sm text-muted">Catatan panitia: {app.staff_note}</p>}
            <dl className="mt-4 border-t border-line pt-3">
              <Row label="Dikirim" value={app.submitted_at ? waktu(app.submitted_at) : null} />
              <Row label="Biaya pendaftaran" value={period.fee_amount ? `${rupiah(period.fee_amount)} · ${FEE_LABEL[app.fee_status]}` : "Gratis"} />
            </dl>
          </Card>
          <Card title="Data yang dikirim">
            <dl className="divide-y divide-line">
              <Row label="NISN" value={app.nisn} />
              <Row label="Jenis kelamin" value={app.gender === "L" ? "Laki-laki" : app.gender === "P" ? "Perempuan" : null} />
              <Row label="Tempat, tanggal lahir" value={[app.birth_place, tanggal(app.birth_date)].filter(Boolean).join(", ")} />
              <Row label="Agama" value={app.religion} />
              <Row label="Sekolah asal" value={app.previous_school} />
              <Row label="Alamat" value={app.address} />
              <Row label="Orang tua/wali" value={app.parent_name ? `${app.parent_name} (${relationLabel(app.parent_relation)})` : null} />
              <Row label="Nomor HP/WA" value={app.parent_phone} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              {period.documents.map((label) => {
                const url = app.documents?.[label] ? urlOf.get(app.documents[label]) : null;
                return url
                  ? <a key={label} href={url} target="_blank" rel="noreferrer" className="rounded-md bg-paper px-2.5 py-1 text-sm font-semibold text-brand ring-1 ring-line">{label}</a>
                  : <span key={label} className="rounded-md bg-paper px-2.5 py-1 text-sm text-muted ring-1 ring-line">{label} –</span>;
              })}
            </div>
          </Card>
          {["submitted", "verified", "accepted", "waitlisted"].includes(app.status) && (
            <form action={withdraw} className="print:hidden">
              {hidden}
              <SubmitButton variant="ghost" className="text-bad hover:bg-bad-soft" pendingLabel="Membatalkan…">Batalkan pendaftaran</SubmitButton>
            </form>
          )}
        </div>
      )}
    </PpdbShell>
  );
}
