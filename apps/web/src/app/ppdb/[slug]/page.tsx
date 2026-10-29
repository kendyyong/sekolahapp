import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, FileText, Mail, MapPin, Phone, Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadPpdb } from "@/lib/ppdb-server";
import { gradeLabel, type PublicPeriod } from "@/lib/ppdb";
import { rupiah, tanggal, todayJakarta } from "@/lib/format";
import { brandScope } from "@/lib/brand";
import { Badge, LinkButton } from "@/components/ui";
import { SchoolMark } from "@/components/school-mark";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await loadPpdb((await params).slug);
  return data ? { title: { absolute: `PPDB · ${data.school.name}` }, description: `Penerimaan murid baru ${data.school.name}` } : {};
}

const STEPS = [
  ["Buat akun", "Daftar dengan email orang tua. Satu akun bisa mendaftarkan beberapa anak."],
  ["Isi formulir & unggah berkas", "Data calon murid, data orang tua, dan berkas persyaratan dalam bentuk foto atau PDF."],
  ["Verifikasi panitia", "Panitia memeriksa berkas dan pembayaran biaya pendaftaran."],
  ["Pengumuman & daftar ulang", "Hasil seleksi tampil di akun Anda. Yang diterima langsung terdaftar sebagai murid."],
];

function periodState(p: PublicPeriod) {
  if (p.is_open) return { label: "Dibuka", tone: "good" as const };
  if (p.opens_on > todayJakarta()) return { label: `Dibuka ${tanggal(p.opens_on)}`, tone: "info" as const };
  return { label: p.announced ? "Hasil sudah diumumkan" : "Ditutup", tone: "neutral" as const };
}

export default async function PpdbLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPpdb(slug);
  if (!data) notFound();
  const { school, periods } = data;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const start = user ? `/ppdb/${school.slug}/formulir` : `/ppdb/${school.slug}/akun`;
  const anyOpen = periods.some((p) => p.is_open);
  const year = periods.find((p) => p.is_open)?.school_year ?? periods.at(-1)?.school_year;
  const scope = brandScope(school.brand_color);

  return (
    <main className={`min-h-screen bg-paper ${scope.className ?? ""}`} style={scope.style}>
      <header className="border-b border-line bg-sheet">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href={`/ppdb/${school.slug}`} className="flex min-w-0 items-center gap-2.5">
            <SchoolMark name={school.name} logo={school.logo_url} className="size-9" />
            <span className="truncate font-bold text-ink">{school.name}</span>
          </Link>
          <LinkButton href={user ? `/ppdb/${school.slug}/formulir` : `/masuk/${school.slug}?next=/ppdb/${school.slug}/formulir`} variant="ghost">
            {user ? "Pendaftaran saya" : "Masuk"}
          </LinkButton>
        </div>
      </header>

      <section className="relative overflow-hidden bg-side text-side-ink">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand-solid/30 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-4 py-12 sm:py-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-side-muted">Penerimaan Peserta Didik Baru{year ? ` · ${year}` : ""}</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-bold leading-tight text-white text-balance sm:text-4xl">PPDB {school.name}</h1>
          {school.motto && <p className="mt-4 max-w-xl border-l-2 border-brand-solid pl-4 italic text-side-ink/90">“{school.motto}”</p>}
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-side-ink/85">
            {school.address && <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden className="size-4" />{school.address}</span>}
            {school.phone && <span className="inline-flex items-center gap-1.5"><Phone aria-hidden className="size-4" />{school.phone}</span>}
            {school.email && <span className="inline-flex items-center gap-1.5"><Mail aria-hidden className="size-4" />{school.email}</span>}
          </div>
          {anyOpen && (
            <div className="mt-8">
              <LinkButton href={start} variant="primary" className="px-5 py-2.5 text-base">Daftar sekarang</LinkButton>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-10">
        <h2 className="text-lg font-bold text-ink">Jadwal pendaftaran</h2>
        {periods.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line bg-sheet px-4 py-6 text-center text-sm text-muted">
            Belum ada gelombang pendaftaran yang dibuka. Silakan kembali lagi nanti atau hubungi sekolah.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {periods.map((p) => {
              const st = periodState(p);
              return (
                <article key={p.id} className="flex flex-col rounded-xl border border-line bg-sheet p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-ink">{p.title}</h3>
                      <p className="text-sm text-muted">{gradeLabel(p.grade_level)} · Tahun ajaran {p.school_year}</p>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div className="flex items-center gap-2"><CalendarDays aria-hidden className="size-4 text-muted" /><dt className="sr-only">Tanggal</dt><dd>{tanggal(p.opens_on)} – {tanggal(p.closes_on)}</dd></div>
                    {p.quota && <div className="flex items-center gap-2"><Users aria-hidden className="size-4 text-muted" /><dt className="sr-only">Kuota</dt><dd>Kuota {p.quota} murid</dd></div>}
                    <div className="flex items-center gap-2"><Wallet aria-hidden className="size-4 text-muted" /><dt className="sr-only">Biaya</dt><dd>Biaya pendaftaran {p.fee_amount ? rupiah(p.fee_amount) : "gratis"}</dd></div>
                  </dl>
                  {p.requirements && <p className="mt-4 whitespace-pre-line text-sm text-ink/90">{p.requirements}</p>}
                  {p.documents.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted">Berkas yang disiapkan</p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {p.documents.map((d) => (
                          <li key={d} className="inline-flex items-center gap-1 rounded-md bg-paper px-2 py-1 text-xs text-ink ring-1 ring-line">
                            <FileText aria-hidden className="size-3.5 text-muted" />{d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {p.is_open && <LinkButton href={start} variant="primary" className="mt-5 self-start">Daftar di gelombang ini</LinkButton>}
                </article>
              );
            })}
          </div>
        )}

        <h2 className="mt-12 text-lg font-bold text-ink">Alur pendaftaran</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="rounded-xl border border-line bg-sheet p-4">
              <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span>
              <p className="mt-3 font-semibold text-ink">{title}</p>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>

        <p className="mt-12 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <CheckCircle2 aria-hidden className="size-3.5" /> Data pendaftar hanya dapat dilihat panitia {school.name}. Didukung SekolahApp.
        </p>
      </div>
    </main>
  );
}
