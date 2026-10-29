import { requireRole, ROLE_LABEL, type Role } from "@/lib/session";
import { invokeFunction, optStr, run, str } from "@/lib/actions";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const ASSIGNABLE: Role[] = ["teacher", "guardian", "student", "finance", "counselor", "principal", "school_admin"];

async function createAccount(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  const role = str(fd, "role") as Role;
  const studentId = optStr(fd, "student_id");
  await run("/admin/pengguna", "Akun dibuat. Berikan email dan kata sandi awal kepada pengguna.", async (sb) => {
    if ((role === "student" || role === "guardian") && !studentId) throw new Error("Pilih data murid yang terkait");
    await invokeFunction(sb, "admin-users", {
      school_id: schoolId,
      full_name: str(fd, "full_name"),
      email: optStr(fd, "email") ?? undefined,
      phone: optStr(fd, "phone") ?? undefined,
      password: optStr(fd, "password") ?? undefined,
      roles: [role],
      student_id: role === "student" ? studentId : undefined,
      guardian_of: role === "guardian" ? [{ student_id: studentId, relation: str(fd, "relation") || "orang tua" }] : undefined,
    });
  });
}

async function toggleMembership(fd: FormData) {
  "use server";
  const active = str(fd, "active") === "true";
  await run("/admin/pengguna", active ? "Peran diaktifkan." : "Peran dinonaktifkan.", (sb) =>
    sb.from("memberships").update({ is_active: active }).eq("id", str(fd, "id")));
}

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<{ peran?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId, user } = await requireRole("school_admin");
  const filter = (sp.peran ?? "teacher") as Role;
  const [{ data: members }, { data: students }] = await Promise.all([
    supabase.from("memberships").select("id, role, is_active, user_id, profiles(full_name, email, phone)")
      .eq("school_id", schoolId).eq("role", filter).order("created_at", { ascending: false }).limit(500),
    supabase.from("students").select("id, full_name, nis, user_id").eq("school_id", schoolId).eq("status", "aktif").order("full_name"),
  ]);

  return (
    <>
      <PageHeader title="Akun & Peran" subtitle="Satu orang cukup satu akun. Guru yang juga orang tua murid cukup ditambah peran Orang Tua." />
      <Flash searchParams={sp} />
      <Tabs active={filter} items={ASSIGNABLE.map((r) => ({ key: r, label: ROLE_LABEL[r], href: `/admin/pengguna?peran=${r}` }))} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Table head={["Nama", "Kontak", "Status", ""]} empty={`Belum ada akun ${ROLE_LABEL[filter]}.`}>
            {((members ?? []) as any[]).sort((a, b) => (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? "")).map((m) => (
              <tr key={m.id}>
                <td className="font-semibold">{m.profiles?.full_name}</td>
                <td className="text-muted">{m.profiles?.email ?? m.profiles?.phone}</td>
                <td>{m.is_active ? <Badge tone="good">Aktif</Badge> : <Badge>Nonaktif</Badge>}</td>
                <td className="text-right">
                  {m.user_id !== user.id && (
                    <form action={toggleMembership}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="active" value={String(!m.is_active)} />
                      <button className="text-sm font-semibold text-brand">{m.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="Tambah akun / peran" className="h-fit">
          <form action={createAccount} className="flex flex-col gap-3">
            <Field label="Peran">
              <Select id="u-role" name="role" defaultValue={filter}>
                {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Field>
            <Field label="Nama lengkap"><Input id="u-name" name="full_name" required /></Field>
            <Field label="Email" hint="Jika email sudah terdaftar, peran baru ditambahkan ke akun yang sama.">
              <Input id="u-email" name="email" type="email" />
            </Field>
            <Field label="No. HP (opsional)"><Input id="u-phone" name="phone" placeholder="+6281234567890" /></Field>
            <Field label="Kata sandi awal" hint="Minimal 8 karakter. Pengguna bisa menggantinya di menu Profil.">
              <Input id="u-pass" name="password" type="text" minLength={8} autoComplete="off" />
            </Field>
            <Field label="Murid terkait" hint="Wajib untuk peran Murid (akun milik murid) dan Orang Tua (anaknya).">
              <Select id="u-student" name="student_id" defaultValue="">
                <option value="">–</option>
                {(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}{s.nis ? ` (${s.nis})` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Hubungan (untuk orang tua)">
              <Select id="u-rel" name="relation" defaultValue="orang tua">
                {["ayah", "ibu", "wali", "orang tua"].map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <SubmitButton>Simpan</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
