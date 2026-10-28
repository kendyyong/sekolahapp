import { requireRole } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { Badge, Button, Card, DownloadLink, Field, Flash, Input, PageHeader, Select, Table, Textarea } from "@/components/ui";

async function addStudent(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/murid", "Murid ditambahkan.", async (sb) => {
    const { data, error } = await sb.from("students").insert({
      school_id: schoolId, nis: optStr(fd, "nis"), nisn: optStr(fd, "nisn"), full_name: str(fd, "full_name"),
      gender: optStr(fd, "gender"), birth_date: optStr(fd, "birth_date"),
    }).select("id").single();
    if (error) return { error };
    const classId = optStr(fd, "class_id");
    if (classId) return sb.from("enrollments").insert({ school_id: schoolId, class_id: classId, student_id: data.id });
  });
}

/** Impor massal: satu murid per baris → NIS;Nama;L/P;Kelas */
async function importStudents(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/murid", "Impor selesai.", async (sb) => {
    const { data: classes } = await sb.from("classes").select("id, name, academic_years!inner(is_active)")
      .eq("school_id", schoolId).eq("academic_years.is_active", true);
    const classByName = new Map((classes ?? []).map((c) => [c.name.toLowerCase(), c.id]));
    const lines = str(fd, "rows").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1000) throw new Error("Maksimal 1.000 baris per impor");
    let n = 0;
    for (const [i, line] of lines.entries()) {
      const [nis, name, gender, kelas] = line.split(/[;,\t]/).map((x) => x?.trim());
      if (!name) throw new Error(`Baris ${i + 1}: nama kosong`);
      const classId = kelas ? classByName.get(kelas.toLowerCase()) : undefined;
      if (kelas && !classId) throw new Error(`Baris ${i + 1}: kelas "${kelas}" tidak ditemukan (${n} murid sudah masuk)`);
      const { data, error } = await sb.from("students").upsert({
        school_id: schoolId, nis: nis || null, full_name: name, gender: gender?.toUpperCase() === "P" ? "P" : gender ? "L" : null,
      }, { onConflict: "school_id,nis" }).select("id").single();
      if (error) throw new Error(`Baris ${i + 1}: ${error.message}`);
      if (classId) {
        const r = await sb.from("enrollments").upsert({ school_id: schoolId, class_id: classId, student_id: data.id }, { onConflict: "class_id,student_id" });
        if (r.error) throw new Error(`Baris ${i + 1}: ${r.error.message}`);
      }
      n++;
    }
  });
}

async function moveClass(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  const studentId = str(fd, "student_id");
  await run("/admin/murid", "Kelas murid diperbarui.", async (sb) => {
    const { data: current } = await sb.from("enrollments").select("id, classes!inner(academic_years!inner(is_active))")
      .eq("student_id", studentId).eq("classes.academic_years.is_active", true);
    if (current?.length) {
      const r = await sb.from("enrollments").delete().in("id", current.map((c) => c.id));
      if (r.error) return r;
    }
    const classId = optStr(fd, "class_id");
    if (classId) return sb.from("enrollments").insert({ school_id: schoolId, class_id: classId, student_id: studentId });
  });
}

async function setStatus(fd: FormData) {
  "use server";
  await run("/admin/murid", "Status murid diperbarui.", (sb) => sb.from("students").update({ status: str(fd, "status") }).eq("id", str(fd, "id")));
}

export default async function StudentsAdmin({ searchParams }: { searchParams: Promise<{ kelas?: string; q?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireRole("school_admin");
  const { data: classes } = await supabase.from("classes").select("id, name, academic_years!inner(is_active)")
    .eq("school_id", schoolId).eq("academic_years.is_active", true).order("name");
  let q = supabase.from("students")
    .select("id, nis, full_name, gender, status, user_id, enrollments(class_id, classes!inner(name, academic_years!inner(is_active))), guardian_links(guardian_id)")
    .eq("school_id", schoolId).order("full_name").limit(300);
  if (sp.q) q = q.ilike("full_name", `%${sp.q}%`);
  const { data: students } = await q;
  const rows = ((students ?? []) as any[]).map((s) => {
    const enr = (s.enrollments ?? []).find((e: any) => e.classes?.academic_years?.is_active);
    return { ...s, class_id: enr?.class_id as string | undefined, class_name: enr?.classes?.name as string | undefined };
  }).filter((s) => !sp.kelas || s.class_id === sp.kelas);

  return (
    <>
      <PageHeader title="Data Murid" subtitle={`${rows.length} murid ditampilkan`} actions={<DownloadLink href="/unduh/murid">Unduh Excel</DownloadLink>} />
      <Flash searchParams={sp} />
      <form className="mb-5 flex flex-wrap items-end gap-2">
        <Field label="Cari nama"><Input id="q" name="q" defaultValue={sp.q ?? ""} /></Field>
        <Field label="Kelas">
          <Select id="kelas" name="kelas" defaultValue={sp.kelas ?? ""}>
            <option value="">Semua</option>
            {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Button variant="secondary">Tampilkan</Button>
      </form>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Table head={["NIS", "Nama", "Kelas", "Akun", "Status"]} empty="Belum ada murid.">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="tabular-nums">{s.nis ?? "–"}</td>
                <td className="font-semibold">{s.full_name} <span className="text-xs font-normal text-muted">{s.gender}</span></td>
                <td>
                  <form action={moveClass} className="flex gap-1">
                    <input type="hidden" name="student_id" value={s.id} />
                    <select name="class_id" defaultValue={s.class_id ?? ""} aria-label={`Kelas ${s.full_name}`} className="rounded border border-line bg-sheet px-1 py-0.5 text-sm">
                      <option value="">–</option>
                      {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button className="text-xs font-semibold text-brand">Pindah</button>
                  </form>
                </td>
                <td className="flex flex-wrap gap-1">
                  {s.user_id ? <Badge tone="good">Murid</Badge> : <Badge>Belum ada</Badge>}
                  {(s.guardian_links ?? []).length > 0 && <Badge tone="info">Ortu {(s.guardian_links ?? []).length}</Badge>}
                </td>
                <td>
                  <form action={setStatus} className="flex gap-1">
                    <input type="hidden" name="id" value={s.id} />
                    <select name="status" defaultValue={s.status} aria-label="Status" className="rounded border border-line bg-sheet px-1 py-0.5 text-sm">
                      {["aktif", "lulus", "pindah", "keluar"].map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                    <button className="text-xs font-semibold text-brand">Simpan</button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Tambah murid">
            <form action={addStudent} className="flex flex-col gap-3">
              <Field label="Nama lengkap"><Input id="st-name" name="full_name" required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="NIS"><Input id="st-nis" name="nis" /></Field>
                <Field label="NISN"><Input id="st-nisn" name="nisn" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Jenis kelamin"><Select id="st-g" name="gender"><option value="L">Laki-laki</option><option value="P">Perempuan</option></Select></Field>
                <Field label="Tanggal lahir"><Input id="st-bd" name="birth_date" type="date" /></Field>
              </div>
              <Field label="Kelas"><Select id="st-class" name="class_id" defaultValue=""><option value="">–</option>{(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Button type="submit">Simpan</Button>
            </form>
          </Card>
          <Card title="Impor dari Excel">
            <form action={importStudents} className="flex flex-col gap-3">
              <Field label="Tempel data" hint="Satu murid per baris: NIS;Nama;L/P;Kelas. Bisa disalin langsung dari kolom Excel.">
                <Textarea id="st-rows" name="rows" rows={6} required placeholder={"2605;Eka Putri;P;VII-A\n2606;Fajar Nugroho;L;VII-B"} className="font-mono text-xs" />
              </Field>
              <Button type="submit" variant="secondary">Impor</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
