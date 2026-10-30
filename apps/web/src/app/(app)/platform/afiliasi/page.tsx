import { requirePlatform } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal } from "@/lib/format";
import { AFFILIATE_STATUS_LABEL, AFFILIATE_STATUS_TONE, COMMISSION_LABEL, COMMISSION_TONE } from "@/lib/affiliate";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, Select, Stat, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Affiliator" };

async function review(fd: FormData) {
  "use server";
  await requirePlatform();
  await run("/platform/afiliasi", "Status affiliator diubah.", (sb) => sb.rpc("review_affiliate", {
    p_id: str(fd, "id"), p_status: str(fd, "status"),
    p_pct: optStr(fd, "pct") === null ? null : num(fd, "pct"),
    p_months: optStr(fd, "months") === null ? null : num(fd, "months"),
    p_note: optStr(fd, "note"),
  }));
}

async function pay(fd: FormData) {
  "use server";
  await requirePlatform();
  await run("/platform/afiliasi", "Komisi ditandai sudah ditransfer.", (sb) =>
    sb.rpc("pay_affiliate_commissions", { p_affiliate: str(fd, "id"), p_ref: optStr(fd, "ref") }));
}

export default async function PlatformAffiliates({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatform();
  const [{ data: rows }, { data: recent }] = await Promise.all([
    supabase.rpc("platform_affiliates"),
    supabase.from("affiliate_commissions").select("id, period, amount, status, schools(name), affiliates(code)")
      .order("created_at", { ascending: false }).limit(30),
  ]);
  const list = (rows ?? []) as any[];
  const total = (k: "pending" | "paid") => list.reduce((n, a) => n + Number(a[k]), 0);

  return (
    <>
      <PageHeader title="Affiliator" subtitle="Mitra yang mengajak sekolah, syarat komisi, dan pembayaran komisi (transfer manual)." />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Affiliator aktif" value={list.filter((a) => a.status === "active").length} />
        <Stat label="Menunggu persetujuan" value={list.filter((a) => a.status === "pending").length}
          tone={list.some((a) => a.status === "pending") ? "warn" : undefined} />
        <Stat label="Komisi harus ditransfer" value={rupiah(total("pending"))} tone={total("pending") ? "warn" : undefined} />
        <Stat label="Komisi sudah ditransfer" value={rupiah(total("paid"))} tone="good" />
      </div>
      <p className="mb-4 text-sm text-muted">
        Komisi dibuat otomatis saat tagihan langganan sekolah referral ditandai Lunas di menu Tagihan Langganan.
        Hubungkan sekolah lama ke affiliator dari menu Sekolah &amp; Paket.
      </p>
      <div className="flex flex-col gap-4">
        {!list.length && <Card><p className="text-sm text-muted">Belum ada pendaftar affiliator. Bagikan halaman /mitra.</p></Card>}
        {list.map((a) => (
          <Card key={a.id} title={`${a.full_name || a.email} · ${a.code}`}
            actions={<Badge tone={AFFILIATE_STATUS_TONE[a.status as keyof typeof AFFILIATE_STATUS_TONE]}>{AFFILIATE_STATUS_LABEL[a.status]}</Badge>}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Kontak</dt><dd>{a.email} · {a.phone ?? "–"}</dd>
                <dt className="text-muted">Rekening</dt><dd>{a.bank_name ? `${a.bank_name} ${a.bank_account} a.n. ${a.account_holder}` : "Belum diisi"}</dd>
                <dt className="text-muted">Mendaftar</dt><dd>{tanggal(a.created_at)}</dd>
                <dt className="text-muted">Sekolah</dt><dd className="tabular-nums">{a.schools}</dd>
                <dt className="text-muted">Komisi</dt><dd className="tabular-nums">{rupiah(a.pending)} menunggu · {rupiah(a.paid)} ditransfer</dd>
                {a.note && <><dt className="text-muted">Catatan</dt><dd className="text-pretty">“{a.note}”</dd></>}
              </dl>
              <div className="flex flex-col gap-3">
                <form action={review} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <Field label="Komisi (%)"><Input name="pct" inputMode="decimal" defaultValue={Number(a.commission_pct)} className="w-20" /></Field>
                  <Field label="Selama (bulan)"><Input name="months" inputMode="numeric" defaultValue={a.commission_months} className="w-20" /></Field>
                  <Field label="Status">
                    <Select name="status" defaultValue={a.status === "pending" ? "active" : a.status}>
                      <option value="active">Aktif</option><option value="suspended">Dibekukan</option><option value="rejected">Ditolak</option>
                    </Select>
                  </Field>
                  <Input name="note" placeholder="Catatan (opsional)" aria-label="Catatan" className="min-w-0 flex-1" />
                  <Button>{a.status === "pending" ? "Simpan & beri tahu" : "Simpan"}</Button>
                </form>
                {Number(a.pending) > 0 && (
                  <form action={pay} className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                    <input type="hidden" name="id" value={a.id} />
                    <Input name="ref" placeholder="No. referensi transfer" aria-label="Referensi transfer" className="min-w-0 flex-1" />
                    <SubmitButton>Tandai {rupiah(a.pending)} sudah ditransfer</SubmitButton>
                  </form>
                )}
              </div>
            </div>
          </Card>
        ))}
        <Card title="Komisi terbaru">
          <Table head={["Bulan", "Sekolah", "Affiliator", "Komisi", "Status"]} empty="Belum ada komisi.">
            {((recent ?? []) as any[]).map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">{new Date(c.period).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</td>
                <td>{c.schools?.name}</td>
                <td className="font-mono text-xs">{c.affiliates?.code}</td>
                <td className="tabular-nums font-bold">{rupiah(c.amount)}</td>
                <td><Badge tone={COMMISSION_TONE[c.status as keyof typeof COMMISSION_TONE]}>{COMMISSION_LABEL[c.status]}</Badge></td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
