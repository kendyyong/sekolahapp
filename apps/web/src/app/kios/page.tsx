import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { Kiosk } from "@/components/kiosk";
import { brandScope } from "@/lib/brand";

export const metadata: Metadata = { title: "Kios Absen" };

/** Layar penuh tanpa sidebar, untuk tablet di gerbang atau laptop guru piket. */
export default async function KioskPage() {
  const { active, supabase, brand } = await requireRole("teacher", "school_admin", "principal", "finance", "counselor");
  const { data: school } = await supabase.from("schools").select("timezone").eq("id", active.school_id).single();
  return (
    <div {...brandScope(brand?.brand_color)}>
      <Kiosk schoolName={active.school_name} logo={brand?.logo_url ?? null} timeZone={school?.timezone ?? "Asia/Jakarta"} />
    </div>
  );
}
