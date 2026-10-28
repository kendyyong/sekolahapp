import { getSession, MODULE_LABEL, type Module } from "@/lib/session";
import { LinkButton, PageHeader } from "@/components/ui";

const PLAN_NAME: Record<string, string> = { free: "Gratis", basic: "Dasar", pro: "Pro", enterprise: "Enterprise" };

/** Tujuan saat membuka fitur yang belum termasuk paket sekolah. */
export default async function LockedFeature({ searchParams }: { searchParams: Promise<{ fitur?: string }> }) {
  const sp = await searchParams;
  const { supabase, active } = await getSession();
  const module = (sp.fitur ?? "") as Module;
  const { data: plans } = await supabase.from("plans").select("tier, modules, price_per_student").order("price_per_student");
  const cheapest = (plans ?? []).find((p) => (p.modules as string[]).includes(module));
  const isAdmin = active?.role === "school_admin";

  return (
    <>
      <PageHeader title={MODULE_LABEL[module] ?? "Fitur berbayar"} />
      <div className="max-w-xl rounded-lg border border-line bg-sheet p-6">
        <p className="text-ink text-pretty">
          Fitur ini belum termasuk paket {active?.school_name ?? "sekolah Anda"}
          {cheapest ? <> dan tersedia mulai paket <b>{PLAN_NAME[cheapest.tier] ?? cheapest.tier}</b></> : null}.
        </p>
        <p className="mt-2 text-sm text-muted text-pretty">
          Data yang sudah ada tetap aman dan bisa dilihat kembali setelah paket dinaikkan.
        </p>
        <div className="mt-5">
          {isAdmin
            ? <LinkButton href="/admin/langganan" variant="primary">Lihat paket & ajukan naik paket</LinkButton>
            : <p className="text-sm text-muted">Minta admin sekolah menaikkan paket di menu Langganan & Paket.</p>}
        </div>
      </div>
    </>
  );
}
