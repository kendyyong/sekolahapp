import { requireModule } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { tanggal, waktu } from "@/lib/format";
import { Empty, Flash, PageHeader, Select, StatusBadge, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

async function report(fd: FormData) {
  "use server";
  await run("/pegawai/arahan", "Laporan terkirim ke kepala sekolah.", (sb) =>
    sb.rpc("report_directive", { p_directive: str(fd, "id"), p_status: str(fd, "status"), p_report: optStr(fd, "report") }));
}

export default async function MyDirectives({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireModule("staff", "teacher", "counselor", "finance", "school_admin");
  const { data } = await supabase.from("directive_recipients")
    .select("status, report, updated_at, directives(id, title, body, due_on, created_at, profiles:created_by(full_name))")
    .eq("user_id", user.id).order("updated_at", { ascending: false });

  return (
    <>
      <PageHeader title="Arahan Kepala Sekolah" subtitle="Tugas dan arahan yang ditujukan kepada Anda." />
      <Flash searchParams={sp} />
      {!data?.length ? <Empty>Belum ada arahan.</Empty> : (
        <div className="flex flex-col gap-4">
          {data.map((r: any) => (
            <article key={r.directives.id} className="rounded-lg border border-line bg-sheet p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-ink">{r.directives.title}</h2>
                  <div className="text-xs text-muted">{r.directives.profiles?.full_name} · {waktu(r.directives.created_at)}{r.directives.due_on ? ` · Tenggat ${tanggal(r.directives.due_on)}` : ""}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>
              <p className="mt-3 whitespace-pre-line text-sm">{r.directives.body}</p>
              <form action={report} className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                <input type="hidden" name="id" value={r.directives.id} />
                <Textarea name="report" defaultValue={r.report ?? ""} rows={2} placeholder="Laporan progres" aria-label="Laporan" />
                <div className="flex gap-2">
                  <Select name="status" defaultValue={r.status === "baru" ? "dikerjakan" : r.status} aria-label="Status" className="w-auto">
                    <option value="dikerjakan">Sedang dikerjakan</option>
                    <option value="selesai">Selesai</option>
                  </Select>
                  <SubmitButton>Kirim laporan</SubmitButton>
                </div>
              </form>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
