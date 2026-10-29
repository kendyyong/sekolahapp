import Link from "next/link";
import { num, optStr, run, str } from "@/lib/actions";
import { rupiah } from "@/lib/format";
import { requireModule } from "@/lib/session";
import { CALC_LABEL, STAFF_ROLES, STAFF_SHORT, STAFF_STATUS, rateLabel, type Calc } from "@/lib/payroll";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PayrollTabs } from "../tabs";

const ROLES = ["finance", "school_admin"] as const;
const PAGE = "/gaji/pegawai";

async function saveEmployee(fd: FormData) {
  "use server";
  const { supabase, schoolId } = await requireModule("payroll", ...ROLES);
  const id = optStr(fd, "id");
  const userId = optStr(fd, "user_id");
  await run(PAGE, id ? "Data pegawai disimpan." : "Pegawai ditambahkan.", async (sb) => {
    let name = str(fd, "full_name");
    if (!name && userId) name = (await supabase.from("profiles").select("full_name").eq("id", userId).single()).data?.full_name ?? "";
    if (!name) throw new Error("Isi nama pegawai atau pilih akunnya");
    const row: Record<string, unknown> = {
      full_name: name, position: optStr(fd, "position"), status: str(fd, "status"), nip: optStr(fd, "nip"),
      base_salary: num(fd, "base_salary"), bank_name: optStr(fd, "bank_name"), bank_account: optStr(fd, "bank_account"),
      account_holder: optStr(fd, "account_holder"), joined_on: optStr(fd, "joined_on"),
      ...(id ? { is_active: fd.get("is_active") === "on" } : { user_id: userId, school_id: schoolId }),
    };
    const res = id ? await sb.from("payroll_employees").update(row).eq("id", id).select("id").single()
                   : await sb.from("payroll_employees").insert(row).select("id").single();
    if (res.error) return res;
    const employee = res.data.id as string;
    // Nominal khusus per komponen: kosong = ikut standar (atau tidak berlaku), 0 = dikecualikan.
    const set = fd.getAll("component").map(String).flatMap((c) => {
      const v = str(fd, `c_${c}`);
      return v === "" ? [] : [{ employee_id: employee, component_id: c, school_id: schoolId, rate: Number(v.replace(",", ".")) }];
    });
    const unset = fd.getAll("component").map(String).filter((c) => str(fd, `c_${c}`) === "");
    if (set.length) {
      const { error } = await sb.from("payroll_employee_components").upsert(set);
      if (error) return { error };
    }
    if (unset.length) return sb.from("payroll_employee_components").delete().eq("employee_id", employee).in("component_id", unset);
  });
}

async function addAllStaff() {
  "use server";
  const { supabase, schoolId } = await requireModule("payroll", ...ROLES);
  let added = 0;
  await run(PAGE, () => added ? `${added} pegawai ditambahkan. Lengkapi gaji pokok dan rekeningnya.` : "Semua guru & staf sudah terdaftar.", async (sb) => {
    const [{ data: members }, { data: existing }] = await Promise.all([
      supabase.from("memberships").select("user_id, role, profiles(full_name)").eq("school_id", schoolId).eq("is_active", true).in("role", [...STAFF_ROLES]),
      supabase.from("payroll_employees").select("user_id").eq("school_id", schoolId),
    ]);
    const have = new Set((existing ?? []).map((e) => e.user_id));
    const rows = new Map<string, { school_id: string; user_id: string; full_name: string; status: string }>();
    for (const m of (members ?? []) as unknown as { user_id: string; role: string; profiles: { full_name: string } | null }[]) {
      if (have.has(m.user_id) || !m.profiles?.full_name) continue;
      const teacher = m.role === "teacher" || m.role === "counselor" || rows.get(m.user_id)?.status === "gty";
      rows.set(m.user_id, { school_id: schoolId, user_id: m.user_id, full_name: m.profiles.full_name, status: teacher ? "gty" : "pty" });
    }
    added = rows.size;
    if (added) return sb.from("payroll_employees").insert([...rows.values()]);
  });
}

interface Employee {
  id: string; user_id: string | null; full_name: string; position: string | null; status: string; nip: string | null;
  base_salary: number; bank_name: string | null; bank_account: string | null; account_holder: string | null;
  joined_on: string | null; is_active: boolean; payroll_employee_components: { component_id: string; rate: number }[];
}
interface Component { id: string; name: string; kind: string; calc: Calc; rate: number; applies_to_all: boolean }

export default async function Employees({ searchParams }: { searchParams: Promise<{ edit?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireModule("payroll", ...ROLES);
  const [{ data: emps }, { data: comps }, { data: members }] = await Promise.all([
    supabase.from("payroll_employees").select("*, payroll_employee_components(component_id, rate)").eq("school_id", schoolId)
      .order("is_active", { ascending: false }).order("full_name"),
    supabase.from("payroll_components").select("id, name, kind, calc, rate, applies_to_all").eq("school_id", schoolId).eq("is_active", true)
      .order("kind", { ascending: false }).order("position").order("name"),
    supabase.from("memberships").select("user_id, profiles(full_name)").eq("school_id", schoolId).eq("is_active", true).in("role", [...STAFF_ROLES]),
  ]);
  const employees = (emps ?? []) as Employee[];
  const components = (comps ?? []) as Component[];
  const edit = employees.find((e) => e.id === sp.edit);
  const taken = new Set(employees.map((e) => e.user_id));
  const accounts = [...new Map(((members ?? []) as unknown as { user_id: string; profiles: { full_name: string } | null }[])
    .filter((m) => !taken.has(m.user_id)).map((m) => [m.user_id, m.profiles?.full_name ?? "–"])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const override = (c: string) => edit?.payroll_employee_components.find((o) => o.component_id === c)?.rate;

  return (
    <>
      <PageHeader title="Penggajian" subtitle="Data pegawai: gaji pokok, status kepegawaian, rekening, dan komponen gaji khusus tiap orang." />
      <Flash searchParams={sp} />
      <PayrollTabs active="pegawai" manage />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">{employees.filter((e) => e.is_active).length} pegawai aktif</p>
            {accounts.length > 0 && (
              <form action={addAllStaff}>
                <SubmitButton variant="secondary" pendingLabel="Menambahkan…">Tambahkan {accounts.length} akun guru & staf</SubmitButton>
              </form>
            )}
          </div>
          <Table head={["Pegawai", "Status", "Gaji pokok", "Rekening", ""]} empty="Belum ada pegawai. Tambahkan dari akun guru & staf atau isi manual.">
            {employees.map((e) => (
              <tr key={e.id} className={e.is_active ? "" : "opacity-60"}>
                <td>
                  <div className="font-semibold text-ink">{e.full_name}</div>
                  <div className="text-xs text-muted">{[e.position, e.user_id ? null : "tanpa akun"].filter(Boolean).join(" · ") || "–"}</div>
                </td>
                <td>{STAFF_SHORT[e.status]}{!e.is_active && <> <Badge>Nonaktif</Badge></>}
                  {e.payroll_employee_components.length > 0 && <div className="text-xs text-muted">{e.payroll_employee_components.length} komponen khusus</div>}
                </td>
                <td className="tabular-nums">{e.base_salary ? rupiah(e.base_salary) : <span className="text-warn">Belum diisi</span>}</td>
                <td className="text-xs">{e.bank_account ? `${e.bank_name ?? ""} ${e.bank_account}` : <span className="text-muted">–</span>}</td>
                <td className="text-right"><Link href={`${PAGE}?edit=${e.id}`} className="text-sm font-semibold text-brand">Ubah</Link></td>
              </tr>
            ))}
          </Table>
        </div>

        <Card title={edit ? `Ubah ${edit.full_name}` : "Tambah pegawai"} className="h-fit"
          actions={edit && <Link href={PAGE} className="text-sm font-semibold text-brand">Batal</Link>}>
          <form key={edit?.id ?? "new"} action={saveEmployee} className="flex flex-col gap-4">
            {edit && <input type="hidden" name="id" value={edit.id} />}
            {!edit && (
              <Field label="Akun SekolahApp" hint="Pegawai dengan akun bisa melihat slipnya sendiri dan absensinya ikut terhitung.">
                <Select id="user_id" name="user_id" defaultValue="">
                  <option value="">Tanpa akun (satpam, kebersihan, dll.)</option>
                  {accounts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Nama lengkap" hint={edit ? undefined : "Boleh kosong bila memilih akun"}>
              <Input id="full_name" name="full_name" defaultValue={edit?.full_name ?? ""} maxLength={120} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jabatan"><Input id="position" name="position" defaultValue={edit?.position ?? ""} maxLength={80} placeholder="Guru Matematika" /></Field>
              <Field label="Status">
                <Select id="status" name="status" defaultValue={edit?.status ?? "gty"}>
                  {Object.entries(STAFF_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Gaji pokok (Rp)"><Input id="base_salary" name="base_salary" type="number" min={0} step={1000} defaultValue={edit?.base_salary ?? 0} required /></Field>
              <Field label="NIP / NUPTK"><Input id="nip" name="nip" defaultValue={edit?.nip ?? ""} maxLength={40} /></Field>
              <Field label="Bank"><Input id="bank_name" name="bank_name" defaultValue={edit?.bank_name ?? ""} maxLength={40} placeholder="BSI" /></Field>
              <Field label="No. rekening"><Input id="bank_account" name="bank_account" defaultValue={edit?.bank_account ?? ""} maxLength={40} inputMode="numeric" /></Field>
              <Field label="Atas nama" className="col-span-2"><Input id="account_holder" name="account_holder" defaultValue={edit?.account_holder ?? ""} maxLength={120} /></Field>
              <Field label="Mulai bekerja" hint="Tidak digaji untuk bulan sebelumnya"><Input id="joined_on" name="joined_on" type="date" defaultValue={edit?.joined_on ?? ""} /></Field>
            </div>
            {components.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">Komponen gaji khusus</legend>
                <p className="text-xs text-muted">Kosong = ikut standar. Isi 0 untuk mengecualikan pegawai ini.</p>
                {components.map((c) => (
                  <label key={c.id} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 text-sm">
                    <input type="hidden" name="component" value={c.id} />
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{c.name}</span>
                      <span className="block text-xs text-muted">{CALC_LABEL[c.calc]} · {c.applies_to_all ? `standar ${rateLabel(c.calc, c.rate)}` : "hanya bila diisi"}</span>
                    </span>
                    <Input name={`c_${c.id}`} type="number" min={0} step="any" defaultValue={override(c.id) ?? ""}
                      placeholder={c.applies_to_all ? String(Number(c.rate)) : "–"} aria-label={`Nominal ${c.name}`} />
                  </label>
                ))}
              </fieldset>
            )}
            {edit && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_active" defaultChecked={edit.is_active} className="size-4 accent-[var(--color-brand-solid)]" /> Masih aktif bekerja
              </label>
            )}
            <SubmitButton pendingLabel="Menyimpan…">{edit ? "Simpan" : "Tambah pegawai"}</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
