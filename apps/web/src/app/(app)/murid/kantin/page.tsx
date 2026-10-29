import { requireModule } from "@/lib/session";
import { rupiah } from "@/lib/format";
import { myStudent } from "@/lib/queries";
import { LEDGER_COLUMNS, type LedgerRow } from "@/lib/canteen";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { CanteenLedger } from "@/components/canteen-ledger";

export default async function StudentCanteen() {
  const { supabase, user, schoolId } = await requireModule("canteen", "student");
  const me = await myStudent(supabase, user.id, schoolId);
  if (!me) return (<><PageHeader title="Saldo Kantin" /><Empty>Data murid tidak ditemukan.</Empty></>);
  const [{ data: w }, { data: ledger }] = await Promise.all([
    supabase.from("canteen_wallets").select("balance, daily_limit, is_frozen").eq("student_id", me.id).maybeSingle(),
    supabase.from("canteen_ledger").select(LEDGER_COLUMNS).eq("student_id", me.id).order("created_at", { ascending: false }).limit(60),
  ]);
  return (
    <>
      <PageHeader title="Saldo Kantin" subtitle="Tempelkan kartu pelajar di kasir kantin untuk jajan. Saldo diisi orang tua."
        actions={w?.is_frozen ? <Badge tone="bad">Kartu dibekukan orang tua</Badge> : undefined} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Saldo" value={rupiah(w?.balance ?? 0)} />
        <Stat label="Batas jajan per hari" value={w?.daily_limit ? rupiah(w.daily_limit) : "Tanpa batas"} />
      </div>
      <CanteenLedger rows={(ledger ?? []) as unknown as LedgerRow[]} />
    </>
  );
}
