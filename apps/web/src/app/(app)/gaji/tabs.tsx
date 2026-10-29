import { Tabs } from "@/components/ui";

/** Tab halaman penggajian; data pegawai & komponen hanya untuk TU dan admin. */
export function PayrollTabs({ active, manage }: { active: "runs" | "pegawai" | "komponen"; manage: boolean }) {
  if (!manage) return null;
  return (
    <Tabs active={active} items={[
      { key: "runs", label: "Penggajian bulanan", href: "/gaji" },
      { key: "pegawai", label: "Data pegawai", href: "/gaji/pegawai" },
      { key: "komponen", label: "Komponen gaji", href: "/gaji/komponen" },
    ]} />
  );
}
