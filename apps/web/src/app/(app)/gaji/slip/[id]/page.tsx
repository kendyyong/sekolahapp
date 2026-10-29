import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { run, str } from "@/lib/actions";
import { requireModule } from "@/lib/session";
import { MANAGERS, STAFF_ROLES, type Adjustment, type RunStatus, type Slip } from "@/lib/payroll";
import { Card, Flash, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PrintButton } from "@/components/print-button";
import { Payslip, type PayslipView } from "@/components/payslip";

const page = (id: string) => `/gaji/slip/${id}`;
const EXTRA_ROWS = 3;

async function saveAdjustments(fd: FormData) {
  "use server";
  await requireModule("payroll", "finance", "school_admin");
  const id = str(fd, "slip");
  const adjustments: Adjustment[] = fd.getAll("row").map(String).flatMap((k) => {
    const label = str(fd, `label_${k}`);
    const amount = Number(str(fd, `amount_${k}`).replace(/\D/g, ""));
    if (!label && !amount) return [];
    return [{ label, amount: str(fd, `sign_${k}`) === "minus" ? -amount : amount }];
  });
  await run(page(id), "Penyesuaian disimpan dan slip dihitung ulang.", (sb) =>
    sb.rpc("payroll_set_adjustments", { p_slip: id, p_adjustments: adjustments }));
}

async function removeSlip(fd: FormData) {
  "use server";
  await requireModule("payroll", "finance", "school_admin");
  const id = str(fd, "slip");
  await run(page(id), "Pegawai dikeluarkan dari penggajian bulan ini.", (sb) => sb.rpc("payroll_remove_slip", { p_slip: id }),
    () => `/gaji/${str(fd, "run")}`);
}

export default async function PayslipPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, active } = await requireModule("payroll", ...STAFF_ROLES);
  const { data } = await supabase.from("payslips")
    .select("*, payroll_runs(period, status, paid_on, paid_method), payroll_employees(nip, bank_name, bank_account, account_holder)")
    .eq("id", id).maybeSingle();
  if (!data) notFound();
  const { payroll_runs: runRow, payroll_employees: emp, ...slip } = data as Slip & {
    payroll_runs: PayslipView["run"]; payroll_employees: PayslipView["employee"];
  };
  const v: PayslipView = { slip: slip as Slip, run: runRow, employee: emp, school: active.school_name };
  const manage = MANAGERS.includes(active.role);
  const editable = manage && runRow.status === ("draft" satisfies RunStatus);
  const back = manage || active.role === "principal" ? `/gaji/${slip.run_id}` : "/pegawai/gaji";
  const rows = [...slip.adjustments, ...Array.from({ length: EXTRA_ROWS }, () => null)];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
          <ArrowLeft aria-hidden className="size-4" /> {back === "/pegawai/gaji" ? "Slip gaji saya" : "Kembali ke penggajian"}
        </Link>
        <PrintButton label="Cetak / simpan PDF" />
      </div>
      <div className="print:hidden"><Flash searchParams={sp} /></div>
      <div className={editable ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]" : ""}>
        <Payslip v={v} />
        {editable && (
          <div className="flex flex-col gap-6 print:hidden">
            <Card title="Penyesuaian bulan ini">
              <form action={saveAdjustments} className="flex flex-col gap-3">
                <input type="hidden" name="slip" value={id} />
                <p className="text-xs text-muted">Untuk lembur, THR, bonus, kasbon, atau koreksi. Kosongkan baris untuk menghapus.</p>
                {rows.map((a, k) => (
                  <div key={k} className="grid grid-cols-[104px_minmax(0,1fr)_108px] gap-2">
                    <input type="hidden" name="row" value={k} />
                    <Select name={`sign_${k}`} defaultValue={a && a.amount < 0 ? "minus" : "plus"} aria-label={`Jenis baris ${k + 1}`}>
                      <option value="plus">Tambah</option><option value="minus">Potong</option>
                    </Select>
                    <Input name={`label_${k}`} defaultValue={a?.label ?? ""} maxLength={80} placeholder={k === 0 ? "Contoh: Lembur akreditasi" : "Keterangan"} aria-label={`Keterangan baris ${k + 1}`} />
                    <Input name={`amount_${k}`} type="number" min={1} step={1} defaultValue={a ? Math.abs(a.amount) : ""} placeholder="Rp" aria-label={`Nominal baris ${k + 1}`} />
                  </div>
                ))}
                <SubmitButton pendingLabel="Menyimpan…" className="w-fit">Simpan penyesuaian</SubmitButton>
              </form>
            </Card>
            <Card title="Keluarkan dari bulan ini">
              <form action={removeSlip}>
                <input type="hidden" name="slip" value={id} /><input type="hidden" name="run" value={slip.run_id} />
                <p className="mb-2 text-xs text-muted">Misalnya pegawai sudah keluar. Slip kembali muncul bila dihitung ulang selama pegawainya masih aktif.</p>
                <SubmitButton variant="ghost" className="-ml-3 text-bad hover:bg-bad-soft">Keluarkan {slip.full_name}</SubmitButton>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
