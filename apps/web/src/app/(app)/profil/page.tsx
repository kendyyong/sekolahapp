import { getSession, ROLE_LABEL } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { Badge, Card, Field, Flash, Input, LinkButton, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

async function saveProfile(fd: FormData) {
  "use server";
  const { user } = await getSession();
  await run("/profil", "Profil disimpan.", (sb) =>
    sb.from("profiles").update({ full_name: str(fd, "full_name"), ...(fd.has("nip") ? { nip: optStr(fd, "nip") } : {}) }).eq("id", user.id));
}

async function changePassword(fd: FormData) {
  "use server";
  const pw = str(fd, "password");
  await run("/profil", "Kata sandi diganti.", async (sb) => {
    if (pw.length < 8) throw new Error("Kata sandi minimal 8 karakter");
    if (pw !== str(fd, "password2")) throw new Error("Konfirmasi kata sandi tidak sama");
    return sb.auth.updateUser({ password: pw });
  });
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { profile, user, roles, supabase } = await getSession();
  const [{ data: deletion }, { data: me }] = await Promise.all([
    supabase.from("account_deletion_requests").select("id").eq("user_id", user.id).eq("status", "pending").maybeSingle(),
    supabase.from("profiles").select("nip").eq("id", user.id).single(),
  ]);
  // NIP dicetak di bawah tanda tangan rapor, jadi hanya ditanyakan ke pegawai sekolah.
  const staff = roles.some((r) => r.role !== "student" && r.role !== "guardian");
  return (
    <>
      <PageHeader title="Profil Saya" />
      <Flash searchParams={sp} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Data diri">
          <form action={saveProfile} className="flex flex-col gap-3">
            <Field label="Nama lengkap"><Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} required /></Field>
            <Field label="Email"><Input id="email" value={user.email ?? ""} disabled readOnly /></Field>
            {staff && (
              <Field label="NIP / NIY (opsional)" hint="Dicetak di bawah tanda tangan rapor.">
                <Input id="nip" name="nip" inputMode="numeric" pattern="[0-9 .\-]{8,30}" title="8–30 angka" defaultValue={me?.nip ?? ""} />
              </Field>
            )}
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => <Badge key={r.school_id + r.role} tone="info">{ROLE_LABEL[r.role]} · {r.school_name}</Badge>)}
            </div>
            <SubmitButton className="self-start">Simpan</SubmitButton>
          </form>
        </Card>
        <Card title="Ganti kata sandi">
          <form action={changePassword} className="flex flex-col gap-3">
            <Field label="Kata sandi baru"><Input id="password" name="password" type="password" minLength={8} required /></Field>
            <Field label="Ulangi kata sandi"><Input id="password2" name="password2" type="password" minLength={8} required /></Field>
            <SubmitButton className="self-start">Ganti kata sandi</SubmitButton>
          </form>
        </Card>
        <Card title="Hapus akun">
          <p className="mb-3 text-sm text-muted">
            {deletion
              ? "Permintaan hapus akun Anda sedang diproses. Anda masih bisa membatalkannya."
              : "Minta penghapusan akun dan data pribadi Anda. Catatan pendidikan yang wajib disimpan sekolah tetap ada tanpa terhubung ke akun Anda."}
          </p>
          <LinkButton href="/hapus-akun">{deletion ? "Lihat permintaan" : "Minta hapus akun"}</LinkButton>
        </Card>
      </div>
    </>
  );
}
