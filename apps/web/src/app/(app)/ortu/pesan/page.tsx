import { requireRole } from "@/lib/session";
import { sendStudentMessage } from "@/lib/chat-action";
import { myChildren } from "@/lib/queries";
import { ChatThread } from "@/components/chat-thread";
import { Card, Empty, Flash, PageHeader } from "@/components/ui";
import { ChildTabs, pickChild } from "../child-tabs";

export default async function GuardianMessages({ searchParams }: { searchParams: Promise<{ anak?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireRole("guardian");
  const children = await myChildren(supabase, user.id, schoolId);
  const child = pickChild(children, sp.anak);
  if (!child) return (<><PageHeader title="Pesan Wali Kelas" /><Empty>Akun Anda belum ditautkan ke data murid.</Empty></>);
  const { data: homeroom } = child.class?.homeroom_teacher_id
    ? await supabase.from("profiles").select("full_name").eq("id", child.class.homeroom_teacher_id).maybeSingle()
    : { data: null };

  return (
    <>
      <PageHeader title="Pesan Wali Kelas" subtitle={homeroom ? `${homeroom.full_name} · wali kelas ${child.class!.name}` : undefined} />
      <ChildTabs items={children} active={child.id} base="/ortu/pesan" />
      <Flash searchParams={sp} />
      {!child.class?.homeroom_teacher_id ? <Empty>Kelas {child.full_name} belum memiliki wali kelas.</Empty> : (
        <Card title={`Tentang ${child.full_name}`} className="max-w-3xl">
          <ChatThread sb={supabase} studentId={child.id} me={user.id} action={sendStudentMessage} back={`/ortu/pesan?anak=${child.id}`} />
        </Card>
      )}
    </>
  );
}
