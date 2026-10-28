import Link from "next/link";
import { requireRole } from "@/lib/session";
import { sendStudentMessage } from "@/lib/chat-action";
import { ChatThread } from "@/components/chat-thread";
import { Card, Empty, Flash, PageHeader, cx } from "@/components/ui";

export default async function TeacherMessages({ searchParams }: { searchParams: Promise<{ murid?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireRole("teacher");
  const { data: classes } = await supabase.from("classes")
    .select("id, name, enrollments(roll_number, students(id, full_name)), academic_years!inner(is_active)")
    .eq("homeroom_teacher_id", user.id).eq("school_id", schoolId).eq("academic_years.is_active", true);
  const students = (classes ?? []).flatMap((c: any) => (c.enrollments ?? []).map((e: any) => ({ ...e.students, kelas: c.name })))
    .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name)) as { id: string; full_name: string; kelas: string }[];

  const { data: last } = students.length
    ? await supabase.from("student_messages").select("student_id, created_at").in("student_id", students.map((s) => s.id))
        .order("created_at", { ascending: false }).limit(500)
    : { data: [] };
  const lastAt = new Map<string, string>();
  for (const m of last ?? []) if (!lastAt.has(m.student_id)) lastAt.set(m.student_id, m.created_at);
  students.sort((a, b) => (lastAt.get(b.id) ?? "").localeCompare(lastAt.get(a.id) ?? "") || a.full_name.localeCompare(b.full_name));

  const current = students.find((s) => s.id === sp.murid);

  return (
    <>
      <PageHeader title="Pesan Orang Tua" subtitle="Percakapan dengan orang tua murid di kelas perwalian Anda." />
      <Flash searchParams={sp} />
      {!students.length ? <Empty>Anda belum menjadi wali kelas.</Empty> : (
        <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
          <ul className="flex max-h-[70vh] flex-col overflow-y-auto rounded-lg border border-line bg-sheet">
            {students.map((s) => (
              <li key={s.id}>
                <Link href={`/guru/pesan?murid=${s.id}`}
                  className={cx("flex items-center justify-between border-b border-line px-3 py-2.5 text-sm", s.id === current?.id ? "bg-brand-soft font-bold text-brand" : "hover:bg-paper")}>
                  <span>{s.full_name}</span>
                  {lastAt.has(s.id) && <span className="h-2 w-2 rounded-full bg-accent" aria-label="Ada percakapan" />}
                </Link>
              </li>
            ))}
          </ul>
          {current ? (
            <Card title={`Tentang ${current.full_name} · ${current.kelas}`}>
              <ChatThread sb={supabase} studentId={current.id} me={user.id} action={sendStudentMessage} back={`/guru/pesan?murid=${current.id}`} />
            </Card>
          ) : <Empty>Pilih murid untuk membuka percakapan.</Empty>}
        </div>
      )}
    </>
  );
}
