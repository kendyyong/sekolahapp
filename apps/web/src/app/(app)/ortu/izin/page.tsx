import { requireRole } from "@/lib/session";
import { run, str, uploadFile } from "@/lib/actions";
import { tanggal, todayJakarta, waktu } from "@/lib/format";
import { myChildren, signedUrl } from "@/lib/queries";
import { Card, Empty, Field, Flash, Input, PageHeader, Select, StatusBadge, Table, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ChildTabs, pickChild } from "../child-tabs";

const LETTER_TYPES = ["application/pdf", "image/png", "image/jpeg"];

async function submitLeave(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("guardian");
  const studentId = str(fd, "student_id");
  await run(`/ortu/izin?anak=${studentId}`, "Pengajuan terkirim ke wali kelas.", async (sb) => {
    const file = fd.get("file");
    if (file instanceof File && file.size > 0 && !LETTER_TYPES.includes(file.type)) throw new Error("Surat harus berupa PDF, JPG, atau PNG");
    const path = await uploadFile(sb, "leave-letters", `${schoolId}/${studentId}`, file);
    return sb.from("student_leave_requests").insert({
      school_id: schoolId, student_id: studentId, kind: str(fd, "kind"),
      starts_on: str(fd, "starts_on"), ends_on: str(fd, "ends_on"), reason: str(fd, "reason"), attachment_path: path,
    });
  });
}

async function cancelLeave(fd: FormData) {
  "use server";
  await requireRole("guardian");
  await run(`/ortu/izin?anak=${str(fd, "student_id")}`, "Pengajuan dibatalkan.", (sb) => sb.rpc("cancel_student_leave", { p_id: str(fd, "id") }));
}

export default async function GuardianLeave({ searchParams }: { searchParams: Promise<{ anak?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireRole("guardian");
  const children = await myChildren(supabase, user.id, schoolId);
  const child = pickChild(children, sp.anak);
  if (!child) return (<><PageHeader title="Izin & Sakit" /><Empty>Akun Anda belum ditautkan ke data murid.</Empty></>);

  const { data: rows } = await supabase.from("student_leave_requests")
    .select("id, kind, starts_on, ends_on, reason, attachment_path, status, review_note, reviewed_at, created_at, requested_by")
    .eq("student_id", child.id).order("created_at", { ascending: false }).limit(50);
  const list = await Promise.all((rows ?? []).map(async (r) => ({ ...r, url: await signedUrl(supabase, "leave-letters", r.attachment_path) })));
  const today = todayJakarta();

  return (
    <>
      <PageHeader title="Izin & Sakit" subtitle={`Ajukan izin untuk ${child.full_name}. Wali kelas akan meninjau dan absen otomatis tercatat.`} />
      <ChildTabs items={children} active={child.id} base="/ortu/izin" />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card title="Pengajuan baru" className="h-fit">
          <form action={submitLeave} className="flex flex-col gap-3">
            <input type="hidden" name="student_id" value={child.id} />
            <Field label="Jenis">
              <Select id="kind" name="kind" defaultValue="sakit"><option value="sakit">Sakit</option><option value="izin">Izin</option></Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dari"><Input id="starts_on" name="starts_on" type="date" required defaultValue={today} /></Field>
              <Field label="Sampai"><Input id="ends_on" name="ends_on" type="date" required defaultValue={today} /></Field>
            </div>
            <Field label="Alasan"><Textarea id="reason" name="reason" required minLength={3} maxLength={2000} placeholder="Contoh: demam sejak semalam, istirahat di rumah." /></Field>
            <Field label="Surat dokter / surat izin" hint="PDF, JPG, atau PNG, maks. 5 MB. Opsional.">
              <Input id="file" name="file" type="file" accept="application/pdf,image/png,image/jpeg" />
            </Field>
            <SubmitButton>Kirim pengajuan</SubmitButton>
          </form>
        </Card>
        <div className="min-w-0">
          <Table head={["Tanggal", "Jenis", "Alasan", "Status", ""]} empty="Belum ada pengajuan.">
            {list.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{tanggal(r.starts_on)}{r.ends_on !== r.starts_on && <> – {tanggal(r.ends_on)}</>}</td>
                <td className="capitalize">{r.kind}</td>
                <td className="max-w-xs">
                  <div className="line-clamp-2">{r.reason}</div>
                  {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-brand underline">Lihat surat</a>}
                  {r.review_note && <div className="mt-1 text-xs text-muted">Catatan wali kelas: {r.review_note}</div>}
                </td>
                <td><StatusBadge status={r.status} />{r.reviewed_at && <div className="mt-1 text-[11px] text-muted">{waktu(r.reviewed_at)}</div>}</td>
                <td>
                  {r.status === "pending" && r.requested_by === user.id && (
                    <form action={cancelLeave}>
                      <input type="hidden" name="id" value={r.id} /><input type="hidden" name="student_id" value={child.id} />
                      <SubmitButton variant="ghost">Batalkan</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </>
  );
}
