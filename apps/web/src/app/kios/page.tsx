import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { Kiosk } from "@/components/kiosk";

export const metadata: Metadata = { title: "Kios Absen · SekolahApp" };

/** Layar penuh tanpa sidebar, untuk tablet di gerbang atau laptop guru piket. */
export default async function KioskPage() {
  const { active, supabase } = await requireRole("teacher", "school_admin", "principal", "finance", "counselor");
  const { data: school } = await supabase.from("schools").select("timezone").eq("id", active.school_id).single();
  return <Kiosk schoolName={active.school_name} timeZone={school?.timezone ?? "Asia/Jakarta"} />;
}
