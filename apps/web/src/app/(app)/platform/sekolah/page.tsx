import Link from "next/link";
import { requirePlatform } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal } from "@/lib/format";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, Select, Table, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PAYMENT_LABEL, PLAN_LABEL, PLAN_TONE } from "../plans";

async function saveSchool(fd: FormData) {
  "use server";
  await requirePlatform();
  const id = str(fd, "id");
  await run(`/platform/sekolah?id=${id}`, "Data sekolah disimpan.", async (sb) => {
    const { data: s, error } = await sb.from("schools").select("settings").eq("id", id).single();
    if (error) return { error };
    const custom = optStr(fd, "custom_price");
    const settings = { ...(s.settings as Record<string, unknown>) };
    if (custom === null) delete settings.custom_price_per_student; else settings.custom_price_per_student = num(fd, "custom_price");
    let foundationId = optStr(fd, "foundation_id");
    const newFoundation = optStr(fd, "new_foundation");
    if (newFoundation) {
      const f = await sb.from("foundations").insert({ name: newFoundation }).select("id").single();
      if (f.error) return f;
      foundationId = f.data.id;
    }
    return sb.from("schools").update({
      plan: str(fd, "plan"), is_active: str(fd, "is_active") === "true", foundation_id: foundationId, settings,
    }).eq("id", id);
  });
}

async function savePayment(fd: FormData) {
  "use server";
  await requirePlatform();
  const id = str(fd, "id");
  await run(`/platform/sekolah?id=${id}`, "Akun pembayaran disimpan.", (sb) => sb.from("school_payment_accounts").upsert({
    school_id: id, sub_account_id: str(fd, "sub_account_id"), status: str(fd, "status"), service_fee_bearer: str(fd, "bearer"),
  }));
}

async function addFoundationAdmin(fd: FormData) {
  "use server";
  await requirePlatform();
  const id = str(fd, "id");
  await run(`/platform/sekolah?id=${id}`, "Admin yayasan ditambahkan.", async (sb) => {
    const { data: p } = await sb.from("profiles").select("id").ilike("email", str(fd, "email")).maybeSingle();
    if (!p) throw new Error("Akun dengan email itu belum ada. Minta orangnya mendaftar dulu di /daftar atau buatkan akun.");
    return sb.from("foundation_admins").upsert({ foundation_id: str(fd, "foundation_id"), user_id: p.id });
  });
}

export default async function PlatformSchools({ searchParams }: { searchParams: Promise<{ id?: string; q?: string; paket?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requirePlatform();
  const [{ data: rows }, { data: foundations }] = await Promise.all([
    supabase.rpc("platform_schools"),
    supabase.from("foundations").select("id, name").order("name"),
  ]);
  const q = (sp.q ?? "").toLowerCase();
  const list = ((rows ?? []) as any[]).filter((s) =>
    (!q || `${s.name} ${s.npsn ?? ""} ${s.admin_email ?? ""}`.toLowerCase().includes(q)) && (!sp.paket || s.plan === sp.paket));
  const sel = ((rows ?? []) as any[]).find((s) => s.id === sp.id);
  const [{ data: detail }, { data: account }, { data: fAdmins }] = sel ? await Promise.all([
    supabase.from("schools").select("foundation_id, settings, address, phone").eq("id", sel.id).single(),
    supabase.from("school_payment_accounts").select("sub_account_id, status, service_fee_bearer").eq("school_id", sel.id).maybeSingle(),
    supabase.from("schools").select("foundation_id, foundations(foundation_admins(profiles(full_name, email)))").eq("id", sel.id).single(),
  ]) : [{ data: null }, { data: null }, { data: null }];
  const admins = ((fAdmins as any)?.foundations?.foundation_admins ?? []).map((a: any) => a.profiles);

  return (
    <>
      <PageHeader title="Sekolah & Paket" subtitle={`${list.length} sekolah`} />
      <Flash searchParams={sp} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Cari"><Input name="q" defaultValue={sp.q} placeholder="Nama, NPSN, email admin" /></Field>
        <Field label="Paket">
          <Select name="paket" defaultValue={sp.paket ?? ""}>
            <option value="">Semua</option>
            {Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Button variant="secondary">Tampilkan</Button>
      </form>
      <div className={cx("grid gap-6", sel && "xl:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className="min-w-0">
          <Table head={["Sekolah", "Paket", "Murid", "Nilai/bulan", "Pembayaran", "Tagihan terbuka"]} empty="Tidak ada sekolah.">
            {list.map((s) => (
              <tr key={s.id} className={cx(s.id === sel?.id && "bg-brand-soft/50", !s.is_active && "opacity-60")}>
                <td>
                  <Link href={`/platform/sekolah?id=${s.id}`} className="font-semibold text-brand">{s.name}</Link>
                  <div className="text-xs text-muted">{[s.level, s.foundation_name, s.admin_email].filter(Boolean).join(" · ")}</div>
                </td>
                <td><Badge tone={PLAN_TONE[s.plan as keyof typeof PLAN_TONE]}>{PLAN_LABEL[s.plan]}</Badge>{!s.is_active && <Badge tone="bad">Nonaktif</Badge>}</td>
                <td className="tabular-nums">{s.students}</td>
                <td className="tabular-nums">{rupiah(s.monthly_value)}</td>
                <td>{s.payment_status ? <Badge tone={s.payment_status === "live" ? "good" : "warn"}>{PAYMENT_LABEL[s.payment_status]}</Badge> : <span className="text-muted">–</span>}</td>
                <td className="tabular-nums">{s.open_bills ? rupiah(s.open_bills) : "–"}</td>
              </tr>
            ))}
          </Table>
        </div>
        {sel && detail ? (
          <div className="flex flex-col gap-4">
            <Card title={sel.name}>
              <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">Admin</dt><dd>{sel.admin_name ?? "–"}<div className="text-xs text-muted">{sel.admin_email}</div></dd>
                <dt className="text-muted">NPSN</dt><dd>{sel.npsn ?? "–"}</dd>
                <dt className="text-muted">Murid / staf</dt><dd className="tabular-nums">{sel.students} / {sel.staff}</dd>
                <dt className="text-muted">Harga</dt><dd className="tabular-nums">{rupiah(sel.price_per_student)}/murid</dd>
                <dt className="text-muted">Terdaftar</dt><dd>{tanggal(sel.created_at)}</dd>
              </dl>
              <form action={saveSchool} className="flex flex-col gap-3 border-t border-line pt-3">
                <input type="hidden" name="id" value={sel.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Paket">
                    <Select name="plan" defaultValue={sel.plan}>{Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </Field>
                  <Field label="Status">
                    <Select name="is_active" defaultValue={String(sel.is_active)}><option value="true">Aktif</option><option value="false">Nonaktif</option></Select>
                  </Field>
                </div>
                <Field label="Harga khusus per murid (Rp)" hint="Kosongkan untuk memakai harga paket.">
                  <Input name="custom_price" inputMode="numeric" defaultValue={(detail.settings as any)?.custom_price_per_student ?? ""} />
                </Field>
                <Field label="Yayasan">
                  <Select name="foundation_id" defaultValue={detail.foundation_id ?? ""}>
                    <option value="">Tanpa yayasan</option>
                    {(foundations ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                </Field>
                <Field label="Atau buat yayasan baru"><Input name="new_foundation" placeholder="Nama yayasan" /></Field>
                <SubmitButton>Simpan</SubmitButton>
              </form>
            </Card>
            <Card title="Akun pembayaran (Xendit)">
              <form action={savePayment} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={sel.id} />
                <Field label="ID sub-akun xenPlatform"><Input name="sub_account_id" required defaultValue={account?.sub_account_id ?? ""} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <Select name="status" defaultValue={account?.status ?? "pending"}>{Object.entries(PAYMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  </Field>
                  <Field label="Biaya layanan ditanggung">
                    <Select name="bearer" defaultValue={account?.service_fee_bearer ?? "payer"}><option value="payer">Orang tua</option><option value="school">Sekolah</option></Select>
                  </Field>
                </div>
                <SubmitButton variant="secondary">Simpan akun pembayaran</SubmitButton>
              </form>
            </Card>
            {detail.foundation_id && (
              <Card title="Admin yayasan">
                {!admins.length ? <p className="mb-3 text-sm text-muted">Belum ada admin yayasan.</p> : (
                  <ul className="mb-3 flex flex-col gap-1 text-sm">{admins.map((a: any) => <li key={a.email}>{a.full_name} <span className="text-muted">· {a.email}</span></li>)}</ul>
                )}
                <form action={addFoundationAdmin} className="flex gap-2">
                  <input type="hidden" name="id" value={sel.id} /><input type="hidden" name="foundation_id" value={detail.foundation_id} />
                  <Input name="email" type="email" required placeholder="email@yayasan.or.id" aria-label="Email admin yayasan" className="min-w-0 flex-1" />
                  <SubmitButton variant="secondary">Tambah</SubmitButton>
                </form>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
