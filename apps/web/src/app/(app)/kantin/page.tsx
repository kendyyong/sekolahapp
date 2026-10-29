import { requireModule } from "@/lib/session";
import { todayJakarta } from "@/lib/format";
import { myStalls } from "@/lib/canteen-server";
import { Empty, LinkButton, PageHeader } from "@/components/ui";
import { CanteenPos, type MenuItem, type SaleRow } from "./pos";
import { StallTabs } from "./stall-picker";

export default async function Cashier({ searchParams }: { searchParams: Promise<{ kios?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId, active } = await requireModule("canteen", "canteen", "finance", "school_admin");
  const stalls = (await myStalls(supabase, schoolId, user.id, active.role !== "canteen")).filter((s) => s.is_active);
  const stall = stalls.find((s) => s.id === sp.kios) ?? stalls[0];
  if (!stall) {
    return (
      <>
        <PageHeader title="Kasir Kantin" />
        <Empty>{active.role === "canteen" ? "Anda belum ditugaskan ke kios mana pun. Minta Tata Usaha menambahkan Anda sebagai petugas kios." : "Belum ada kios aktif. Tambahkan kios di menu Kantin Digital."}</Empty>
      </>
    );
  }
  const today = todayJakarta();
  const [{ data: menu }, { data: sales }] = await Promise.all([
    supabase.from("canteen_items").select("id, name, price").eq("stall_id", stall.id).eq("is_available", true).order("position").order("name"),
    supabase.rpc("canteen_stall_entries", { p_stall: stall.id, p_from: today, p_to: today }),
  ]);
  return (
    <>
      <PageHeader title={`Kasir · ${stall.name}`} subtitle="Murid membayar dengan kartu pelajar; saldo terpotong otomatis."
        actions={<LinkButton href={`/kantin/menu?kios=${stall.id}`}>Atur menu</LinkButton>} />
      <StallTabs stalls={stalls} active={stall.id} base="/kantin" />
      <CanteenPos stallId={stall.id} menu={(menu ?? []) as MenuItem[]} sales={(sales ?? []) as SaleRow[]} />
    </>
  );
}
