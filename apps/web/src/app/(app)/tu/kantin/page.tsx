import Link from "next/link";
import { num, optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal, todayJakarta, waktu } from "@/lib/format";
import { requireModule, ROLE_LABEL, type Role } from "@/lib/session";
import { Badge, Button, Card, DownloadLink, Field, Flash, Input, PageHeader, Select, Stat, Table, Tabs } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const ROLES = ["finance", "school_admin"] as const;
const OPERATOR_ROLES: Role[] = ["canteen", "finance", "teacher", "school_admin"];
const page = (tab: string) => `/tu/kantin?tab=${tab}`;
const box = "size-4 accent-[var(--color-brand-solid)]";

/** Isi atau tarik saldo tunai di loket dengan NIS / kartu. */
async function cash(fd: FormData) {
  "use server";
  const { supabase, schoolId } = await requireModule("canteen", ...ROLES);
  const withdraw = str(fd, "mode") === "withdraw";
  const code = str(fd, "code").replace(/^sekolahapp:card:/i, "");
  let name = "";
  await run(page("saldo"), () => `${withdraw ? "Saldo ditarik" : "Saldo diisi"}: ${name}.`, async (sb) => {
    const { data: s } = await supabase.from("students").select("id, full_name").eq("school_id", schoolId)
      .or(`nis.eq.${code.replace(/[^\w-]/g, "")},card_token.eq.${code.toLowerCase().replace(/[^\w-]/g, "")}`).maybeSingle();
    if (!s) throw new Error("NIS atau kartu tidak ditemukan");
    name = s.full_name;
    return sb.rpc("canteen_cash", { p_student: s.id, p_amount: num(fd, "amount"), p_withdraw: withdraw, p_note: optStr(fd, "note") });
  });
}

async function saveStall(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("canteen", ...ROLES);
  const id = optStr(fd, "id");
  const row = {
    name: str(fd, "name"), commission_pct: num(fd, "commission_pct"), is_active: id ? fd.get("is_active") === "on" : true,
    operator_ids: fd.getAll("operator").map(String),
  };
  await run(page("kios"), id ? "Kios disimpan." : "Kios ditambahkan. Atur menunya dari halaman Kasir.", (sb) =>
    id ? sb.from("canteen_stalls").update(row).eq("id", id) : sb.from("canteen_stalls").insert({ ...row, school_id: schoolId }));
}

async function saveSettings(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("canteen", ...ROLES);
  await run(page("kios"), "Pengaturan kantin disimpan.", async (sb) => {
    const low = num(fd, "low"), max = num(fd, "max");
    if (!(low >= 0 && max >= 50000 && max <= 10000000)) throw new Error("Saldo maksimal Rp50.000 sampai Rp10.000.000");
    const { data: s, error } = await sb.from("schools").select("settings").eq("id", schoolId).single();
    if (error) return { error };
    return sb.from("schools").update({ settings: { ...(s.settings as object), canteen_low_balance: low, canteen_max_balance: max } }).eq("id", schoolId);
  });
}

async function settle(fd: FormData) {
  "use server";
  await requireModule("canteen", ...ROLES);
  let net = 0;
  await run(page("setoran"), () => `Setoran dicatat. Serahkan ${rupiah(net)} ke kios.`, async (sb) => {
    const { data, error } = await sb.rpc("canteen_settle", { p_stall: str(fd, "stall"), p_until: str(fd, "until"), p_note: optStr(fd, "note") });
    if (error) return { error };
    net = Number((data as { net: number }).net);
  });
}

type Tab = "saldo" | "kios" | "setoran";

export default async function CanteenAdmin({ searchParams }: {
  searchParams: Promise<{ tab?: string; kelas?: string; q?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === "kios" || sp.tab === "setoran" ? sp.tab : "saldo";
  const { supabase, schoolId } = await requireModule("canteen", ...ROLES);
  const [{ data: stallRows }, { data: wallets }, { data: today }] = await Promise.all([
    supabase.from("canteen_stalls").select("id, name, commission_pct, is_active, operator_ids").eq("school_id", schoolId).order("name"),
    supabase.from("canteen_wallets").select("balance").eq("school_id", schoolId).limit(10000),
    supabase.from("canteen_ledger").select("amount, kind").eq("school_id", schoolId).in("kind", ["purchase", "refund"])
      .gte("created_at", new Date(todayJakarta() + "T00:00:00+07:00").toISOString()).limit(10000),
  ]);
  const stalls = (stallRows ?? []) as { id: string; name: string; commission_pct: number; is_active: boolean; operator_ids: string[] }[];
  const totalBalance = (wallets ?? []).reduce((n, w) => n + Number(w.balance), 0);
  const salesToday = -(today ?? []).reduce((n, r) => n + Number(r.amount), 0);

  let body: React.ReactNode;
  if (tab === "saldo") {
    const { data: classes } = await supabase.from("classes").select("id, name, academic_years!inner(is_active)")
      .eq("school_id", schoolId).eq("academic_years.is_active", true).order("grade_level").order("name");
    let q = supabase.from("students")
      .select("id, full_name, nis, enrollments(class_id, classes(name, academic_years!inner(is_active))), canteen_wallets(balance, daily_limit, is_frozen)")
      .eq("school_id", schoolId).eq("status", "aktif").order("full_name").limit(300);
    if (sp.q) q = q.ilike("full_name", `%${sp.q}%`);
    const { data: students } = await q;
    const rows = ((students ?? []) as any[]).map((s) => {
      const enr = (s.enrollments ?? []).find((e: any) => e.classes?.academic_years?.is_active);
      return { id: s.id as string, full_name: s.full_name as string, nis: s.nis as string | null, class_id: enr?.class_id as string | undefined,
        class_name: enr?.classes?.name as string | undefined, wallet: (Array.isArray(s.canteen_wallets) ? s.canteen_wallets[0] : s.canteen_wallets) as
          { balance: number; daily_limit: number | null; is_frozen: boolean } | null };
    }).filter((s) => !sp.kelas || s.class_id === sp.kelas);
    body = (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <form className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="saldo" />
            <Field label="Kelas">
              <Select id="kelas" name="kelas" defaultValue={sp.kelas ?? ""}>
                <option value="">Semua kelas</option>
                {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Cari nama"><Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Nama murid" /></Field>
            <Button variant="secondary">Tampilkan</Button>
          </form>
          <Table head={["Murid", "Kelas", "Saldo", "Batas harian", ""]} empty="Tidak ada murid.">
            {rows.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/tu/kantin/murid/${s.id}`} className="font-semibold text-brand">{s.full_name}</Link><div className="text-xs text-muted">{s.nis ?? ""}</div></td>
                <td className="text-sm">{s.class_name ?? "–"}</td>
                <td className="text-right font-semibold tabular-nums">{rupiah(s.wallet?.balance ?? 0)}</td>
                <td className="text-right text-sm tabular-nums">{s.wallet?.daily_limit ? rupiah(s.wallet.daily_limit) : "–"}</td>
                <td>{s.wallet?.is_frozen && <Badge tone="bad">Dibekukan</Badge>}</td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="Isi / tarik saldo tunai" className="h-fit">
          <form action={cash} className="flex flex-col gap-4">
            <Field label="NIS atau pindai kartu"><Input id="code" name="code" required autoComplete="off" placeholder="Contoh: 2601" /></Field>
            <Field label="Nominal (Rp)"><Input id="amount" name="amount" type="number" min={1000} step={1000} required /></Field>
            <Field label="Catatan (opsional)"><Input id="note" name="note" maxLength={300} /></Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="topup" defaultChecked className={box} />Isi saldo</label>
              <label className="flex items-center gap-2"><input type="radio" name="mode" value="withdraw" className={box} />Tarik tunai</label>
            </div>
            <SubmitButton pendingLabel="Menyimpan…">Simpan</SubmitButton>
            <p className="text-xs text-muted">Orang tua mendapat notifikasi. Orang tua juga bisa mengisi saldo sendiri lewat menu Saldo Kantin (bayar online atau di loket).</p>
          </form>
        </Card>
      </div>
    );
  } else if (tab === "kios") {
    const [{ data: members }, { data: school }] = await Promise.all([
      supabase.from("memberships").select("user_id, role, profiles(full_name)").eq("school_id", schoolId).eq("is_active", true)
        .in("role", OPERATOR_ROLES),
      supabase.from("schools").select("settings").eq("id", schoolId).single(),
    ]);
    const people = new Map<string, { name: string; roles: string[] }>();
    for (const m of (members ?? []) as any[]) {
      const p = people.get(m.user_id) ?? { name: m.profiles?.full_name ?? "?", roles: [] as string[] };
      p.roles.push(ROLE_LABEL[m.role as Role]);
      people.set(m.user_id, p);
    }
    const sorted = [...people.entries()].sort((a, b) => Number(b[1].roles.includes(ROLE_LABEL.canteen)) - Number(a[1].roles.includes(ROLE_LABEL.canteen)) || a[1].name.localeCompare(b[1].name));
    const st = (school?.settings ?? {}) as Record<string, unknown>;
    const fields = (s?: (typeof stalls)[number]) => (
      <>
        {s && <input type="hidden" name="id" value={s.id} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama kios"><Input name="name" required minLength={2} maxLength={80} defaultValue={s?.name} placeholder="Contoh: Kantin Bu Rini" /></Field>
          <Field label="Bagi hasil sekolah (%)" hint="Dipotong saat setoran"><Input name="commission_pct" type="number" min={0} max={100} step={0.5} defaultValue={s?.commission_pct ?? 0} /></Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Petugas kasir</legend>
          {!sorted.length ? <p className="text-sm text-muted">Buat akun berperan Petugas Kantin di menu Akun & Peran.</p> : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {sorted.map(([id, p]) => (
                <label key={id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="operator" value={id} defaultChecked={s?.operator_ids.includes(id)} className={`${box} mt-0.5`} />
                  <span>{p.name}<span className="block text-xs text-muted">{p.roles.join(", ")}</span></span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {s && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={s.is_active} className={box} />Kios aktif</label>}
      </>
    );
    body = (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!stalls.length && <p className="text-sm text-muted">Belum ada kios. Tambahkan di samping.</p>}
          {stalls.map((s) => (
            <Card key={s.id} title={s.name} actions={<div className="flex gap-2">{!s.is_active && <Badge tone="neutral">Nonaktif</Badge>}
              <Link href={`/kantin/menu?kios=${s.id}`} className="text-sm font-semibold text-brand">Menu</Link>
              <Link href={`/kantin?kios=${s.id}`} className="text-sm font-semibold text-brand">Kasir</Link></div>}>
              <p className="mb-3 text-sm text-muted">
                Bagi hasil {Number(s.commission_pct)}% · petugas: {s.operator_ids.map((o) => people.get(o)?.name ?? "?").join(", ") || "belum ada"}
              </p>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-brand">Ubah kios</summary>
                <form action={saveStall} className="mt-3 flex flex-col gap-4">{fields(s)}<SubmitButton className="w-fit" pendingLabel="Menyimpan…">Simpan</SubmitButton></form>
              </details>
            </Card>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <Card title="Tambah kios">
            <form action={saveStall} className="flex flex-col gap-4">{fields()}<SubmitButton pendingLabel="Menyimpan…">Tambah kios</SubmitButton></form>
          </Card>
          <Card title="Pengaturan saldo">
            <form action={saveSettings} className="flex flex-col gap-4">
              <Field label="Kirim peringatan bila saldo di bawah (Rp)"><Input id="low" name="low" type="number" min={0} step={1000} defaultValue={Number(st.canteen_low_balance ?? 10000)} /></Field>
              <Field label="Saldo maksimal per murid (Rp)"><Input id="max" name="max" type="number" min={50000} step={10000} defaultValue={Number(st.canteen_max_balance ?? 2000000)} /></Field>
              <SubmitButton className="w-fit" variant="secondary" pendingLabel="Menyimpan…">Simpan</SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    );
  } else {
    const ids = stalls.map((s) => s.id);
    const [{ data: open }, { data: history }] = await Promise.all([
      ids.length ? supabase.from("canteen_ledger").select("stall_id, amount").in("stall_id", ids).is("settlement_id", null).limit(20000) : { data: [] },
      supabase.from("canteen_settlements").select("id, stall_id, period_to, gross, commission, net, entries, note, created_at, profiles:paid_by(full_name)")
        .eq("school_id", schoolId).order("created_at", { ascending: false }).limit(50),
    ]);
    const pending = new Map<string, number>();
    for (const r of open ?? []) pending.set(r.stall_id!, (pending.get(r.stall_id!) ?? 0) - Number(r.amount));
    const stallName = new Map(stalls.map((s) => [s.id, s.name]));
    body = (
      <div className="flex flex-col gap-6">
        <Table head={["Kios", "Belum disetor", "Bagi hasil", "Diserahkan ke kios", "Catat setoran"]} empty="Belum ada kios.">
          {stalls.map((s) => {
            const gross = pending.get(s.id) ?? 0;
            const commission = Math.round((gross * Number(s.commission_pct)) / 100);
            return (
              <tr key={s.id}>
                <td className="font-semibold">{s.name}<div className="text-xs font-normal text-muted">{Number(s.commission_pct)}%</div></td>
                <td className="tabular-nums">{rupiah(gross)}</td>
                <td className="tabular-nums">{rupiah(commission)}</td>
                <td className="font-semibold tabular-nums">{rupiah(gross - commission)}</td>
                <td>
                  {gross === 0 ? <span className="text-sm text-muted">Tidak ada</span> : (
                    <form action={settle} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="stall" value={s.id} />
                      <Input name="until" type="date" defaultValue={todayJakarta()} max={todayJakarta()} aria-label={`Sampai tanggal ${s.name}`} className="w-40" />
                      <Input name="note" maxLength={300} placeholder="Catatan" aria-label={`Catatan setoran ${s.name}`} className="w-36" />
                      <SubmitButton variant="secondary" pendingLabel="…">Catat</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        <Card title="Riwayat setoran">
          <Table head={["Dicatat", "Kios", "Sampai", "Penjualan", "Bagi hasil", "Diserahkan"]} empty="Belum ada setoran.">
            {((history ?? []) as any[]).map((h) => (
              <tr key={h.id}>
                <td className="whitespace-nowrap text-sm">{waktu(h.created_at)}<div className="text-xs text-muted">{h.profiles?.full_name ?? ""}</div></td>
                <td className="text-sm">{stallName.get(h.stall_id) ?? "?"}{h.note && <div className="text-xs text-muted">{h.note}</div>}</td>
                <td className="whitespace-nowrap text-sm">{tanggal(h.period_to)}</td>
                <td className="tabular-nums">{rupiah(h.gross)}</td>
                <td className="tabular-nums">{rupiah(h.commission)}</td>
                <td className="font-semibold tabular-nums">{rupiah(h.net)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Kantin Digital" subtitle="Murid jajan dengan kartu pelajar. Saldo diisi orang tua secara online atau tunai di loket TU."
        actions={<DownloadLink href="/unduh/kantin">Unduh transaksi bulan ini</DownloadLink>} />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total saldo murid" value={rupiah(totalBalance)} hint="Dana titipan, bukan pendapatan" />
        <Stat label="Penjualan hari ini" value={rupiah(salesToday)} />
        <Stat label="Kios aktif" value={stalls.filter((s) => s.is_active).length} />
      </div>
      <Tabs active={tab} items={[
        { key: "saldo", label: "Saldo murid", href: page("saldo") },
        { key: "kios", label: "Kios & petugas", href: page("kios") },
        { key: "setoran", label: "Setoran kios", href: page("setoran") },
      ]} />
      {body}
    </>
  );
}
