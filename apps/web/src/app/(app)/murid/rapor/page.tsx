import { requireModule } from "@/lib/session";
import { myStudent } from "@/lib/queries";
import { ReportList } from "@/components/report-list";
import { Empty, PageHeader } from "@/components/ui";

export default async function StudentReports() {
  const { supabase, user, schoolId } = await requireModule("grades", "student");
  const me = await myStudent(supabase, user.id, schoolId);
  return (
    <>
      <PageHeader title="Rapor Saya" />
      {me ? <ReportList supabase={supabase} students={[me]} /> : <Empty>Data murid tidak ditemukan.</Empty>}
    </>
  );
}
