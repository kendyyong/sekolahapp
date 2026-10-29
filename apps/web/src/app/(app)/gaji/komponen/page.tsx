import Link from "next/link";
import { num, optStr, run, str } from "@/lib/actions";
import { requireModule } from "@/lib/session";
import { CALC_LABEL, rateLabel, type Calc } from "@/lib/payroll";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PayrollTabs } from "../tabs";

const ROLES = ["finance", "school_admin"] as const;
const PAGE = "/gaji/komponen";
const box = "size-4 accent-[var(--color-brand-solid)]";

/** Contoh komponen yang umum di sekolah swasta; nominal bisa diubah setelahnya. */
const STARTER: { name: string; kind: "earning" | "deduction"; calc: Calc; rate: number; applies_to_all: boolean }[] = [
  { name: "Tunjangan jabatan", kind: "earning", calc: "fixed", rate: 0, applies_to_all: false },
  { name: "Tunjangan wali kelas", kind: "earning", calc: "fixed", rate: 250000, applies_to_all: false },
  { name: "Uang transport", kind: "earning", calc: "per_attendance", rate: 15000, applies_to_all: true },
  { name: "Honor mengajar", kind: "earning", calc: "per_jp", rate: 25000, applies_to_all: false },
  { name: "Potongan terlambat", kind: "deduction", calc: "per_late", rate: 5000, applies_to_all: true },
  { name: "Potongan alpa", kind: "deduction", calc: "per_absence", rate: 50000, applies_to_all: true },
  { name: "BPJS Kesehatan", kind: "deduction", calc: "percent_base", rate: 1, applies_to_all: true },
  { name: "BPJS Ketenagakerjaan (JHT)", kind: "deduction", calc: "percent_base", rate: 2, applies_to_all: true },
];

async function saveComponent(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("payroll", ...ROLES);
  const id = optStr(fd, "id");
  const row = {
    name: str(fd, "name"), kind: str(fd, "kind"), calc: str(fd, "calc"), rate: num(fd, "rate"), position: num(fd, "position"),
    applies_to_all: fd.get("applies_to_all") === "on", is_active: id ? fd.get("is_active") === "on" : true,
  };
  await run(PAGE, id ? "Komponen disimpan. Berlaku untuk penggajian yang dihitung setelah ini." : "Komponen ditambahkan.", (sb) =>
    id ? sb.from("payroll_components").update(row).eq("id", id) : sb.from("payroll_components").insert({ ...row, school_id: schoolId }), () => PAGE);
}

async function addStarter() {
  "use server";
  const { schoolId } = await requireModule("payroll", ...ROLES);
  await run(PAGE, "Contoh komponen ditambahkan. Sesuaikan nominalnya dengan aturan sekolah.", (sb) =>
    sb.from("payroll_components").insert(STARTER.map((c, i) => ({ ...c, position: i, school_id: schoolId }))));
}

async function deleteComponent(fd: FormData) {
  "use server";
  await requireModule("payroll", ...ROLES);
  await run(PAGE, "Komponen dihapus. Slip yang sudah dibayar tidak berubah.", (sb) => sb.from("payroll_components").delete().eq("id", str(fd, "id")), () => PAGE);
}

async function saveSettings(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("payroll", ...ROLES);
  await run(PAGE, "Pengaturan honor mengajar disimpan.", async (sb) => {
    const minutes = num(fd, "jp_minutes"), weeks = num(fd, "jp_weeks");
    if (!(minutes >= 25 && minutes <= 60 && weeks >= 1 && weeks <= 5)) throw new Error("Menit per JP 25–60 dan pekan per bulan 1–5");
    const { data: s, error } = await sb.from("schools").select("settings").eq("id", schoolId).single();
    if (error) return { error };
    return sb.from("schools").update({ settings: { ...(s.settings as object), payroll_jp_minutes: minutes, payroll_jp_weeks: weeks } }).eq("id", schoolId);
  });
}

interface Component { id: string; name: string; kind: "earning" | "deduction"; calc: Calc; rate: number; applies_to_all: boolean; is_active: boolean; position: number }

export default async function Components({ searchParams }: { searchParams: Promise<{ edit?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireModule("payroll", ...ROLES);
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.from("payroll_components").select("*").eq("school_id", schoolId).order("kind", { ascending: false }).order("position").order("name"),
    supabase.rpc("payroll_settings", { p_school: schoolId }),
  ]);
  const comps = (data ?? []) as Component[];
  const edit = comps.find((c) => c.id === sp.edit);
  const st = (settings ?? { jp_minutes: 40, jp_weeks: 4 }) as { jp_minutes: number; jp_weeks: number };

  return (
    <>
      <PageHeader title="Penggajian" subtitle="Komponen gaji berlaku untuk semua pegawai (bila ditandai) atau hanya pegawai yang diberi nominal khusus." />
      <Flash searchParams={sp} />
      <PayrollTabs active="komponen" manage />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!comps.length && (
            <div className="rounded-xl border border-dashed border-line bg-sheet p-5 text-sm">
              <p className="mb-3 text-muted">Belum ada komponen. Mulai dari contoh yang umum dipakai: tunjangan, uang transport per hari hadir, honor per JP, potongan terlambat/alpa, BPJS.</p>
              <form action={addStarter}><SubmitButton variant="secondary" pendingLabel="Menambahkan…">Pakai contoh komponen</SubmitButton></form>
            </div>
          )}
          <Table head={["Komponen", "Cara hitung", "Nominal", "Berlaku", ""]} empty="Belum ada komponen gaji.">
            {comps.map((c) => (
              <tr key={c.id} className={c.is_active ? "" : "opacity-60"}>
                <td>
                  <div className="font-semibold text-ink">{c.name}</div>
                  <Badge tone={c.kind === "earning" ? "good" : "warn"}>{c.kind === "earning" ? "Pendapatan" : "Potongan"}</Badge>
                </td>
                <td className="text-sm">{CALC_LABEL[c.calc]}</td>
                <td className="tabular-nums">{rateLabel(c.calc, c.rate)}</td>
                <td className="text-sm">{!c.is_active ? "Nonaktif" : c.applies_to_all ? "Semua pegawai" : "Pegawai tertentu"}</td>
                <td className="text-right"><Link href={`${PAGE}?edit=${c.id}`} className="text-sm font-semibold text-brand">Ubah</Link></td>
              </tr>
            ))}
          </Table>
          <p className="text-xs text-muted">
            Hari hadir = hadir + terlambat + dinas dari absensi guru. JP mengajar = JP per pekan dari jadwal × {st.jp_weeks} pekan.
            Staf tanpa akun tidak punya absensi, jadi komponen per hari tidak berlaku untuknya. PPh 21 belum dihitung otomatis; catat sebagai komponen potongan tetap per pegawai atau penyesuaian.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <Card title={edit ? `Ubah ${edit.name}` : "Tambah komponen"} actions={edit && <Link href={PAGE} className="text-sm font-semibold text-brand">Batal</Link>}>
            <form key={edit?.id ?? "new"} action={saveComponent} className="flex flex-col gap-4">
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <Field label="Nama komponen"><Input id="name" name="name" defaultValue={edit?.name ?? ""} required maxLength={60} placeholder="Contoh: Tunjangan keluarga" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Jenis">
                  <Select id="kind" name="kind" defaultValue={edit?.kind ?? "earning"}><option value="earning">Pendapatan</option><option value="deduction">Potongan</option></Select>
                </Field>
                <Field label="Urutan"><Input id="position" name="position" type="number" min={0} max={99} defaultValue={edit?.position ?? comps.length} /></Field>
              </div>
              <Field label="Cara hitung">
                <Select id="calc" name="calc" defaultValue={edit?.calc ?? "fixed"}>
                  {Object.entries(CALC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Nominal standar" hint="Rupiah, atau persen untuk “% dari gaji pokok”">
                <Input id="rate" name="rate" type="number" min={0} step="any" defaultValue={edit ? Number(edit.rate) : ""} required />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="applies_to_all" defaultChecked={edit?.applies_to_all ?? false} className={`${box} mt-0.5`} />
                <span><span className="font-medium text-ink">Berlaku untuk semua pegawai</span><span className="block text-xs text-muted">Bila tidak, isi nominal khusus di data pegawai yang menerimanya.</span></span>
              </label>
              {edit && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={edit.is_active} className={box} /> Aktif</label>
              )}
              <SubmitButton pendingLabel="Menyimpan…">{edit ? "Simpan" : "Tambah komponen"}</SubmitButton>
            </form>
            {edit && (
              <form action={deleteComponent} className="mt-3 border-t border-line pt-3">
                <input type="hidden" name="id" value={edit.id} />
                <SubmitButton variant="ghost" className="-ml-3 text-bad hover:bg-bad-soft">Hapus komponen</SubmitButton>
              </form>
            )}
          </Card>
          <Card title="Honor mengajar">
            <form action={saveSettings} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Menit per JP"><Input id="jp_minutes" name="jp_minutes" type="number" min={25} max={60} defaultValue={st.jp_minutes} required /></Field>
                <Field label="Pekan per bulan"><Input id="jp_weeks" name="jp_weeks" type="number" min={1} max={5} defaultValue={st.jp_weeks} required /></Field>
              </div>
              <SubmitButton variant="secondary" className="w-fit" pendingLabel="Menyimpan…">Simpan</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
