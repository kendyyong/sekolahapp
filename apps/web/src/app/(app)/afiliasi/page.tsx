import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal } from "@/lib/format";
import { AFFILIATE_STATUS_LABEL, AFFILIATE_STATUS_TONE, AFFILIATE_TERMS, COMMISSION_LABEL, COMMISSION_TONE } from "@/lib/affiliate";
import { Badge, Card, Field, Flash, Input, PageHeader, Stat, Table, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PLAN_LABEL, PLAN_TONE } from "../platform/plans";

export const metadata = { title: "Program Affiliator" };

async function apply(fd: FormData) {
  "use server";
  await run("/afiliasi", "Data affiliator disimpan.", async (sb) => {
    const r = await sb.rpc("apply_affiliate", {
      p_phone: str(fd, "phone"), p_bank_name: str(fd, "bank_name"), p_bank_account: str(fd, "bank_account"),
      p_account_holder: str(fd, "account_holder"), p_note: optStr(fd, "note"),
    });
    if (!r.error) await sb.auth.updateUser({ data: { pending_affiliate: null } });
    return r;
  });
}

export default async function AffiliatePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await getSession();
  const [{ data: aff }, { data: schools }, { data: commissions }] = await Promise.all([
    supabase.from("affiliates").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("my_affiliate_schools"),
    supabase.from("affiliate_commissions").select("id, period, base_amount, pct, amount, status, paid_at, payout_ref, schools(name)")
      .order("period", { ascending: false }).limit(50),
  ]);
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const pendingPhone = (user.user_metadata?.pending_affiliate as { phone?: string } | undefined)?.phone;
  const list = (schools ?? []) as any[];
  const sum = (k: "earned" | "pending") => list.reduce((n, s) => n + Number(s[k]), 0);

  const form = (
    <form action={apply} className="flex flex-col gap-4">
      <Field label="Nomor HP/WhatsApp"><Input name="phone" type="tel" required minLength={8} defaultValue={aff?.phone ?? pendingPhone ?? profile?.phone ?? ""} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bank / e-wallet"><Input name="bank_name" placeholder="BCA, BRI, DANA…" defaultValue={aff?.bank_name ?? ""} /></Field>
        <Field label="Nomor rekening"><Input name="bank_account" inputMode="numeric" defaultValue={aff?.bank_account ?? ""} /></Field>
      </div>
      <Field label="Nama pemilik rekening"><Input name="account_holder" defaultValue={aff?.account_holder ?? profile?.full_name ?? ""} /></Field>
      {!aff && (
        <Field label="Ceritakan sedikit tentang Anda (opsional)" hint="Misalnya: guru, pengawas, operator sekolah; wilayah atau jaringan sekolah yang Anda kenal.">
          <Textarea name="note" rows={3} />
        </Field>
      )}
      <SubmitButton>{aff ? "Simpan data rekening" : "Daftar jadi affiliator"}</SubmitButton>
    </form>
  );

  if (!aff) {
    return (
      <>
        <PageHeader title="Program Affiliator" subtitle="Kenalkan SekolahApp ke sekolah dan dapatkan komisi dari biaya langganannya." />
        <Flash searchParams={sp} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card title="Daftar jadi affiliator">{form}</Card>
          <Card title="Ketentuan" className="h-fit">
            <ul className="flex list-disc flex-col gap-2 pl-4 text-sm text-muted">
              <li>Komisi {AFFILIATE_TERMS.pct}% dari biaya langganan bulanan sekolah yang mendaftar dengan kode Anda.</li>
              <li>Berlaku {AFFILIATE_TERMS.months} bulan sejak sekolah terdaftar.</li>
              <li>Dihitung dari tagihan yang sudah dibayar sekolah, lalu ditransfer ke rekening Anda.</li>
              <li>Sekolah yang Anda kelola sendiri tidak menghasilkan komisi.</li>
            </ul>
          </Card>
        </div>
      </>
    );
  }

  const link = `${origin}/daftar?ref=${aff.code}`;
  return (
    <>
      <PageHeader title="Program Affiliator" subtitle="Sekolah yang Anda ajak dan komisi yang Anda peroleh."
        actions={<Badge tone={AFFILIATE_STATUS_TONE[aff.status as keyof typeof AFFILIATE_STATUS_TONE]}>{AFFILIATE_STATUS_LABEL[aff.status]}</Badge>} />
      <Flash searchParams={sp} />
      {aff.status === "pending" && (
        <p className="mb-6 rounded-lg border border-line bg-sheet p-4 text-sm text-muted">
          Pendaftaran Anda sedang ditinjau. Anda akan mendapat notifikasi setelah kode affiliator aktif.
        </p>
      )}
      {(aff.status === "suspended" || aff.status === "rejected") && (
        <p className="mb-6 rounded-lg border border-line bg-sheet p-4 text-sm text-muted">
          {aff.status === "suspended" ? "Akun affiliator Anda dibekukan; kode tidak bisa dipakai sekolah baru." : "Pendaftaran affiliator Anda ditolak."}
          {aff.review_note && <> Catatan: “{aff.review_note}”</>}
        </p>
      )}
      {aff.status === "active" && (
        <Card title="Kode & tautan Anda" className="mb-6">
          <div className="flex flex-col gap-3">
            <div className="text-3xl font-extrabold tracking-widest text-brand">{aff.code}</div>
            <Field label="Tautan pendaftaran sekolah" hint="Bagikan tautan ini. Kode langsung terisi di formulir pendaftaran sekolah.">
              <Input readOnly value={link} className="font-mono text-xs" />
            </Field>
            <p className="text-sm text-muted">
              Komisi Anda {Number(aff.commission_pct).toLocaleString("id-ID")}% dari biaya langganan sekolah selama {aff.commission_months} bulan sejak sekolah terdaftar.
            </p>
          </div>
        </Card>
      )}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Sekolah referral" value={list.length} />
        <Stat label="Menunggu transfer" value={rupiah(sum("pending"))} tone={sum("pending") ? "warn" : undefined} />
        <Stat label="Sudah ditransfer" value={rupiah(sum("earned"))} tone="good" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Sekolah referral">
            <Table head={["Sekolah", "Paket", "Murid aktif", "Terdaftar", "Komisi sampai", "Diperoleh"]} empty="Belum ada sekolah yang mendaftar dengan kode Anda.">
              {list.map((s) => (
                <tr key={s.school_id}>
                  <td className="font-semibold">{s.name}<div className="text-xs text-muted">{s.level}</div></td>
                  <td><Badge tone={PLAN_TONE[s.plan as keyof typeof PLAN_TONE]}>{PLAN_LABEL[s.plan]}</Badge></td>
                  <td className="tabular-nums">{s.students}</td>
                  <td className="whitespace-nowrap">{tanggal(s.referred_at)}</td>
                  <td className="whitespace-nowrap">{tanggal(s.commission_until)}</td>
                  <td className="tabular-nums">{rupiah(Number(s.earned) + Number(s.pending))}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Riwayat komisi">
            <Table head={["Bulan", "Sekolah", "Langganan", "Komisi", "Status"]} empty="Komisi muncul setelah sekolah referral membayar tagihan langganan.">
              {((commissions ?? []) as any[]).map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{new Date(c.period).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</td>
                  <td>{c.schools?.name}</td>
                  <td className="tabular-nums">{rupiah(c.base_amount)} × {Number(c.pct).toLocaleString("id-ID")}%</td>
                  <td className="tabular-nums font-bold">{rupiah(c.amount)}</td>
                  <td>
                    <Badge tone={COMMISSION_TONE[c.status as keyof typeof COMMISSION_TONE]}>{COMMISSION_LABEL[c.status]}</Badge>
                    {c.paid_at && <div className="text-xs text-muted">{tanggal(c.paid_at)}{c.payout_ref ? ` · ${c.payout_ref}` : ""}</div>}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        <Card title="Rekening penerima komisi" className="h-fit">{form}</Card>
      </div>
    </>
  );
}
