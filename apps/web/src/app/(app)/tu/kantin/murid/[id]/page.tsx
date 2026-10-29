import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { rupiah } from "@/lib/format";
import { LEDGER_COLUMNS, type LedgerRow } from "@/lib/canteen";
import { Badge, Card, Field, Flash, Input, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CanteenLedger } from "@/components/canteen-ledger";
import { CanteenControlFields, controlsFromForm } from "@/components/canteen-controls";

const ROLES = ["finance", "school_admin"] as const;

async function cash(fd: FormData) {
  "use server";
  await requireModule("canteen", ...ROLES);
  const withdraw = str(fd, "mode") === "withdraw";
  await run(`/tu/kantin/murid/${str(fd, "student")}`, withdraw ? "Saldo ditarik tunai." : "Saldo diisi.", (sb) =>
    sb.rpc("canteen_cash", { p_student: str(fd, "student"), p_amount: num(fd, "amount"), p_withdraw: withdraw, p_note: optStr(fd, "note") }));
}

async function controls(fd: FormData) {
  "use server";
  await requireModule("canteen", ...ROLES);
  await run(`/tu/kantin/murid/${str(fd, "student")}`, "Pengaturan kartu jajan disimpan.", (sb) =>
    sb.rpc("canteen_set_controls", { p_student: str(fd, "student"), ...controlsFromForm(fd) }));
}

export default async function StudentWallet({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, schoolId } = await requireModule("canteen", ...ROLES);
  const [{ data: s }, { data: w }, { data: ledger }] = await Promise.all([
    supabase.from("students").select("id, full_name, nis").eq("id", id).eq("school_id", schoolId).maybeSingle(),
    supabase.from("canteen_wallets").select("balance, daily_limit, is_frozen").eq("student_id", id).maybeSingle(),
    supabase.from("canteen_ledger").select(LEDGER_COLUMNS).eq("student_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  if (!s) notFound();
  const box = "size-4 accent-[var(--color-brand-solid)]";
  return (
    <>
      <Link href="/tu/kantin" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft aria-hidden className="size-4" /> Kantin Digital</Link>
      <PageHeader title={s.full_name} subtitle={`NIS ${s.nis ?? "–"}`} actions={w?.is_frozen ? <Badge tone="bad">Kartu dibekukan</Badge> : undefined} />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Saldo" value={rupiah(w?.balance ?? 0)} />
        <Stat label="Batas jajan harian" value={w?.daily_limit ? rupiah(w.daily_limit) : "Tanpa batas"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0"><CanteenLedger rows={(ledger ?? []) as unknown as LedgerRow[]} /></div>
        <div className="flex flex-col gap-6">
          <Card title="Isi / tarik saldo tunai">
            <form action={cash} className="flex flex-col gap-4">
              <input type="hidden" name="student" value={s.id} />
              <Field label="Nominal (Rp)"><Input id="amount" name="amount" type="number" min={1000} step={1000} required /></Field>
              <Field label="Catatan (opsional)"><Input id="note" name="note" maxLength={300} /></Field>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="mode" value="topup" defaultChecked className={box} />Isi saldo</label>
                <label className="flex items-center gap-2"><input type="radio" name="mode" value="withdraw" className={box} />Tarik tunai</label>
              </div>
              <SubmitButton pendingLabel="Menyimpan…">Simpan</SubmitButton>
            </form>
          </Card>
          <Card title="Kartu jajan">
            <form action={controls} className="flex flex-col gap-4">
              <input type="hidden" name="student" value={s.id} />
              <CanteenControlFields limit={w?.daily_limit ?? null} frozen={w?.is_frozen ?? false} />
              <SubmitButton variant="secondary" className="w-fit" pendingLabel="Menyimpan…">Simpan</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
