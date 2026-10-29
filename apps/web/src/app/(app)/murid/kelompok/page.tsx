import Link from "next/link";
import { requireRole } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal, todayJakarta } from "@/lib/format";
import { classRoster, myStudent } from "@/lib/queries";
import { Badge, Button, Card, Empty, Field, Flash, Input, PageHeader, Select, StatusBadge, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const POSITION: Record<string, string> = { ketua: "Ketua", sekretaris: "Sekretaris", bendahara: "Bendahara", anggota: "Anggota" };
const ORDER = ["ketua", "sekretaris", "bendahara", "anggota"];

async function createGroup(fd: FormData) {
  "use server";
  const { supabase, user, schoolId } = await requireRole("student");
  const me = await myStudent(supabase, user.id, schoolId);
  await run("/murid/kelompok", "Kelompok dibuat. Anda menjadi Ketua; undang teman sekelas.", (sb) => sb.rpc("create_work_group", {
    p_class: me?.class?.id, p_name: str(fd, "name"), p_ta: optStr(fd, "ta"), p_assignment: optStr(fd, "assignment"),
  }));
}
async function invite(fd: FormData) {
  "use server";
  await run(`/murid/kelompok?g=${str(fd, "group")}`, "Undangan terkirim.", (sb) =>
    sb.rpc("invite_group_member", { p_group: str(fd, "group"), p_student: str(fd, "student"), p_position: str(fd, "position") }));
}
async function setPosition(fd: FormData) {
  "use server";
  await run(`/murid/kelompok?g=${str(fd, "group")}`, "Jabatan diubah.", (sb) =>
    sb.rpc("set_group_member_position", { p_group: str(fd, "group"), p_student: str(fd, "student"), p_position: str(fd, "position") }));
}
async function removeMember(fd: FormData) {
  "use server";
  await run(`/murid/kelompok?g=${str(fd, "group")}`, "Anggota dikeluarkan.", (sb) =>
    sb.rpc("remove_group_member", { p_group: str(fd, "group"), p_student: str(fd, "student") }));
}
async function respond(fd: FormData) {
  "use server";
  const accept = str(fd, "accept") === "true";
  await run("/murid/kelompok", accept ? "Anda bergabung ke kelompok." : "Undangan ditolak.", (sb) =>
    sb.rpc("respond_group_invite", { p_group: str(fd, "group"), p_accept: accept }));
}
async function submitGroup(fd: FormData) {
  "use server";
  await run(`/murid/kelompok?g=${str(fd, "group")}`, "Kelompok dikirim ke guru untuk diverifikasi.", (sb) =>
    sb.rpc("submit_work_group", { p_group: str(fd, "group") }));
}
async function addLedger(fd: FormData) {
  "use server";
  const { schoolId, user } = await requireRole("student");
  await run(`/murid/kelompok?g=${str(fd, "group")}`, "Kas kelompok dicatat.", (sb) => sb.from("group_ledger").insert({
    group_id: str(fd, "group"), school_id: schoolId, direction: str(fd, "direction"), amount: num(fd, "amount"),
    description: str(fd, "description"), occurred_on: str(fd, "occurred_on"), recorded_by: user.id,
  }));
}

export default async function StudentGroups({ searchParams }: { searchParams: Promise<{ g?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireRole("student");
  const me = await myStudent(supabase, user.id, schoolId);
  if (!me?.class) return (<><PageHeader title="Kelompok Kerja" /><Empty>Anda belum terdaftar di kelas.</Empty></>);

  const [{ data: memberships }, roster, { data: tas }, { data: groupAssignments }] = await Promise.all([
    supabase.from("work_group_members").select("group_id, position, invite_status").eq("student_id", me.id),
    classRoster(supabase, me.class.id),
    supabase.from("teaching_assignments").select("id, subjects(name)").eq("class_id", me.class.id),
    supabase.from("assignments").select("id, title, teaching_assignment_id, teaching_assignments!inner(class_id)").eq("is_group", true).eq("teaching_assignments.class_id", me.class.id),
  ]);
  const groupIds = (memberships ?? []).filter((m) => m.invite_status !== "declined").map((m) => m.group_id);
  const { data: groups } = groupIds.length
    ? await supabase.from("work_groups").select("id, name, status, review_note, teaching_assignments(subjects(name)), assignments(title), work_group_members(student_id, position, invite_status, students(full_name))")
        .in("id", groupIds).order("created_at", { ascending: false })
    : { data: [] };
  const myPos = new Map((memberships ?? []).map((m) => [m.group_id, m]));
  const sel = ((groups ?? []) as any[]).find((g) => g.id === sp.g) ?? (groups ?? [])[0] as any;
  const { data: ledger } = sel && sel.status === "verified"
    ? await supabase.from("group_ledger").select("id, direction, amount, description, occurred_on").eq("group_id", sel.id).order("occurred_on")
    : { data: [] };
  const balance = (ledger ?? []).reduce((s, l) => s + (l.direction === "masuk" ? 1 : -1) * Number(l.amount), 0);

  const mine = sel ? myPos.get(sel.id) : undefined;
  const isLeader = mine?.position === "ketua" && mine.invite_status === "accepted";
  const editable = isLeader && ["draft", "revision"].includes(sel?.status);
  const inGroup = new Set((sel?.work_group_members ?? []).map((m: any) => m.student_id));

  return (
    <>
      <PageHeader title="Kelompok Kerja" subtitle="Bentuk kelompok dengan Ketua, Sekretaris, Bendahara, dan Anggota. Guru memverifikasi sebelum kelompok aktif." />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col overflow-hidden rounded-lg border border-line bg-sheet">
            {!(groups ?? []).length && <li className="px-3 py-4 text-sm text-muted">Belum ada kelompok.</li>}
            {((groups ?? []) as any[]).map((g) => {
              const m = myPos.get(g.id)!;
              return (
                <li key={g.id}>
                  <Link href={`/murid/kelompok?g=${g.id}`} className={cx("flex flex-col gap-1 border-b border-line px-3 py-2.5 text-sm", g.id === sel?.id ? "bg-brand-soft" : "hover:bg-paper")}>
                    <span className="font-semibold">{g.name}</span>
                    <span className="flex flex-wrap gap-1"><StatusBadge status={g.status} />{m.invite_status === "invited" && <Badge tone="warn">Undangan</Badge>}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Card title="Buat kelompok">
            <form action={createGroup} className="flex flex-col gap-3">
              <Field label="Nama kelompok"><Input id="g-name" name="name" required maxLength={80} /></Field>
              <Field label="Mapel (opsional)"><Select id="g-ta" name="ta" defaultValue=""><option value="">–</option>{((tas ?? []) as any[]).map((t) => <option key={t.id} value={t.id}>{t.subjects?.name}</option>)}</Select></Field>
              <Field label="Untuk tugas (opsional)"><Select id="g-asg" name="assignment" defaultValue=""><option value="">–</option>{(groupAssignments ?? []).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</Select></Field>
              <SubmitButton>Buat</SubmitButton>
            </form>
          </Card>
        </div>

        {!sel ? <Empty>Buat kelompok atau tunggu undangan dari teman.</Empty> : (
          <div className="flex min-w-0 flex-col gap-6">
            <Card title={sel.name} actions={<StatusBadge status={sel.status} />}>
              <div className="mb-3 text-xs text-muted">
                {sel.teaching_assignments?.subjects?.name ?? "Tanpa mapel (diperiksa wali kelas)"}{sel.assignments ? ` · ${sel.assignments.title}` : ""}
              </div>
              {sel.review_note && <p className="mb-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">Catatan guru: {sel.review_note}</p>}
              {mine?.invite_status === "invited" && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-brand-soft p-3 text-sm">
                  <span>Anda diundang sebagai <b>{POSITION[mine.position]}</b>.</span>
                  <form action={respond}><input type="hidden" name="group" value={sel.id} /><input type="hidden" name="accept" value="true" /><Button className="px-2 py-1">Terima</Button></form>
                  <form action={respond}><input type="hidden" name="group" value={sel.id} /><input type="hidden" name="accept" value="false" /><Button variant="secondary" className="px-2 py-1">Tolak</Button></form>
                </div>
              )}
              <ul className="divide-y divide-line rounded-md border border-line">
                {[...sel.work_group_members].sort((a: any, b: any) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position)).map((m: any) => (
                  <li key={m.student_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="font-semibold">{m.students?.full_name}{m.student_id === me.id && " (Anda)"}</span>
                    <span className="flex items-center gap-2">
                      {editable && m.position !== "ketua" ? (
                        <form action={setPosition} className="flex gap-1">
                          <input type="hidden" name="group" value={sel.id} /><input type="hidden" name="student" value={m.student_id} />
                          <select name="position" defaultValue={m.position} aria-label="Jabatan" className="rounded border border-line bg-sheet px-1 py-0.5 text-xs">
                            {["sekretaris", "bendahara", "anggota"].map((p) => <option key={p} value={p}>{POSITION[p]}</option>)}
                          </select>
                          <button className="text-xs font-semibold text-brand">Ubah</button>
                        </form>
                      ) : <Badge tone={m.position === "anggota" ? "neutral" : "info"}>{POSITION[m.position]}</Badge>}
                      {m.invite_status !== "accepted" && <StatusBadge status={m.invite_status} />}
                      {editable && m.position !== "ketua" && (
                        <form action={removeMember}><input type="hidden" name="group" value={sel.id} /><input type="hidden" name="student" value={m.student_id} />
                          <button className="text-xs text-muted hover:text-bad" aria-label="Keluarkan">×</button></form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {editable && (
                <>
                  <form action={invite} className="mt-4 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="group" value={sel.id} />
                    <Field label="Undang teman" className="min-w-48 flex-1">
                      <Select id="inv-st" name="student">{roster.filter((r) => !inGroup.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}</Select>
                    </Field>
                    <Field label="Jabatan">
                      <Select id="inv-pos" name="position">{["sekretaris", "bendahara", "anggota"].map((p) => <option key={p} value={p}>{POSITION[p]}</option>)}</Select>
                    </Field>
                    <SubmitButton variant="secondary">Undang</SubmitButton>
                  </form>
                  <form action={submitGroup} className="mt-4 border-t border-line pt-4">
                    <input type="hidden" name="group" value={sel.id} />
                    <p className="mb-2 text-xs text-muted">Syarat: ada Ketua, Sekretaris, dan Bendahara, dan semua undangan sudah dijawab.</p>
                    <SubmitButton>Kirim ke guru untuk verifikasi</SubmitButton>
                  </form>
                </>
              )}
            </Card>

            {sel.status === "verified" && (
              <Card title="Kas kelompok" actions={<b className="tabular-nums">{rupiah(balance)}</b>}>
                <ul className="mb-4 divide-y divide-line text-sm">
                  {!(ledger ?? []).length && <li className="py-2 text-muted">Belum ada catatan kas.</li>}
                  {(ledger ?? []).map((l) => (
                    <li key={l.id} className="flex justify-between gap-2 py-2">
                      <span>{tanggal(l.occurred_on)} · {l.description}</span>
                      <b className={cx("tabular-nums", l.direction === "masuk" ? "text-good" : "text-bad")}>{l.direction === "masuk" ? "+" : "−"}{rupiah(l.amount)}</b>
                    </li>
                  ))}
                </ul>
                {mine?.position === "bendahara" ? (
                  <form action={addLedger} className="grid grid-cols-2 gap-2 md:grid-cols-[120px_140px_1fr_140px_auto]">
                    <input type="hidden" name="group" value={sel.id} />
                    <Select name="direction" aria-label="Arah"><option value="masuk">Masuk</option><option value="keluar">Keluar</option></Select>
                    <Input name="amount" type="number" min={1} required placeholder="Nominal" aria-label="Nominal" />
                    <Input name="description" required placeholder="Keterangan" aria-label="Keterangan" />
                    <Input name="occurred_on" type="date" defaultValue={todayJakarta()} aria-label="Tanggal" />
                    <SubmitButton>Catat</SubmitButton>
                  </form>
                ) : <p className="text-xs text-muted">Hanya Bendahara yang dapat mencatat kas.</p>}
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
