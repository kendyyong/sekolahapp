import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { run, str } from "@/lib/actions";
import { rupiah, tanggal, todayJakarta, waktu } from "@/lib/format";
import { requireModule } from "@/lib/session";
import { APPROVERS, MANAGERS, RUN_STATUS, STAFF_SHORT, periodLabel, type RunStatus, type Slip } from "@/lib/payroll";
import { Badge, Card, DownloadLink, Field, Flash, Input, PageHeader, Select, Stat, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const ROLES = ["finance", "school_admin", "principal"] as const;
const page = (id: string) => `/gaji/${id}`;

async function refresh(fd: FormData) {
  "use server";
  await requireModule("payroll", "finance", "school_admin");
  const id = str(fd, "run");
  await run(page(id), "Slip dihitung ulang dari data terbaru.", (sb) => sb.rpc("payroll_refresh", { p_run: id }));
}

async function approve(fd: FormData) {
  "use server";
  await requireModule("payroll", "principal", "school_admin");
  const id = str(fd, "run");
  await run(page(id), "Penggajian disetujui. Tata Usaha akan memproses pembayaran.", (sb) => sb.rpc("payroll_approve", { p_run: id }));
}

async function reopen(fd: FormData) {
  "use server";
  await requireModule("payroll", ...ROLES);
  const id = str(fd, "run");
  await run(page(id), "Penggajian dibuka kembali sebagai draf.", (sb) => sb.rpc("payroll_reopen", { p_run: id }));
}

async function markPaid(fd: FormData) {
  "use server";
  await requireModule("payroll", "finance", "school_admin");
  const id = str(fd, "run");
  await run(page(id), "Gaji dicatat sudah dibayar. Pegawai mendapat notifikasi slip gaji.", (sb) =>
    sb.rpc("payroll_mark_paid", { p_run: id, p_method: str(fd, "method"), p_paid_on: str(fd, "paid_on") }));
}

async function removeRun(fd: FormData) {
  "use server";
  await requireModule("payroll", "finance", "school_admin");
  const id = str(fd, "run");
  await run(page(id), "Penggajian dihapus.", async (sb) => {
    const { data, error } = await sb.from("payroll_runs").delete().eq("id", id).eq("status", "draft").select("id");
    if (error) return { error };
    if (!data?.length) throw new Error("Hanya penggajian berstatus draf yang bisa dihapus");
  }, () => "/gaji");
}

interface Run {
  id: string; period: string; status: RunStatus; note: string | null; created_at: string; approved_at: string | null;
  paid_on: string | null; paid_method: string | null;
  creator: { full_name: string } | null; approver: { full_name: string } | null;
}

export default async function PayrollRun({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, active } = await requireModule("payroll", ...ROLES);
  const [{ data }, { data: slipRows }] = await Promise.all([
    supabase.from("payroll_runs").select("*, creator:profiles!payroll_runs_created_by_fkey(full_name), approver:profiles!payroll_runs_approved_by_fkey(full_name)")
      .eq("id", id).maybeSingle(),
    supabase.from("payslips").select("*").eq("run_id", id).order("full_name"),
  ]);
  if (!data) notFound();
  const r = data as unknown as Run;
  const slips = (slipRows ?? []) as Slip[];
  const manage = MANAGERS.includes(active.role);
  const canApprove = APPROVERS.includes(active.role);
  const sum = (k: "gross" | "deductions" | "net") => slips.reduce((n, s) => n + Number(s[k]), 0);
  const negative = slips.filter((s) => Number(s.net) < 0);
  const empty = slips.filter((s) => Number(s.gross) === 0);

  const actions = (
    <div className="flex flex-wrap gap-2">
      <DownloadLink href={`/unduh/gaji?run=${id}`}>Rekap & daftar transfer (Excel)</DownloadLink>
    </div>
  );

  return (
    <>
      <Link href="/gaji" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft aria-hidden className="size-4" /> Semua penggajian
      </Link>
      <PageHeader title={`Penggajian ${periodLabel(r.period)}`}
        subtitle={<>Dibuat {r.creator?.full_name ?? "–"} · {waktu(r.created_at)}{r.note ? ` · ${r.note}` : ""}</>}
        actions={actions} />
      <Flash searchParams={sp} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Status" value={<Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge>}
          hint={r.approver ? `Disetujui ${r.approver.full_name}${r.approved_at ? ` · ${waktu(r.approved_at)}` : ""}` : undefined} />
        <Stat label="Total pendapatan" value={rupiah(sum("gross"))} hint={`${slips.length} pegawai`} />
        <Stat label="Total potongan" value={rupiah(sum("deductions"))} />
        <Stat label="Total gaji bersih" value={rupiah(sum("net"))} tone="good"
          hint={r.paid_on ? `Dibayar ${tanggal(r.paid_on)} · ${r.paid_method === "transfer" ? "transfer bank" : "tunai"}` : undefined} />
      </div>

      {negative.length > 0 && (
        <p role="alert" className="mb-4 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          Gaji bersih minus untuk {negative.map((s) => s.full_name).join(", ")}. Periksa potongan atau penyesuaiannya.
        </p>
      )}

      {r.status === "draft" && empty.length > 0 && (
        <p className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          {empty.length} pegawai belum punya pendapatan bulan ini ({empty.map((s) => s.full_name).join(", ")}). Lengkapi gaji pokok di{" "}
          <Link href="/gaji/pegawai" className="font-semibold underline">data pegawai</Link> lalu hitung ulang, atau keluarkan dari slipnya.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Table head={["Pegawai", "Hadir", "JP", "Pendapatan", "Potongan", "Gaji bersih", ""]} empty="Belum ada slip. Tambahkan pegawai lalu hitung ulang.">
          {slips.map((s) => (
            <tr key={s.id}>
              <td>
                <div className="font-semibold text-ink">{s.full_name}</div>
                <div className="text-xs text-muted">{[s.position, STAFF_SHORT[s.status]].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="whitespace-nowrap tabular-nums text-muted">
                {s.attendance.hadir + s.attendance.terlambat + s.attendance.dinas}
                {s.attendance.terlambat > 0 && <span className="text-warn"> · T{s.attendance.terlambat}</span>}
                {s.attendance.alpa > 0 && <span className="text-bad"> · A{s.attendance.alpa}</span>}
              </td>
              <td className="tabular-nums text-muted">{s.attendance.jp || "–"}</td>
              <td className="tabular-nums">{rupiah(s.gross)}</td>
              <td className="tabular-nums">{rupiah(s.deductions)}</td>
              <td className="font-semibold tabular-nums">{rupiah(s.net)}{s.adjustments.length > 0 && <Badge tone="info">+{s.adjustments.length} penyesuaian</Badge>}</td>
              <td className="text-right"><Link href={`/gaji/slip/${s.id}`} className="text-sm font-semibold text-brand">Slip</Link></td>
            </tr>
          ))}
        </Table>

        <div className="flex flex-col gap-6">
          {r.status === "draft" && (
            <Card title="Langkah berikutnya">
              <div className="flex flex-col gap-3 text-sm">
                {manage && (
                  <>
                    <p className="text-muted">Buka slip untuk menambah penyesuaian seperti lembur, THR, atau kasbon. Absensi dan data pegawai yang berubah ikut terhitung setelah dihitung ulang.</p>
                    <form action={refresh}><input type="hidden" name="run" value={id} />
                      <SubmitButton variant="secondary" pendingLabel="Menghitung…" className="w-full">Hitung ulang semua slip</SubmitButton>
                    </form>
                  </>
                )}
                {canApprove ? (
                  <form action={approve}><input type="hidden" name="run" value={id} />
                    <SubmitButton pendingLabel="Menyetujui…" className="w-full">Setujui penggajian</SubmitButton>
                  </form>
                ) : (
                  <p className="rounded-lg bg-paper px-3 py-2 text-muted">Setelah slip benar, kepala sekolah menyetujui dari menu Persetujuan Gaji.</p>
                )}
                {manage && (
                  <form action={removeRun}><input type="hidden" name="run" value={id} />
                    <SubmitButton variant="ghost" className="-ml-3 text-bad hover:bg-bad-soft">Hapus penggajian ini</SubmitButton>
                  </form>
                )}
              </div>
            </Card>
          )}
          {r.status === "approved" && (
            <Card title="Bayar gaji">
              {manage ? (
                <form action={markPaid} className="flex flex-col gap-4">
                  <input type="hidden" name="run" value={id} />
                  <Field label="Tanggal dibayar"><Input id="paid_on" name="paid_on" type="date" defaultValue={todayJakarta()} required /></Field>
                  <Field label="Cara bayar">
                    <Select id="method" name="method" defaultValue="transfer"><option value="transfer">Transfer bank</option><option value="tunai">Tunai</option></Select>
                  </Field>
                  <SubmitButton pendingLabel="Menyimpan…">Tandai sudah dibayar</SubmitButton>
                  <p className="text-xs text-muted">Unduh daftar transfer (Excel) untuk diunggah ke internet banking. Setelah ditandai dibayar, tiap pegawai bisa melihat slipnya.</p>
                </form>
              ) : <p className="text-sm text-muted">Menunggu Tata Usaha membayar dan mencatatnya.</p>}
              <form action={reopen} className="mt-4 border-t border-line pt-3"><input type="hidden" name="run" value={id} />
                <SubmitButton variant="ghost" className="-ml-3">Buka kembali untuk diperbaiki</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
