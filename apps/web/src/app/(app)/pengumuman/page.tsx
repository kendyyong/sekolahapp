import { getSession } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { waktu } from "@/lib/format";
import { Badge, Button, Card, Empty, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";

const AUDIENCE: Record<string, string> = {
  all: "Semua warga sekolah", staff: "Guru & pegawai", students: "Murid", guardians: "Orang tua", class: "Satu kelas",
};

async function publish(fd: FormData) {
  "use server";
  const { active, user } = await getSession();
  const audience = str(fd, "audience");
  await run("/pengumuman", "Pengumuman terkirim.", (sb) => sb.from("announcements").insert({
    school_id: active!.school_id,
    title: str(fd, "title"),
    body: str(fd, "body"),
    audience,
    class_id: audience === "class" ? optStr(fd, "class_id") : null,
    created_by: user.id,
  }));
}

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, active, user } = await getSession();
  if (!active) return null;
  const role = active.role;
  const canBroadcast = ["school_admin", "principal", "finance"].includes(role);
  const canClass = canBroadcast || role === "teacher";

  const [{ data: items }, { data: classes }] = await Promise.all([
    supabase.from("announcements").select("id, title, body, audience, published_at, classes(name), profiles:created_by(full_name)")
      .eq("school_id", active.school_id).order("published_at", { ascending: false }).limit(50),
    canClass
      ? role === "teacher"
        ? supabase.from("teaching_assignments").select("classes(id, name)").eq("teacher_id", user.id)
        : supabase.from("classes").select("id, name").eq("school_id", active.school_id).order("name")
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const classList: { id: string; name: string }[] = role === "teacher"
    ? [...new Map((classes ?? []).map((t: any) => [t.classes.id, t.classes])).values()]
    : ((classes ?? []) as { id: string; name: string }[]);

  return (
    <>
      <PageHeader title="Pengumuman" subtitle={active.school_name} />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!items?.length && <Empty>Belum ada pengumuman.</Empty>}
          {items?.map((a) => (
            <article key={a.id} className="rounded-lg border border-line bg-sheet p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Badge tone="info">{a.audience === "class" ? `Kelas ${(a as any).classes?.name ?? ""}` : AUDIENCE[a.audience]}</Badge>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <span>{(a as any).profiles?.full_name} · {waktu(a.published_at)}</span>
              </div>
              <h2 className="mt-2 text-lg font-bold text-ink">{a.title}</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-ink/90">{a.body}</p>
            </article>
          ))}
        </div>

        {canClass && (
          <Card title="Buat pengumuman" className="h-fit">
            <form action={publish} className="flex flex-col gap-3">
              <Field label="Judul"><Input id="ann-title" name="title" required maxLength={120} /></Field>
              <Field label="Isi"><Textarea id="ann-body" name="body" required rows={5} /></Field>
              <Field label="Penerima">
                <Select id="ann-audience" name="audience" defaultValue={canBroadcast ? "all" : "class"}>
                  {Object.entries(AUDIENCE)
                    .filter(([k]) => canBroadcast || k === "class")
                    .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Kelas" hint="Diisi jika penerima Satu kelas">
                <Select id="ann-class" name="class_id" defaultValue="">
                  <option value="">–</option>
                  {classList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Button type="submit">Kirim pengumuman</Button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
