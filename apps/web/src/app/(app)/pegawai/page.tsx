import { requireRole, requireModule } from "@/lib/session";
import { optStr, run, str, uploadFile } from "@/lib/actions";
import { tanggal, todayJakarta, waktu } from "@/lib/format";
import { GeoFields } from "@/components/geo-fields";
import { Button, Card, Field, Flash, Input, PageHeader, Select, Stat, StatusBadge, Table, Textarea } from "@/components/ui";

const STAFF = ["teacher", "counselor", "finance", "school_admin"] as const;
const LEAVE_KIND: Record<string, string> = {
  tahunan: "Cuti tahunan", sakit: "Sakit", melahirkan: "Melahirkan", alasan_penting: "Alasan penting", dinas: "Dinas luar",
};

async function checkIn(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole(...STAFF);
  const lat = optStr(fd, "lat"), lng = optStr(fd, "lng");
  await run("/pegawai", "Absen masuk tercatat.", (sb) =>
    sb.rpc("staff_check_in", { p_school: schoolId, p_lat: lat ? Number(lat) : null, p_lng: lng ? Number(lng) : null }));
}

async function checkOut() {
  "use server";
  const { schoolId } = await requireRole(...STAFF);
  await run("/pegawai", "Absen pulang tercatat.", (sb) => sb.rpc("staff_check_out", { p_school: schoolId }));
}

async function requestLeave(fd: FormData) {
  "use server";
  const { schoolId, user } = await requireRole(...STAFF);
  await run("/pegawai", "Pengajuan cuti terkirim ke kepala sekolah.", async (sb) => {
    const path = await uploadFile(sb, "staff-files", `${schoolId}/${user.id}`, fd.get("file"));
    return sb.from("staff_leave_requests").insert({
      school_id: schoolId, user_id: user.id, kind: str(fd, "kind"),
      starts_on: str(fd, "starts_on"), ends_on: str(fd, "ends_on"), reason: str(fd, "reason"),
      substitute_id: optStr(fd, "substitute_id"), attachment_path: path,
    });
  });
}

async function cancelLeave(fd: FormData) {
  "use server";
  await run("/pegawai", "Pengajuan dibatalkan.", (sb) => sb.rpc("cancel_staff_leave", { p_id: str(fd, "id") }));
}

export default async function StaffSelf({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireModule("staff", ...STAFF);
  const today = todayJakarta();
  const [{ data: todayRow }, { data: recent }, { data: balance }, { data: leaves }, { data: colleagues }] = await Promise.all([
    supabase.from("staff_attendance").select("status, check_in_at, check_out_at").eq("school_id", schoolId).eq("user_id", user.id).eq("date", today).maybeSingle(),
    supabase.from("staff_attendance").select("date, status, check_in_at, check_out_at").eq("school_id", schoolId).eq("user_id", user.id)
      .order("date", { ascending: false }).limit(10),
    supabase.rpc("staff_leave_balance", { p_school: schoolId, p_user: user.id }),
    supabase.from("staff_leave_requests").select("id, kind, starts_on, ends_on, status, review_note, created_at")
      .eq("school_id", schoolId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("memberships").select("user_id, profiles(full_name)").eq("school_id", schoolId).eq("role", "teacher").neq("user_id", user.id),
  ]);
  const bal = (balance as { quota: number; used: number; remaining: number }[] | null)?.[0];

  return (
    <>
      <PageHeader title="Absen & Cuti Saya" subtitle={tanggal(today, true)} />
      <Flash searchParams={sp} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card title="Absen hari ini">
          {todayRow ? (
            <div className="text-sm">
              <StatusBadge status={todayRow.status} />
              <div className="mt-2 text-muted">Masuk {waktu(todayRow.check_in_at)} · Pulang {waktu(todayRow.check_out_at)}</div>
            </div>
          ) : <p className="text-sm text-muted">Belum absen.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={checkIn}>
              <Button type="submit" disabled={!!todayRow?.check_in_at}>Absen masuk</Button>
              <GeoFields />
            </form>
            <form action={checkOut}><Button type="submit" variant="secondary" disabled={!todayRow?.check_in_at || !!todayRow?.check_out_at}>Absen pulang</Button></form>
          </div>
        </Card>
        <Stat label="Sisa cuti tahunan" value={bal ? `${bal.remaining} hari` : "–"} hint={bal ? `Terpakai ${bal.used} dari ${bal.quota} hari` : undefined} />
        <Stat label="Kehadiran 10 hari terakhir" value={`${(recent ?? []).filter((r) => r.status === "hadir" || r.status === "terlambat").length} hadir`}
          hint={`${(recent ?? []).filter((r) => r.status === "terlambat").length} kali terlambat`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Pengajuan cuti saya">
            <Table head={["Jenis", "Tanggal", "Status", ""]} empty="Belum ada pengajuan.">
              {(leaves ?? []).map((l) => (
                <tr key={l.id}>
                  <td>{LEAVE_KIND[l.kind]}</td>
                  <td className="whitespace-nowrap">{tanggal(l.starts_on)} – {tanggal(l.ends_on)}</td>
                  <td><StatusBadge status={l.status} />{l.review_note && <div className="mt-1 text-xs text-muted">{l.review_note}</div>}</td>
                  <td className="text-right">{l.status === "pending" && (
                    <form action={cancelLeave}><input type="hidden" name="id" value={l.id} /><button className="text-sm text-muted hover:text-bad">Batalkan</button></form>
                  )}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Riwayat absen">
            <Table head={["Tanggal", "Status", "Masuk", "Pulang"]}>
              {(recent ?? []).map((r) => (
                <tr key={r.date}><td>{tanggal(r.date)}</td><td><StatusBadge status={r.status} /></td><td>{waktu(r.check_in_at)}</td><td>{waktu(r.check_out_at)}</td></tr>
              ))}
            </Table>
          </Card>
        </div>

        <Card title="Ajukan cuti" className="h-fit">
          <form action={requestLeave} className="flex flex-col gap-3">
            <Field label="Jenis cuti">
              <Select id="lv-kind" name="kind">{Object.entries(LEAVE_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mulai"><Input id="lv-start" name="starts_on" type="date" required /></Field>
              <Field label="Sampai"><Input id="lv-end" name="ends_on" type="date" required /></Field>
            </div>
            <Field label="Alasan"><Textarea id="lv-reason" name="reason" required /></Field>
            <Field label="Guru pengganti (opsional)">
              <Select id="lv-sub" name="substitute_id" defaultValue="">
                <option value="">–</option>
                {(colleagues ?? []).map((c: any) => <option key={c.user_id} value={c.user_id}>{c.profiles?.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Lampiran (opsional)" hint="Surat dokter atau dokumen pendukung, PDF/foto maks. 5 MB">
              <Input id="lv-file" name="file" type="file" accept="application/pdf,image/*" />
            </Field>
            <Button type="submit">Kirim pengajuan</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
