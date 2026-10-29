import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { registerSchool, WELCOME } from "@/lib/onboarding";
import { SchoolFields, schoolDraftFrom, type SchoolDraft } from "@/components/school-fields";
import { Card, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

async function register(fd: FormData) {
  "use server";
  const { supabase } = await getSession();
  const err = await registerSchool(supabase, schoolDraftFrom(fd));
  if (err) redirect("/sekolah-baru?err=" + encodeURIComponent(err));
  redirect("/admin?ok=" + encodeURIComponent(WELCOME));
}

export default async function NewSchool({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const sp = await searchParams;
  const { user } = await getSession();
  const draft = (user.user_metadata?.pending_school ?? {}) as SchoolDraft;
  return (
    <>
      <PageHeader title="Daftarkan sekolah" subtitle="Sekolah baru memakai paket Gratis (sampai 100 murid). Anda menjadi Admin Sekolah-nya." />
      <Flash searchParams={sp} />
      <Card className="max-w-lg">
        <form action={register} className="flex flex-col gap-4">
          <SchoolFields draft={draft} />
          <SubmitButton>Daftarkan sekolah</SubmitButton>
        </form>
      </Card>
    </>
  );
}
