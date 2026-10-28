import { requireRole } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { waktu } from "@/lib/format";
import { myTeaching } from "@/lib/queries";
import { Button, Card, Empty, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";

async function createSession(fd: FormData) {
  "use server";
  const { schoolId, user } = await requireRole("teacher");
  await run("/guru/kelas-online", "Link kelas online dibagikan ke murid.", (sb) => sb.from("online_sessions").insert({
    school_id: schoolId,
    teaching_assignment_id: str(fd, "ta"),
    title: str(fd, "title"),
    starts_at: new Date(str(fd, "starts_at") + ":00+07:00").toISOString(),
    duration_minutes: num(fd, "duration"),
    url: str(fd, "url"),
    passcode: optStr(fd, "passcode"),
    created_by: user.id,
  }));
}

async function saveFixedLink(fd: FormData) {
  "use server";
  await run("/guru/kelas-online", "Link tetap kelas disimpan.", (sb) =>
    sb.from("teaching_assignments").update({ meeting_url: optStr(fd, "meeting_url") }).eq("id", str(fd, "ta")));
}

export default async function OnlineClasses({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireRole("teacher");
  const teaching = await myTeaching(supabase, user.id);
  const { data: sessions } = teaching.length
    ? await supabase.from("online_sessions").select("id, title, starts_at, duration_minutes, url, passcode, teaching_assignment_id")
        .in("teaching_assignment_id", teaching.map((t) => t.id)).order("starts_at", { ascending: false }).limit(50)
    : { data: [] };
  const byTa = new Map(teaching.map((t) => [t.id, t]));

  return (
    <>
      <PageHeader title="Kelas Online" subtitle="Bagikan link Zoom atau Google Meet. Murid menerima notifikasi." />
      <Flash searchParams={sp} />
      {!teaching.length ? <Empty>Belum ada mapel yang ditugaskan.</Empty> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-6">
            <Table head={["Sesi", "Kelas", "Mulai", "Link"]} empty="Belum ada sesi kelas online.">
              {(sessions ?? []).map((s) => {
                const t = byTa.get(s.teaching_assignment_id)!;
                return (
                  <tr key={s.id}>
                    <td className="font-semibold">{s.title}</td>
                    <td>{t.subjects.name} · {t.classes.name}</td>
                    <td className="whitespace-nowrap">{waktu(s.starts_at)} · {s.duration_minutes} mnt</td>
                    <td><a className="text-brand underline" href={s.url} target="_blank" rel="noreferrer">Buka</a>{s.passcode && <span className="ml-2 text-xs text-muted">Kode: {s.passcode}</span>}</td>
                  </tr>
                );
              })}
            </Table>
            <Card title="Link tetap per kelas" >
              <p className="mb-3 text-sm text-muted">Link ini tampil di jadwal murid setiap pelajaran Anda.</p>
              <div className="flex flex-col gap-3">
                {teaching.map((t) => (
                  <form key={t.id} action={saveFixedLink} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="ta" value={t.id} />
                    <Field label={`${t.subjects.name} · ${t.classes.name}`} className="min-w-60 flex-1">
                      <Input id={`ml-${t.id}`} name="meeting_url" type="url" defaultValue={t.meeting_url ?? ""} placeholder="https://zoom.us/j/…" />
                    </Field>
                    <Button variant="secondary" type="submit">Simpan</Button>
                  </form>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Jadwalkan sesi" className="h-fit">
            <form action={createSession} className="flex flex-col gap-3">
              <Field label="Mapel & kelas">
                <Select id="os-ta" name="ta">{teaching.map((t) => <option key={t.id} value={t.id}>{t.subjects.name} · {t.classes.name}</option>)}</Select>
              </Field>
              <Field label="Judul"><Input id="os-title" name="title" required placeholder="Pembahasan soal pecahan" /></Field>
              <Field label="Mulai (WIB)"><Input id="os-start" name="starts_at" type="datetime-local" required /></Field>
              <Field label="Durasi (menit)"><Input id="os-dur" name="duration" type="number" defaultValue={60} min={5} max={600} /></Field>
              <Field label="Link Zoom/Meet"><Input id="os-url" name="url" type="url" required placeholder="https://" /></Field>
              <Field label="Kode akses (opsional)"><Input id="os-pass" name="passcode" /></Field>
              <Button type="submit">Bagikan ke murid</Button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
