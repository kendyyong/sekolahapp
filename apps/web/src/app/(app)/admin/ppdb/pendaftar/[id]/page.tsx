import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { requireModule } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { FEE_LABEL, FEE_METHOD, gradeLabel, PPDB_BUCKET, PPDB_STATUS, PPDB_TONE, relationLabel, type AdmissionStatus } from "@/lib/ppdb";
import { rupiah, tanggal, waktu } from "@/lib/format";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

interface Application {
  id: string; period_id: string; number: string | null; status: AdmissionStatus; full_name: string; nisn: string | null;
  gender: string | null; birth_place: string | null; birth_date: string | null; religion: string | null; address: string | null;
  previous_school: string | null; parent_name: string | null; parent_relation: string; parent_phone: string | null;
  parent_occupation: string | null; notes: string | null; documents: Record<string, string>; staff_note: string | null;
  fee_status: string; fee_method: string | null; fee_paid_at: string | null; submitted_at: string | null; verified_at: string | null;
  student_id: string | null; created_at: string;
  admission_periods: { title: string; school_year: string; grade_level: number; fee_amount: number; documents: string[]; announced_at: string | null };
  admission_reviews: { decision: string | null; score: number | null; internal_note: string | null; decided_at: string | null } | null;
  profiles: { full_name: string; email: string | null } | null;
}

const page = (id: string) => `/admin/ppdb/pendaftar/${id}`;

async function recordFee(fd: FormData) {
  "use server";
  await requireModule("ppdb", "school_admin", "finance");
  const id = str(fd, "id");
  await run(page(id), "Biaya pendaftaran dicatat.", (sb) => sb.rpc("ppdb_record_fee", { p_app: id, p_method: str(fd, "method") }));
}

async function verify(fd: FormData) {
  "use server";
  await requireModule("ppdb", "school_admin");
  const id = str(fd, "id");
  const ok = str(fd, "ok") === "1";
  await run(page(id), ok ? "Pendaftar terverifikasi." : "Formulir dikembalikan ke pendaftar untuk diperbaiki.",
    (sb) => sb.rpc("ppdb_verify", { p_app: id, p_ok: ok, p_note: optStr(fd, "note") }));
}

async function decide(fd: FormData) {
  "use server";
  await requireModule("ppdb", "school_admin", "principal");
  const id = str(fd, "id");
  const score = optStr(fd, "score")?.replace(",", ".");
  await run(page(id), "Keputusan disimpan.", (sb) => {
    if (score && !Number.isFinite(Number(score))) throw new Error("Nilai harus berupa angka");
    return sb.rpc("ppdb_decide", { p_app: id, p_decision: str(fd, "decision"), p_score: score ? Number(score) : null, p_note: optStr(fd, "note") });
  });
}

async function enroll(fd: FormData) {
  "use server";
  await requireModule("ppdb", "school_admin");
  const id = str(fd, "id");
  await run(page(id), "Pendaftar sudah terdaftar sebagai murid. Orang tua bisa masuk sebagai wali murid.",
    (sb) => sb.rpc("ppdb_enroll", { p_app: id, p_class: optStr(fd, "class_id"), p_nis: optStr(fd, "nis") }));
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 py-1.5 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="text-muted">{label}</dt><dd className="text-ink">{value || "–"}</dd>
    </div>
  );
}

export default async function ApplicantDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, schoolId, active } = await requireModule("ppdb", "school_admin", "principal", "finance");
  const role = active.role;
  const { data } = await supabase.from("admission_applications")
    .select("*, admission_periods(title, school_year, grade_level, fee_amount, documents, announced_at), admission_reviews(decision, score, internal_note, decided_at), profiles!admission_applications_applicant_id_fkey(full_name, email)")
    .eq("id", id).eq("school_id", schoolId).maybeSingle();
  if (!data) notFound();
  const a = data as unknown as Application;
  const period = a.admission_periods;
  const paths = Object.values(a.documents ?? {});
  const [{ data: signed }, { data: classes }] = await Promise.all([
    paths.length ? supabase.storage.from(PPDB_BUCKET).createSignedUrls(paths, 600) : Promise.resolve({ data: [] }),
    a.status === "accepted"
      ? supabase.from("classes").select("id, name, grade_level, academic_years!inner(name, is_active)").eq("school_id", schoolId).order("name")
      : Promise.resolve({ data: [] }),
  ]);
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const review = a.admission_reviews;
  const canDecide = (role === "school_admin" || role === "principal") && ["verified", "accepted", "waitlisted", "rejected"].includes(a.status);
  const feeOpen = period.fee_amount > 0 && a.fee_status === "unpaid" && !["draft", "withdrawn"].includes(a.status);
  const hidden = <input type="hidden" name="id" value={a.id} />;
  const classOptions = ((classes ?? []) as unknown as { id: string; name: string; grade_level: number; academic_years: { name: string; is_active: boolean } }[])
    // Kelas di tahun ajaran tujuan gelombang lebih dulu, lalu kelas yang tingkatnya sama.
    .map((c) => ({ ...c, rank: Number(c.academic_years.name === period.school_year) * 2 + Number(c.grade_level === period.grade_level) }))
    .filter((c) => c.academic_years.is_active || c.academic_years.name >= period.school_year)
    .sort((x, y) => y.rank - x.rank);

  return (
    <>
      <Link href={`/admin/ppdb/${a.period_id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft aria-hidden className="size-4" />{period.title}
      </Link>
      <PageHeader title={a.full_name}
        subtitle={`${a.number ?? "Belum dikirim"} · ${gradeLabel(period.grade_level)} ${period.school_year}${a.submitted_at ? ` · dikirim ${waktu(a.submitted_at)}` : ""}`}
        actions={<Badge tone={PPDB_TONE[a.status]}>{PPDB_STATUS[a.status]}</Badge>} />
      <Flash searchParams={sp} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Data calon murid">
            <dl className="divide-y divide-line">
              <Row label="NISN" value={a.nisn} />
              <Row label="Jenis kelamin" value={a.gender === "L" ? "Laki-laki" : a.gender === "P" ? "Perempuan" : null} />
              <Row label="Tempat, tanggal lahir" value={[a.birth_place, tanggal(a.birth_date)].filter(Boolean).join(", ")} />
              <Row label="Agama" value={a.religion} />
              <Row label="Sekolah asal" value={a.previous_school} />
              <Row label="Alamat" value={a.address} />
            </dl>
          </Card>
          <Card title="Orang tua / wali">
            <dl className="divide-y divide-line">
              <Row label="Nama" value={a.parent_name ? `${a.parent_name} (${relationLabel(a.parent_relation)})` : null} />
              <Row label="Nomor HP/WA" value={a.parent_phone} />
              <Row label="Pekerjaan" value={a.parent_occupation} />
              <Row label="Akun pendaftar" value={a.profiles ? `${a.profiles.full_name} · ${a.profiles.email ?? ""}` : null} />
              <Row label="Catatan pendaftar" value={a.notes} />
            </dl>
          </Card>
          <Card title="Berkas">
            <ul className="grid gap-2 sm:grid-cols-2">
              {period.documents.map((label) => {
                const url = a.documents?.[label] ? urlOf.get(a.documents[label]) : null;
                return (
                  <li key={label}>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-brand ring-1 ring-line hover:bg-brand-soft">
                        <FileText aria-hidden className="size-4" />{label}
                      </a>
                    ) : (
                      <span className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted ring-1 ring-line"><FileText aria-hidden className="size-4" />{label} · belum ada</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted">Tautan berkas berlaku 10 menit.</p>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Biaya pendaftaran">
            {period.fee_amount === 0 ? <p className="text-sm text-muted">Gelombang ini gratis.</p> : (
              <>
                <p className="text-sm">{rupiah(period.fee_amount)} · <Badge tone={a.fee_status === "unpaid" ? "warn" : "good"}>{FEE_LABEL[a.fee_status]}</Badge></p>
                {a.fee_paid_at && <p className="mt-1 text-xs text-muted">{FEE_METHOD[a.fee_method ?? ""]} · {waktu(a.fee_paid_at)}</p>}
                {feeOpen && (role === "school_admin" || role === "finance") && (
                  <form action={recordFee} className="mt-4 flex items-end gap-2">
                    {hidden}
                    <Field label="Dibayar dengan" className="flex-1">
                      <Select id="method" name="method" defaultValue="cash">
                        <option value="cash">Tunai</option><option value="transfer">Transfer</option><option value="waived">Dibebaskan</option>
                      </Select>
                    </Field>
                    <SubmitButton pendingLabel="Mencatat…">Catat</SubmitButton>
                  </form>
                )}
              </>
            )}
          </Card>

          {a.status === "submitted" && role === "school_admin" && (
            <Card title="Verifikasi berkas">
              <p className="text-sm text-muted">Periksa data dan berkas. Bila ada yang kurang, kembalikan dengan catatan agar orang tua memperbaikinya.</p>
              <form action={verify} className="mt-4 flex flex-col gap-3">
                {hidden}
                <Field label="Catatan untuk pendaftar"><Textarea id="note" name="note" rows={2} placeholder="Wajib diisi bila dikembalikan" /></Field>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="ok" value="1" pendingLabel="Memproses…">Terverifikasi</SubmitButton>
                  <SubmitButton name="ok" value="0" variant="secondary" pendingLabel="Memproses…">Kembalikan</SubmitButton>
                </div>
              </form>
            </Card>
          )}

          {(canDecide || review) && (
            <Card title="Keputusan seleksi">
              {review?.decision && (
                <p className="mb-3 text-sm">
                  Saat ini: <b>{({ accepted: "Diterima", waitlisted: "Cadangan", rejected: "Tidak diterima" } as Record<string, string>)[review.decision]}</b>
                  {review.score != null && ` · nilai ${review.score}`}
                  {review.decided_at && <span className="text-muted"> · {waktu(review.decided_at)}</span>}
                  {review.internal_note && <span className="mt-1 block text-muted">{review.internal_note}</span>}
                </p>
              )}
              {canDecide ? (
                <form action={decide} className="flex flex-col gap-3">
                  {hidden}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Keputusan">
                      <Select id="decision" name="decision" defaultValue={review?.decision ?? "accepted"}>
                        <option value="accepted">Diterima</option><option value="waitlisted">Cadangan</option><option value="rejected">Tidak diterima</option>
                      </Select>
                    </Field>
                    <Field label="Nilai (opsional)"><Input id="score" name="score" inputMode="decimal" defaultValue={review?.score ?? ""} /></Field>
                  </div>
                  <Field label="Catatan internal"><Textarea id="decision-note" name="note" rows={2} /></Field>
                  <SubmitButton pendingLabel="Menyimpan…">Simpan keputusan</SubmitButton>
                  {!period.announced_at && <p className="text-xs text-muted">Pendaftar baru melihat keputusan setelah hasil gelombang diumumkan.</p>}
                </form>
              ) : a.status === "submitted" ? <p className="text-sm text-muted">Verifikasi berkas dulu sebelum memberi keputusan.</p> : null}
            </Card>
          )}

          {a.status === "accepted" && role === "school_admin" && (
            <Card title="Daftarkan sebagai murid">
              <p className="text-sm text-muted">Membuat data murid baru, memasukkannya ke kelas, dan menjadikan akun pendaftar sebagai wali murid.</p>
              <form action={enroll} className="mt-4 flex flex-col gap-3">
                {hidden}
                <Field label="Kelas (opsional)" hint="Kelas tahun ajaran berikutnya bisa dipilih nanti di Data Murid">
                  <Select id="class_id" name="class_id" defaultValue="">
                    <option value="">Belum ditentukan</option>
                    {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.academic_years.name}</option>)}
                  </Select>
                </Field>
                <Field label="NIS (opsional)"><Input id="nis" name="nis" /></Field>
                <SubmitButton pendingLabel="Mendaftarkan…">Daftarkan murid</SubmitButton>
              </form>
            </Card>
          )}
          {a.status === "enrolled" && (
            <Card title="Sudah jadi murid">
              <p className="text-sm text-muted">Data murid sudah dibuat. <Link href={`/admin/murid?q=${encodeURIComponent(a.full_name)}`} className="font-semibold text-brand">Buka Data Murid</Link></p>
            </Card>
          )}
          {a.staff_note && <p className="text-sm text-muted">Catatan untuk pendaftar: {a.staff_note}</p>}
        </div>
      </div>
    </>
  );
}
