import { requireModule } from "@/lib/session";
import { num, run, str } from "@/lib/actions";
import { rupiah } from "@/lib/format";
import { myStalls } from "@/lib/canteen-server";
import { Badge, Card, Empty, Field, Flash, Input, PageHeader, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { StallTabs } from "../stall-picker";

const ROLES = ["canteen", "finance", "school_admin"] as const;
const back = (fd: FormData) => `/kantin/menu?kios=${str(fd, "stall")}`;

async function addItem(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("canteen", ...ROLES);
  await run(back(fd), "Menu ditambahkan.", async (sb) => {
    const price = num(fd, "price");
    if (!(price >= 100)) throw new Error("Harga minimal Rp100");
    const { count } = await sb.from("canteen_items").select("id", { count: "exact", head: true }).eq("stall_id", str(fd, "stall"));
    return sb.from("canteen_items").insert({ school_id: schoolId, stall_id: str(fd, "stall"), name: str(fd, "name"), price, position: (count ?? 0) + 1 });
  });
}

async function saveItem(fd: FormData) {
  "use server";
  await requireModule("canteen", ...ROLES);
  await run(back(fd), "Menu disimpan.", (sb) => sb.from("canteen_items").update({
    name: str(fd, "name"), price: num(fd, "price"), is_available: fd.get("is_available") === "on",
  }).eq("id", str(fd, "id")));
}

async function deleteItem(fd: FormData) {
  "use server";
  await requireModule("canteen", ...ROLES);
  await run(back(fd), "Menu dihapus.", (sb) => sb.from("canteen_items").delete().eq("id", str(fd, "id")));
}

export default async function StallMenu({ searchParams }: { searchParams: Promise<{ kios?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId, active } = await requireModule("canteen", ...ROLES);
  const stalls = await myStalls(supabase, schoolId, user.id, active.role !== "canteen");
  const stall = stalls.find((s) => s.id === sp.kios) ?? stalls[0];
  if (!stall) return (<><PageHeader title="Menu Kios" /><Empty>Belum ada kios untuk Anda.</Empty></>);
  const { data } = await supabase.from("canteen_items").select("id, name, price, is_available").eq("stall_id", stall.id).order("position").order("name");
  const items = (data ?? []) as { id: string; name: string; price: number; is_available: boolean }[];

  return (
    <>
      <PageHeader title={`Menu · ${stall.name}`} subtitle="Menu tampil sebagai tombol di layar kasir. Matikan yang sedang habis." />
      <StallTabs stalls={stalls} active={stall.id} base="/kantin/menu" />
      <Flash searchParams={sp} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Table head={["Menu", "Harga", "Tersedia", ""]} empty="Belum ada menu. Tambahkan di samping.">
            {items.map((i) => (
              <tr key={i.id}>
                <td colSpan={3}>
                  <form action={saveItem} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={i.id} /><input type="hidden" name="stall" value={stall.id} />
                    <Input name="name" defaultValue={i.name} required maxLength={60} aria-label="Nama menu" className="min-w-40 flex-1" />
                    <Input name="price" type="number" min={100} step={100} defaultValue={i.price} required aria-label={`Harga ${i.name}`} className="w-28" />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="is_available" defaultChecked={i.is_available} className="size-4 accent-[var(--color-brand-solid)]" />
                      {i.is_available ? <Badge tone="good">Ada</Badge> : <Badge tone="neutral">Habis</Badge>}
                    </label>
                    <SubmitButton variant="secondary" pendingLabel="…">Simpan</SubmitButton>
                  </form>
                </td>
                <td className="text-right">
                  <form action={deleteItem}>
                    <input type="hidden" name="id" value={i.id} /><input type="hidden" name="stall" value={stall.id} />
                    <SubmitButton variant="ghost" className="text-bad hover:bg-bad-soft" aria-label={`Hapus ${i.name}`}>Hapus</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="Tambah menu" className="h-fit">
          <form action={addItem} className="flex flex-col gap-4">
            <input type="hidden" name="stall" value={stall.id} />
            <Field label="Nama menu"><Input id="name" name="name" required maxLength={60} placeholder="Contoh: Nasi uduk" /></Field>
            <Field label="Harga (Rp)" hint={`Contoh: 5000 → ${rupiah(5000)}`}><Input id="price" name="price" type="number" min={100} step={100} required /></Field>
            <SubmitButton pendingLabel="Menyimpan…">Tambah</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
