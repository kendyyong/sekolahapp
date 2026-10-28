import { Tabs } from "@/components/ui";

/** Pilih anak lewat ?anak=…; anak pertama bila tidak ada. */
export function pickChild<T extends { id: string }>(children: T[], id?: string): T | undefined {
  return children.find((c) => c.id === id) ?? children[0];
}

export function ChildTabs({ items, active, base }: { items: { id: string; full_name: string }[]; active: string; base: string }) {
  if (items.length < 2) return null;
  return <Tabs active={active} items={items.map((c) => ({ key: c.id, label: c.full_name.split(" ")[0], href: `${base}?anak=${c.id}` }))} />;
}
