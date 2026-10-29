import { requireModule } from "@/lib/session";
import { myChildren } from "@/lib/queries";
import { ReportList } from "@/components/report-list";
import { PageHeader } from "@/components/ui";

export default async function GuardianReports() {
  const { supabase, user, schoolId } = await requireModule("grades", "guardian");
  const children = await myChildren(supabase, user.id, schoolId);
  return (
    <>
      <PageHeader title="Rapor" subtitle="Rapor muncul di sini setelah diterbitkan sekolah. Bisa dicetak atau disimpan sebagai PDF." />
      <ReportList supabase={supabase} students={children} />
    </>
  );
}
