import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CalendarCheck, ScrollText, ShieldCheck, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_ROLE_COOKIE, type RoleOption, type SchoolBrand } from "@/lib/session";
import { Field, Flash, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SchoolMark } from "@/components/school-mark";
import { brandScope } from "@/lib/brand";

const FROM = /^\/(login|masuk\/[a-z0-9-]{3,60})$/;

async function signIn(fd: FormData) {
  "use server";
  const sb = await createClient();
  const from = FROM.test(String(fd.get("from"))) ? String(fd.get("from")) : "/login";
  const { error } = await sb.auth.signInWithPassword({
    email: String(fd.get("email") ?? "").trim(),
    password: String(fd.get("password") ?? ""),
  });
  const next = String(fd.get("next") ?? "");
  if (error) redirect(from + "?err=" + encodeURIComponent("Email atau kata sandi salah.") + (next ? "&next=" + encodeURIComponent(next) : ""));
  // Masuk dari halaman sekolah: langsung pakai peran di sekolah itu bila ada.
  const slug = from.startsWith("/masuk/") ? from.slice(7) : null;
  if (slug) {
    const [{ data: school }, { data: roles }] = await Promise.all([
      sb.from("schools").select("id").eq("slug", slug).maybeSingle(),
      sb.rpc("my_roles"),
    ]);
    const role = ((roles ?? []) as RoleOption[]).find((r) => r.school_id === school?.id);
    if (role) {
      (await cookies()).set(ACTIVE_ROLE_COOKIE, `${role.school_id}|${role.role}`,
        { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
  }
  // Hanya tujuan relatif di situs ini.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/mulai");
}

const HIGHLIGHTS = [
  { icon: CalendarCheck, text: "Absensi murid & guru, izin, dan kios kartu pelajar" },
  { icon: ScrollText, text: "E-rapor Kurikulum Merdeka, siap cetak" },
  { icon: Wallet, text: "SPP & pembayaran online langsung ke rekening sekolah" },
  { icon: ShieldCheck, text: "Data tiap sekolah terpisah dan terenkripsi" },
];

/** Halaman masuk: umum (/login) atau dengan logo & warna sekolah (/masuk/<slug>). */
export function LoginScreen({ sp, school, from }: {
  sp: { err?: string; ok?: string; next?: string }; school?: SchoolBrand | null; from: string;
}) {
  const scope = brandScope(school?.brand_color);
  return (
    <main className={`grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] ${scope.className ?? ""}`} style={scope.style}>
      <section className="relative hidden overflow-hidden bg-side px-12 py-12 text-side-ink lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-brand-solid/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-20 size-[22rem] rounded-full bg-brand-solid/15 blur-3xl" />
        {school ? (
          <div className="relative flex flex-1 flex-col justify-center">
            <SchoolMark name={school.name} logo={school.logo_url} className="size-20 rounded-2xl text-2xl" />
            <h1 className="mt-6 text-3xl font-bold leading-tight text-white text-balance">{school.app_name ?? school.name}</h1>
            {school.app_name && <p className="mt-1 text-side-muted">{school.name}</p>}
            {school.motto && <p className="mt-6 max-w-md border-l-2 border-brand-solid pl-4 text-lg italic text-side-ink/90 text-pretty">“{school.motto}”</p>}
          </div>
        ) : (
          <div className="relative flex flex-1 flex-col justify-center">
            <div className="text-2xl font-extrabold tracking-tight text-white">Sekolah<span className="text-accent">App</span></div>
            <h1 className="mt-8 max-w-md text-3xl font-bold leading-tight text-white text-balance">Satu aplikasi untuk seluruh warga sekolah.</h1>
            <ul className="mt-8 flex max-w-md flex-col gap-4">
              {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3 text-side-ink/90">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-side-raised ring-1 ring-side-line"><Icon className="size-4" /></span>
                  <span className="pt-1 text-sm">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="relative text-xs text-side-muted">© {new Date().getFullYear()} SekolahApp · <Link href="/privasi" className="hover:text-side-ink">Privasi</Link> · <Link href="/syarat" className="hover:text-side-ink">Syarat</Link></p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            {school ? (
              <div className="flex items-center gap-3 lg:hidden">
                <SchoolMark name={school.name} logo={school.logo_url} className="size-12" />
                <div className="min-w-0">
                  <div className="truncate font-bold text-ink">{school.app_name ?? school.name}</div>
                  {school.motto && <div className="truncate text-xs text-muted">{school.motto}</div>}
                </div>
              </div>
            ) : (
              <div className="text-2xl font-extrabold tracking-tight text-ink lg:hidden">Sekolah<span className="text-accent">App</span></div>
            )}
            <h2 className="mt-6 text-2xl font-bold tracking-tight text-ink lg:mt-0">Masuk</h2>
            <p className="mt-1 text-sm text-muted">
              {school ? `Gunakan akun yang diberikan ${school.name}.` : "Masuk dengan akun yang diberikan sekolah Anda."}
            </p>
          </div>
          <Flash searchParams={sp} />
          <form action={signIn} className="flex flex-col gap-4">
            <input type="hidden" name="from" value={from} />
            {sp.next && <input type="hidden" name="next" value={sp.next} />}
            <Field label="Email">
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder="nama@sekolah.sch.id" />
            </Field>
            <Field label="Kata sandi">
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </Field>
            <div className="-mt-1 text-right text-sm"><Link href="/lupa-sandi" className="font-semibold text-brand">Lupa kata sandi?</Link></div>
            <SubmitButton className="py-2.5" pendingLabel="Masuk…">Masuk</SubmitButton>
          </form>
          {!school && (
            <p className="mt-8 border-t border-line pt-6 text-center text-sm text-muted">
              Sekolah belum terdaftar? <Link href="/daftar" className="font-semibold text-brand">Daftar gratis</Link>
            </p>
          )}
          {school?.app_name && <p className="mt-8 text-center text-xs text-muted">Didukung SekolahApp</p>}
        </div>
      </section>
    </main>
  );
}
