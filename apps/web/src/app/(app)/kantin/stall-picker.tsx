import type { Stall } from "@/lib/canteen-server";
import { Tabs } from "@/components/ui";

/** Tab kios bila pengguna memegang lebih dari satu kios. */
export function StallTabs({ stalls, active, base }: { stalls: Stall[]; active: string; base: string }) {
  if (stalls.length < 2) return null;
  return <Tabs active={active} items={stalls.map((s) => ({ key: s.id, label: s.name, href: `${base}?kios=${s.id}` }))} />;
}
