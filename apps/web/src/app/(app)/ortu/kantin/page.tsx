import { redirect } from "next/navigation";
import { requireModule } from "@/lib/session";
import { num, run, str } from "@/lib/actions";
import { rupiah } from "@/lib/format";
import { myChildren } from "@/lib/queries";
import { LEDGER_COLUMNS, TOPUP_PRESETS, type LedgerRow } from "@/lib/canteen";
import { Badge, Card, Empty, Field, Flash, Input, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CanteenLedger } from "@/components/canteen-ledger";
import { CanteenControlFields, controlsFromForm } from "@/components/canteen-controls";
import { ChildTabs, pickChild } from "../child-tabs";

const back = (fd: FormData) => `/ortu/kantin?anak=${str(fd, "student")}`;

/** Membuat tagihan isi saldo lalu langsung membuka halaman pembayarannya. */
async function topup(fd: FormData) {
  "use server";
  const { supabase } = await requireModule("canteen", "guardian");
  const student = str(fd, "student");
  const amount = Number(str(fd, "custom") || num(fd, "amount"));
  const { data, error } = await supabase.rpc("canteen_request_topup", { p_student: student, p_amount: amount });
  if (error) redirect(`${back(fd)}&err=${encodeURIComponent(error.message)}`);
  redirect(`/ortu/tagihan?anak=${student}&id=${data}&ok=${encodeURIComponent("Tagihan isi saldo dibuat. Saldo bertambah otomatis setelah pembayaran diterima.")}`);
}

async function controls(fd: FormData) {
  "use server";
  await requireModule("canteen", "guardian");
  await run(back(fd), "Pengaturan kartu jajan disimpan.", (sb) =>
    sb.rpc("canteen_set_controls", { p_student: str(fd, "student"), ...controlsFromForm(fd) }));
}

export default async function GuardianCanteen({ searchParams }: { searchParams: Promise<{ anak?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireModule("canteen", "guardian");
  const children = await myChildren(supabase, user.id, schoolId);
  const child = pickChild(children, sp.anak);
  if (!child) return (<><PageHeader title="Saldo Kantin" /><Empty>Akun Anda belum ditautkan ke data murid.</Empty></>);
  const [{ data: w }, { data: ledger }, { data: online }] = await Promise.all([
    supabase.from("canteen_wallets").select("balance, daily_limit, is_frozen").eq("student_id", child.id).maybeSingle(),
    supabase.from("canteen_ledger").select(LEDGER_COLUMNS).eq("student_id", child.id).order("created_at", { ascending: false }).limit(100),
    supabase.rpc("online_payment_enabled", { p_school: schoolId }),
  ]);
  const rows = (ledger ?? []) as unknown as LedgerRow[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const spentToday = -rows.filter((r) => (r.kind === "purchase" || r.kind === "refund")
    && new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }) === today).reduce((n, r) => n + Number(r.amount), 0);
  const box = "peer sr-only";

  return (
    <>
      <PageHeader title="Saldo Kantin" subtitle={`${child.full_name} jajan di kantin sekolah dengan kartu pelajar, tanpa membawa uang tunai.`}
        actions={w?.is_frozen ? <Badge tone="bad">Kartu dibekukan</Badge> : undefined} />
      <ChildTabs items={children} active={child.id} base="/ortu/kantin" />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Saldo" value={rupiah(w?.balance ?? 0)} />
        <Stat label="Jajan hari ini" value={rupiah(spentToday)} hint={w?.daily_limit ? `Batas ${rupiah(w.daily_limit)} per hari` : "Tanpa batas harian"} />
        <Stat label="Status kartu" value={w?.is_frozen ? "Dibekukan" : "Aktif"} tone={w?.is_frozen ? "bad" : "good"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0"><CanteenLedger rows={rows} empty="Belum ada transaksi kantin." /></div>
        <div className="flex flex-col gap-6">
          <Card title="Isi saldo">
            <form action={topup} className="flex flex-col gap-4">
              <input type="hidden" name="student" value={child.id} />
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">Nominal</legend>
                <div className="grid grid-cols-2 gap-2">
                  {TOPUP_PRESETS.map((v, i) => (
                    <label key={v}>
                      <input type="radio" name="amount" value={v} defaultChecked={i === 1} className={box} />
                      <span className="block cursor-pointer rounded-lg border border-line px-3 py-2 text-center text-sm font-semibold tabular-nums text-ink peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand peer-focus-visible:ring-3 peer-focus-visible:ring-brand/30">
                        {rupiah(v)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Atau nominal lain (Rp)" hint="Rp10.000 sampai Rp1.000.000, kelipatan Rp1.000">
                <Input id="custom" name="custom" type="number" min={10000} max={1000000} step={1000} />
              </Field>
              <SubmitButton pendingLabel="Membuat tagihan…">Lanjut bayar</SubmitButton>
              <p className="text-xs text-muted">{online ? "Bayar online (VA, QRIS, e-wallet) atau di loket Tata Usaha." : "Bayar tagihannya di loket Tata Usaha."} Saldo bertambah otomatis setelah lunas.</p>
            </form>
          </Card>
          <Card title="Kartu jajan">
            <form action={controls} className="flex flex-col gap-4">
              <input type="hidden" name="student" value={child.id} />
              <CanteenControlFields limit={w?.daily_limit ?? null} frozen={w?.is_frozen ?? false} />
              <SubmitButton variant="secondary" className="w-fit" pendingLabel="Menyimpan…">Simpan</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
