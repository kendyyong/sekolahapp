import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, MessageSquareWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadPpdb } from "@/lib/ppdb-server";
import { run, str } from "@/lib/actions";
import { gradeLabel, PPDB_STATUS, PPDB_TONE, type AdmissionStatus } from "@/lib/ppdb";
import { tanggal } from "@/lib/format";
import { Badge, Card, Field, Flash, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PpdbShell } from "@/components/ppdb-shell";

export const metadata: Metadata = { title: "Pendaftaran saya" };

async function startApplication(fd: FormData) {
  "use server";
  const slug = str(fd, "slug");
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/masuk/${slug}?next=/ppdb/${slug}/formulir`);
  let id = "";
  await run(`/ppdb/${slug}/formulir`, "Formulir dibuat. Lengkapi data dan unggah berkas, lalu kirim.", async (sb) => {
    const { data, error } = await sb.from("admission_applications").insert({
      school_id: str(fd, "school_id"), period_id: str(fd, "period_id"), full_name: str(fd, "full_name"),
      parent_name: (user.user_metadata?.full_name as string | undefined) || null,
    }).select("id").single();
    if (error) return { error };
    id = data.id;
  }, () => `/ppdb/${slug}/formulir/${id}`);
}

export default async function MyApplications({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const data = await loadPpdb(slug);
  if (!data) notFound();
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/masuk/${data.school.slug}?next=/ppdb/${data.school.slug}/formulir`);
  const { school, periods } = data;
  const open = periods.filter((p) => p.is_open);
  const { data: apps } = await sb.from("admission_applications")
    .select("id, number, full_name, status, staff_note, created_at, admission_periods(title, school_year, grade_level)")
    .eq("school_id", school.id).eq("applicant_id", user.id).order("created_at");
  const rows = (apps ?? []) as unknown as {
    id: string; number: string | null; full_name: string; status: AdmissionStatus; staff_note: string | null; created_at: string;
    admission_periods: { title: string; school_year: string; grade_level: number };
  }[];

  return (
    <PpdbShell school={school} email={user.email ?? ""}>
      <h1 className="text-2xl font-bold tracking-tight text-ink">Pendaftaran saya</h1>
      <p className="mt-1 text-sm text-muted">Pantau status pendaftaran setiap calon murid di sini.</p>
      <div className="mt-5"><Flash searchParams={sp} /></div>

      {rows.length > 0 && (
        <ul className="mb-8 flex flex-col gap-3">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/ppdb/${school.slug}/formulir/${a.id}`}
                className="flex items-center gap-4 rounded-xl border border-line bg-sheet p-4 shadow-card transition hover:border-brand/40">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{a.full_name}</span>
                    <Badge tone={PPDB_TONE[a.status]}>{PPDB_STATUS[a.status]}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">
                    {a.admission_periods.title} · {gradeLabel(a.admission_periods.grade_level)} {a.admission_periods.school_year}
                    {a.number ? ` · ${a.number}` : ` · dibuat ${tanggal(a.created_at)}`}
                  </p>
                  {a.status === "draft" && a.staff_note && (
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-warn">
                      <MessageSquareWarning aria-hidden className="mt-0.5 size-4 shrink-0" />Perlu diperbaiki: {a.staff_note}
                    </p>
                  )}
                </div>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {open.length > 0 ? (
        <Card title={rows.length ? "Daftarkan calon murid lain" : "Daftarkan calon murid"}>
          <form action={startApplication} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <input type="hidden" name="slug" value={school.slug} />
            <input type="hidden" name="school_id" value={school.id} />
            <Field label="Gelombang">
              <Select id="period_id" name="period_id" required defaultValue={open[0].id}>
                {open.map((p) => <option key={p.id} value={p.id}>{p.title} · {gradeLabel(p.grade_level)} {p.school_year}</option>)}
              </Select>
            </Field>
            <Field label="Nama lengkap calon murid"><Input id="full_name" name="full_name" required minLength={3} maxLength={120} /></Field>
            <SubmitButton pendingLabel="Membuat…">Mulai isi formulir</SubmitButton>
          </form>
        </Card>
      ) : (
        <p className="rounded-lg border border-line bg-sheet px-4 py-6 text-center text-sm text-muted">
          Saat ini tidak ada gelombang pendaftaran yang dibuka. <Link href={`/ppdb/${school.slug}`} className="font-semibold text-brand">Lihat jadwal PPDB</Link>
        </p>
      )}
    </PpdbShell>
  );
}
