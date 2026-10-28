import { getSession, ROLE_LABEL } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { Badge, Button, Card, Field, Flash, Input, PageHeader } from "@/components/ui";

async function saveProfile(fd: FormData) {
  "use server";
  const { user } = await getSession();
  await run("/profil", "Profil disimpan.", (sb) =>
    sb.from("profiles").update({ full_name: str(fd, "full_name") }).eq("id", user.id));
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
  const { profile, user, roles } = await getSession();
  return (
    <>
      <PageHeader title="Profil Saya" />
      <Flash searchParams={sp} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Data diri">
          <form action={saveProfile} className="flex flex-col gap-3">
            <Field label="Nama lengkap"><Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} required /></Field>
            <Field label="Email"><Input id="email" value={user.email ?? ""} disabled readOnly /></Field>
            <div className="flex flex-wrap gap-1.5">
              {roles.map((r) => <Badge key={r.school_id + r.role} tone="info">{ROLE_LABEL[r.role]} · {r.school_name}</Badge>)}
            </div>
            <Button type="submit" className="self-start">Simpan</Button>
          </form>
        </Card>
        <Card title="Ganti kata sandi">
          <form action={changePassword} className="flex flex-col gap-3">
            <Field label="Kata sandi baru"><Input id="password" name="password" type="password" minLength={8} required /></Field>
            <Field label="Ulangi kata sandi"><Input id="password2" name="password2" type="password" minLength={8} required /></Field>
            <Button type="submit" className="self-start">Ganti kata sandi</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
