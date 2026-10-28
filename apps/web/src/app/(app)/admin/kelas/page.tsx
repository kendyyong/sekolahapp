import { requireRole } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { tanggal, todayJakarta } from "@/lib/format";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";

async function createYear(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/kelas", "Tahun ajaran dibuat.", (sb) => sb.from("academic_years").insert({
    school_id: schoolId, name: str(fd, "name"), starts_on: str(fd, "starts_on"), ends_on: str(fd, "ends_on"), is_active: false,
  }));
}

async function activateYear(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/kelas", "Tahun ajaran aktif diganti.", async (sb) => {
    const r = await sb.from("academic_years").update({ is_active: false }).eq("school_id", schoolId).eq("is_active", true);
    if (r.error) return r;
    return sb.from("academic_years").update({ is_active: true }).eq("id", str(fd, "id"));
  });
}

async function createClass(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/kelas", "Kelas dibuat.", (sb) => sb.from("classes").insert({
    school_id: schoolId, academic_year_id: str(fd, "academic_year_id"), name: str(fd, "name"),
    grade_level: num(fd, "grade_level"), homeroom_teacher_id: optStr(fd, "homeroom_teacher_id"),
  }));
}

async function setHomeroom(fd: FormData) {
  "use server";
  await run("/admin/kelas", "Wali kelas diperbarui.", (sb) =>
    sb.from("classes").update({ homeroom_teacher_id: optStr(fd, "homeroom_teacher_id") }).eq("id", str(fd, "id")));
}

async function rotateQr(fd: FormData) {
  "use server";
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  await run("/admin/kelas", `Kode absen baru: ${code}`, (sb) => sb.from("classes").update({ qr_secret: code }).eq("id", str(fd, "id")));
}

export default async function ClassesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireRole("school_admin");
  const [{ data: years }, { data: teachers }] = await Promise.all([
    supabase.from("academic_years").select("id, name, starts_on, ends_on, is_active").eq("school_id", schoolId).order("starts_on", { ascending: false }),
    supabase.from("memberships").select("user_id, profiles(full_name)").eq("school_id", schoolId).eq("role", "teacher").eq("is_active", true),
  ]);
  const activeYear = years?.find((y) => y.is_active);
  const { data: classes } = activeYear
    ? await supabase.from("classes").select("id, name, grade_level, homeroom_teacher_id, qr_secret, enrollments(count)")
        .eq("academic_year_id", activeYear.id).order("grade_level").order("name")
    : { data: [] };
  const teacherOpts = ((teachers ?? []) as any[]).map((t) => ({ id: t.user_id as string, name: t.profiles?.full_name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader title="Kelas & Tahun Ajaran" />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title={activeYear ? `Kelas tahun ajaran ${activeYear.name}` : "Kelas"}>
            {!activeYear ? <p className="text-sm text-muted">Aktifkan tahun ajaran terlebih dahulu.</p> : (
              <Table head={["Kelas", "Tingkat", "Murid", "Wali kelas", "Kode absen", "Rekap absensi"]} empty="Belum ada kelas.">
                {(classes ?? []).map((c: any) => (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.name}</td>
                    <td className="tabular-nums">{c.grade_level}</td>
                    <td className="tabular-nums">{c.enrollments?.[0]?.count ?? 0}</td>
                    <td>
                      <form action={setHomeroom} className="flex gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <select name="homeroom_teacher_id" defaultValue={c.homeroom_teacher_id ?? ""} aria-label={`Wali kelas ${c.name}`}
                          className="rounded-md border border-line bg-sheet px-2 py-1 text-sm">
                          <option value="">–</option>
                          {teacherOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <Button variant="secondary" className="px-2 py-1">Simpan</Button>
                      </form>
                    </td>
                    <td>
                      <form action={rotateQr} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <code className="text-xs">{c.qr_secret}</code>
                        <button className="text-xs font-semibold text-brand">Ganti</button>
                      </form>
                    </td>
                    <td>
                      <a href={`/unduh/absensi-kelas?kelas=${c.id}&bulan=${todayJakarta().slice(0, 7)}`} download
                        className="text-sm font-semibold whitespace-nowrap text-brand">Excel bulan ini</a>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card title="Tahun ajaran">
            <Table head={["Nama", "Periode", "Status", ""]}>
              {(years ?? []).map((y) => (
                <tr key={y.id}>
                  <td className="font-semibold">{y.name}</td>
                  <td>{tanggal(y.starts_on)} – {tanggal(y.ends_on)}</td>
                  <td>{y.is_active ? <Badge tone="good">Aktif</Badge> : <Badge>Tidak aktif</Badge>}</td>
                  <td className="text-right">{!y.is_active && (
                    <form action={activateYear}><input type="hidden" name="id" value={y.id} /><button className="text-sm font-semibold text-brand">Aktifkan</button></form>
                  )}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Kelas baru">
            <form action={createClass} className="flex flex-col gap-3">
              <Field label="Tahun ajaran">
                <Select id="c-year" name="academic_year_id" defaultValue={activeYear?.id}>
                  {(years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nama kelas"><Input id="c-name" name="name" required placeholder="VII-C" /></Field>
                <Field label="Tingkat"><Input id="c-grade" name="grade_level" type="number" min={0} max={13} required defaultValue={7} /></Field>
              </div>
              <Field label="Wali kelas">
                <Select id="c-home" name="homeroom_teacher_id" defaultValue="">
                  <option value="">–</option>
                  {teacherOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Button type="submit">Buat kelas</Button>
            </form>
          </Card>
          <Card title="Tahun ajaran baru">
            <form action={createYear} className="flex flex-col gap-3">
              <Field label="Nama"><Input id="y-name" name="name" required placeholder="2027/2028" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mulai"><Input id="y-start" name="starts_on" type="date" required /></Field>
                <Field label="Selesai"><Input id="y-end" name="ends_on" type="date" required /></Field>
              </div>
              <Button type="submit" variant="secondary">Simpan</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
