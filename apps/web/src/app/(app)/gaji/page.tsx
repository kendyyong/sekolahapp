import Link from "next/link";
import { optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal, todayJakarta } from "@/lib/format";
import { requireModule } from "@/lib/session";
import { MANAGERS, RUN_STATUS, periodLabel, type RunStatus } from "@/lib/payroll";
import { Badge, Card, Field, Flash, Input, PageHeader, Stat, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PayrollTabs } from "./tabs";

const ROLES = ["finance", "school_admin", "principal"] as const;

async function createRun(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("payroll", "finance", "school_admin");
  let id = "";
  await run("/gaji", "Penggajian dibuat. Periksa slip, beri penyesuaian bila perlu, lalu minta persetujuan kepala sekolah.", async (sb) => {
    const { data, error } = await sb.rpc("payroll_create_run", { p_school: schoolId, p_period: `${str(fd, "period")}-01`, p_note: optStr(fd, "note") });
    if (error) return { error };
    id = data as string;
  }, () => `/gaji/${id}`);
}

interface RunRow { id: string; period: string; status: RunStatus; note: string | null; paid_on: string | null; payslips: { net: number }[] }

export default async function PayrollRuns({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId, active } = await requireModule("payroll", ...ROLES);
  const manage = MANAGERS.includes(active.role);
  const [{ data }, { count: employees }] = await Promise.all([
    supabase.from("payroll_runs").select("id, period, status, note, paid_on, payslips(net)").eq("school_id", schoolId)
      .order("period", { ascending: false }).limit(36),
    supabase.from("payroll_employees").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("is_active", true),
  ]);
  const runs = (data ?? []) as RunRow[];
  const total = (r: RunRow) => r.payslips.reduce((n, s) => n + Number(s.net), 0);
  const waiting = runs.filter((r) => r.status === "draft").length;
  const lastPaid = runs.find((r) => r.status === "paid");
  const thisMonth = todayJakarta().slice(0, 7);

  return (
    <>
      <PageHeader title="Penggajian" subtitle="Gaji guru & staf dihitung dari gaji pokok, komponen gaji, absensi, dan jam mengajar. Slip disetujui kepala sekolah sebelum dibayar." />
      <Flash searchParams={sp} />
      <PayrollTabs active="runs" manage={manage} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Pegawai aktif" value={employees ?? 0} hint={manage ? <Link href="/gaji/pegawai" className="text-brand">Kelola data pegawai</Link> : undefined} />
        <Stat label={active.role === "principal" ? "Menunggu persetujuan Anda" : "Draf penggajian"} value={waiting} tone={waiting ? "warn" : undefined} />
        <Stat label="Gaji terakhir dibayar" value={lastPaid ? rupiah(total(lastPaid)) : "–"} hint={lastPaid ? periodLabel(lastPaid.period) : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Table head={["Periode", "Status", "Pegawai", "Total gaji bersih", ""]} empty="Belum ada penggajian.">
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="font-semibold">
                <Link href={`/gaji/${r.id}`} className="text-brand hover:underline">{periodLabel(r.period)}</Link>
                {r.note && <div className="text-xs font-normal text-muted">{r.note}</div>}
              </td>
              <td>
                <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge>
                {r.paid_on && <div className="mt-1 text-xs text-muted">{tanggal(r.paid_on)}</div>}
              </td>
              <td className="tabular-nums">{r.payslips.length}</td>
              <td className="font-semibold tabular-nums">{rupiah(total(r))}</td>
              <td className="text-right"><Link href={`/gaji/${r.id}`} className="text-sm font-semibold text-brand">Buka</Link></td>
            </tr>
          ))}
        </Table>
        {manage && (
          <Card title="Buat penggajian" className="h-fit">
            <form action={createRun} className="flex flex-col gap-4">
              <Field label="Bulan"><Input id="period" name="period" type="month" defaultValue={thisMonth} required /></Field>
              <Field label="Catatan (opsional)"><Input id="note" name="note" maxLength={500} placeholder="Contoh: termasuk THR" /></Field>
              <SubmitButton pendingLabel="Menghitung…">Buat & hitung slip</SubmitButton>
              <p className="text-xs text-muted">
                Slip dihitung dari data pegawai aktif, komponen gaji, absensi guru bulan itu, dan jadwal mengajar. Bisa dihitung ulang selama masih draf.
              </p>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
