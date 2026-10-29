import Link from "next/link";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ExternalLink, Lock } from "lucide-react";
import { requireRole } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { contrastWithWhite } from "@/lib/brand";
import { Badge, Button, Card, Field, Flash, Input, LinkButton, PageHeader, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { BrandFields } from "@/components/brand-fields";
import { Letterhead } from "@/components/letterhead";
import { SchoolMark } from "@/components/school-mark";

const BUCKET = "school-assets";
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const PAGE = "/admin/identitas";

/** Nama, logo, dan warna tampil di kerangka aplikasi, jadi semua layout perlu dirender ulang. */
async function refreshShell<T>(res: PromiseLike<T>) {
  const r = await res;
  revalidatePath("/", "layout");
  return r;
}

/** Path berkas di bucket dari URL publiknya, bila memang berkas sekolah ini. */
function assetPath(url: string | null, schoolId: string) {
  const path = url?.split(`/object/public/${BUCKET}/`)[1];
  return path?.startsWith(`${schoolId}/`) ? decodeURIComponent(path) : null;
}

async function saveProfile(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run(PAGE, "Profil sekolah disimpan.", async (sb) => {
    const name = str(fd, "name"), npsn = optStr(fd, "npsn"), website = optStr(fd, "website");
    if (name.length < 3) throw new Error("Nama sekolah minimal 3 huruf");
    if (npsn && !/^\d{8}$/.test(npsn)) throw new Error("NPSN harus 8 digit angka");
    return refreshShell(sb.from("schools").update({
      name, npsn, address: optStr(fd, "address"), phone: optStr(fd, "phone"), email: optStr(fd, "email")?.toLowerCase() ?? null,
      website: website?.replace(/^https?:\/\//i, "").replace(/\/$/, "") ?? null,
      motto: optStr(fd, "motto"), vision: optStr(fd, "vision"), mission: optStr(fd, "mission"),
    }).eq("id", schoolId));
  });
}

async function saveLogo(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run(PAGE, "Logo sekolah diperbarui.", async (sb) => {
    const file = fd.get("logo");
    if (!(file instanceof File) || !file.size) throw new Error("Pilih berkas logo terlebih dahulu");
    const ext = LOGO_TYPES[file.type];
    if (!ext) throw new Error("Logo harus berupa PNG, JPG, atau WEBP");
    if (file.size > 2 * 1024 * 1024) throw new Error("Ukuran logo maksimal 2 MB");
    const { data: s } = await sb.from("schools").select("logo_url").eq("id", schoolId).single();
    const path = `${schoolId}/logo-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) throw new Error(`Gagal mengunggah logo: ${error.message}`);
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const res = await refreshShell(sb.from("schools").update({ logo_url: url }).eq("id", schoolId));
    const old = assetPath(s?.logo_url ?? null, schoolId);
    if (!res.error && old) await sb.storage.from(BUCKET).remove([old]);
    return res;
  });
}

async function removeLogo() {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run(PAGE, "Logo dihapus.", async (sb) => {
    const { data: s } = await sb.from("schools").select("logo_url").eq("id", schoolId).single();
    const res = await refreshShell(sb.from("schools").update({ logo_url: null }).eq("id", schoolId));
    const old = assetPath(s?.logo_url ?? null, schoolId);
    if (!res.error && old) await sb.storage.from(BUCKET).remove([old]);
    return res;
  });
}

async function saveBrand(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run(PAGE, "Warna dan nama aplikasi disimpan.", async (sb) => {
    const color = optStr(fd, "brand_color")?.toLowerCase() ?? null;
    if (color && !/^#[0-9a-f]{6}$/.test(color)) throw new Error("Format warna: # diikuti 6 digit heksadesimal");
    if (color && contrastWithWhite(color) < 4.5) throw new Error("Warna terlalu terang untuk teks putih. Pilih warna yang lebih gelap.");
    return refreshShell(sb.from("schools").update({ brand_color: color, app_name: optStr(fd, "app_name") }).eq("id", schoolId));
  });
}

export default async function SchoolIdentity({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId, modules } = await requireRole("school_admin");
  const { data: s } = await supabase.from("schools")
    .select("name, slug, npsn, address, phone, email, website, logo_url, motto, vision, mission, brand_color, app_name, foundations(name)")
    .eq("id", schoolId).single();
  if (!s) return null;
  const whitelabel = modules.includes("whitelabel");
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const loginUrl = `${origin}/masuk/${s.slug}`;
  const foundation = (s.foundations as unknown as { name: string } | null)?.name ?? null;

  return (
    <>
      <PageHeader title="Identitas & Merek" subtitle="Logo, moto, dan kop sekolah tampil di aplikasi, halaman masuk, rapor, dan kartu pelajar." />
      <Flash searchParams={sp} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Logo sekolah">
            <div className="flex flex-wrap items-center gap-5">
              <SchoolMark name={s.name} logo={s.logo_url} className="size-24 rounded-xl border border-line text-2xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <form action={saveLogo} className="flex flex-wrap items-end gap-3">
                  <Field label="Unggah logo baru" hint="PNG, JPG, atau WEBP, maks. 2 MB. Gunakan gambar persegi berlatar transparan atau putih." className="min-w-0 flex-1">
                    <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required
                      className="file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-sm file:font-semibold file:text-brand" />
                  </Field>
                  <SubmitButton>Unggah</SubmitButton>
                </form>
                {s.logo_url && (
                  <form action={removeLogo}><Button variant="ghost" className="-ml-3 text-bad hover:bg-bad-soft">Hapus logo</Button></form>
                )}
              </div>
            </div>
          </Card>

          <Card title="Profil sekolah">
            <form action={saveProfile} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                <Field label="Nama sekolah"><Input name="name" required minLength={3} defaultValue={s.name} /></Field>
                <Field label="NPSN"><Input name="npsn" inputMode="numeric" pattern="[0-9]{8}" title="8 digit angka" defaultValue={s.npsn ?? ""} /></Field>
              </div>
              <Field label="Moto / slogan" hint="Kalimat singkat, tampil di menu aplikasi dan halaman masuk.">
                <Input name="motto" maxLength={160} defaultValue={s.motto ?? ""} placeholder="Cerdas, Santun, Berkarakter" />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Visi"><Textarea name="vision" rows={4} maxLength={1000} defaultValue={s.vision ?? ""} /></Field>
                <Field label="Misi" hint="Satu misi per baris."><Textarea name="mission" rows={4} maxLength={3000} defaultValue={s.mission ?? ""} /></Field>
              </div>
              <div className="border-t border-line pt-4 text-xs font-semibold uppercase tracking-wider text-muted">Kontak & kop surat</div>
              <Field label="Alamat"><Input name="address" defaultValue={s.address ?? ""} placeholder="Jl. Pendidikan No. 1, Kota" /></Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Telepon"><Input name="phone" type="tel" defaultValue={s.phone ?? ""} /></Field>
                <Field label="Email"><Input name="email" type="email" defaultValue={s.email ?? ""} placeholder="info@sekolah.sch.id" /></Field>
                <Field label="Situs web"><Input name="website" defaultValue={s.website ?? ""} placeholder="sekolah.sch.id" /></Field>
              </div>
              <SubmitButton className="self-start">Simpan profil</SubmitButton>
            </form>
          </Card>

          <Card title="Warna & nama aplikasi" actions={whitelabel ? <Badge tone="info">Enterprise</Badge> : <Badge><Lock className="mr-1 size-3" />Enterprise</Badge>}>
            {!whitelabel && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/20 bg-brand-soft px-4 py-3 text-sm">
                <span className="text-ink">Tampilkan aplikasi dengan warna dan nama sekolah sendiri di paket Enterprise.</span>
                <LinkButton href="/admin/langganan" variant="primary">Lihat paket</LinkButton>
              </div>
            )}
            <form action={saveBrand} className="flex flex-col gap-4">
              <fieldset disabled={!whitelabel} className="contents">
                <BrandFields color={s.brand_color} appName={s.app_name} school={s.name} logo={s.logo_url} motto={s.motto} disabled={!whitelabel} />
              </fieldset>
              {whitelabel && <SubmitButton className="self-start">Simpan warna & nama</SubmitButton>}
            </form>
          </Card>
        </div>

        <div className="flex flex-col gap-6 xl:sticky xl:top-20 xl:self-start">
          <Card title="Halaman masuk sekolah">
            <p className="text-sm text-muted text-pretty">Bagikan tautan ini ke guru, orang tua, dan murid. Halaman masuk akan menampilkan logo, moto, dan warna sekolah.</p>
            <Input readOnly value={loginUrl} aria-label="Tautan halaman masuk" className="mt-3 font-mono text-xs" />
            <Link href={`/masuk/${s.slug}`} target="_blank" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
              Buka halaman masuk <ExternalLink className="size-3.5" />
            </Link>
          </Card>
          <Card title="Pratinjau kop rapor & surat">
            <div className="rounded-lg border border-line bg-white p-4 text-black [--color-muted:#444] [--color-ink:#000]">
              <Letterhead school={{ ...s, foundation }} title="LAPORAN HASIL BELAJAR" compact />
            </div>
            <p className="mt-3 text-xs text-muted">Kop ini dipakai di rapor dan kartu pelajar. Lengkapi alamat dan kontak di profil sekolah.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
