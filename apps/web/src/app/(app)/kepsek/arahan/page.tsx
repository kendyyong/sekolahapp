import { requireRole, ROLE_LABEL, type Role, requireModule } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { tanggal, waktu } from "@/lib/format";
import { Card, Empty, Field, Flash, Input, PageHeader, StatusBadge, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

async function createDirective(fd: FormData) {
  "use server";
  const { schoolId, user } = await requireRole("principal");
  const recipients = fd.getAll("recipients").map(String);
  await run("/kepsek/arahan", `Arahan dikirim ke ${recipients.length} orang.`, async (sb) => {
    if (!recipients.length) throw new Error("Pilih minimal satu penerima");
    const { data, error } = await sb.from("directives").insert({
      school_id: schoolId, title: str(fd, "title"), body: str(fd, "body"), due_on: optStr(fd, "due_on"), created_by: user.id,
    }).select("id").single();
    if (error) return { error };
    return sb.from("directive_recipients").insert(recipients.map((u) => ({ directive_id: data.id, user_id: u, school_id: schoolId })));
  });
}

export default async function Directives({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireModule("staff", "principal");
  const [{ data: staff }, { data: directives }] = await Promise.all([
    supabase.from("memberships").select("user_id, role, profiles(full_name)").eq("school_id", schoolId).eq("is_active", true)
      .in("role", ["teacher", "counselor", "finance", "school_admin"]),
    supabase.from("directives").select("id, title, body, due_on, created_at, directive_recipients(status, report, profiles:user_id(full_name))")
      .eq("school_id", schoolId).order("created_at", { ascending: false }).limit(30),
  ]);
  const people = new Map<string, { name: string; roles: string[] }>();
  for (const m of (staff ?? []) as any[]) {
    const p = people.get(m.user_id) ?? { name: m.profiles?.full_name ?? "", roles: [] as string[] };
    p.roles.push(ROLE_LABEL[m.role as Role]);
    people.set(m.user_id, p);
  }

  return (
    <>
      <PageHeader title="Arahan untuk Guru" subtitle="Beri tugas atau arahan, lalu pantau laporan progresnya." />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!directives?.length && <Empty>Belum ada arahan.</Empty>}
          {directives?.map((d: any) => {
            const rec = d.directive_recipients ?? [];
            const done = rec.filter((r: any) => r.status === "selesai").length;
            return (
              <Card key={d.id} title={d.title} actions={<span className="text-xs font-semibold text-muted tabular-nums">{done}/{rec.length} selesai</span>}>
                <div className="mb-2 text-xs text-muted">{waktu(d.created_at)}{d.due_on ? ` · Tenggat ${tanggal(d.due_on)}` : ""}</div>
                <p className="mb-3 whitespace-pre-line text-sm">{d.body}</p>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {rec.map((r: any, i: number) => (
                    <li key={i} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-semibold">{r.profiles?.full_name}</div>
                        {r.report && <div className="text-muted">{r.report}</div>}
                      </div>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
        <Card title="Arahan baru" className="h-fit">
          <form action={createDirective} className="flex flex-col gap-3">
            <Field label="Judul"><Input id="d-title" name="title" required /></Field>
            <Field label="Isi arahan"><Textarea id="d-body" name="body" rows={5} required /></Field>
            <Field label="Tenggat (opsional)"><Input id="d-due" name="due_on" type="date" /></Field>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-semibold">Penerima</legend>
              <div className="flex max-h-60 flex-col gap-1.5 overflow-y-auto rounded-md border border-line p-2">
                {[...people.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, p]) => (
                  <label key={id} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="recipients" value={id} className="mt-1" />
                    <span>{p.name} <span className="text-xs text-muted">({p.roles.join(", ")})</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <SubmitButton>Kirim arahan</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
