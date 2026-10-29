import { requireRole, requireModule } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { rupiah } from "@/lib/format";
import { Badge, Card, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const CATEGORY: Record<string, string> = {
  spp: "SPP", pendaftaran: "Pendaftaran", gedung: "Uang gedung", seragam: "Seragam", buku: "Buku",
  kegiatan: "Kegiatan", ujian: "Ujian", iuran: "Iuran", lainnya: "Lainnya",
};

async function createFee(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("finance");
  await run("/tu/biaya", "Jenis biaya disimpan.", (sb) => sb.from("fee_types").insert({
    school_id: schoolId, code: str(fd, "code").toUpperCase(), name: str(fd, "name"), category: str(fd, "category"),
    is_monthly: fd.get("is_monthly") === "on", default_amount: num(fd, "default_amount"), description: optStr(fd, "description"),
  }));
}

async function setRate(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("finance");
  const grade = optStr(fd, "grade_level");
  await run("/tu/biaya", "Nominal per tingkat disimpan.", (sb) => sb.from("fee_rates").upsert({
    school_id: schoolId, fee_type_id: str(fd, "fee_type_id"), academic_year_id: str(fd, "academic_year_id"),
    grade_level: grade ? Number(grade) : null, amount: num(fd, "amount"),
  }, { onConflict: "fee_type_id,academic_year_id,grade_level" }));
}

async function toggleFee(fd: FormData) {
  "use server";
  await run("/tu/biaya", "Status biaya diperbarui.", (sb) =>
    sb.from("fee_types").update({ is_active: str(fd, "active") === "true" }).eq("id", str(fd, "id")));
}

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireModule("finance", "finance");
  const [{ data: fees }, { data: year }] = await Promise.all([
    supabase.from("fee_types").select("id, code, name, category, is_monthly, default_amount, is_active, fee_rates(id, grade_level, amount, academic_year_id)")
      .eq("school_id", schoolId).order("is_monthly", { ascending: false }).order("name"),
    supabase.from("academic_years").select("id, name").eq("school_id", schoolId).eq("is_active", true).maybeSingle(),
  ]);

  return (
    <>
      <PageHeader title="Master Biaya" subtitle="Ditetapkan Tata Usaha. Biaya bulanan masuk ke tagihan otomatis setiap tanggal 1." />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Table head={["Biaya", "Jenis", "Nominal dasar", `Per tingkat (${year?.name ?? "–"})`, ""]} empty="Belum ada jenis biaya.">
            {((fees ?? []) as any[]).map((f) => {
              const rates = (f.fee_rates ?? []).filter((r: any) => r.academic_year_id === year?.id)
                .sort((a: any, b: any) => (a.grade_level ?? 0) - (b.grade_level ?? 0));
              return (
                <tr key={f.id} className={f.is_active ? "" : "opacity-60"}>
                  <td><div className="font-semibold">{f.name}</div><div className="text-xs text-muted">{f.code}</div></td>
                  <td className="flex flex-wrap gap-1"><Badge tone="info">{CATEGORY[f.category]}</Badge>{f.is_monthly && <Badge tone="good">Bulanan</Badge>}</td>
                  <td className="tabular-nums">{rupiah(f.default_amount)}</td>
                  <td>
                    <ul className="text-xs tabular-nums">
                      {rates.map((r: any) => <li key={r.id}>{r.grade_level == null ? "Semua tingkat" : `Tingkat ${r.grade_level}`}: {rupiah(r.amount)}</li>)}
                    </ul>
                    {year && (
                      <form action={setRate} className="mt-1 flex flex-wrap items-center gap-1">
                        <input type="hidden" name="fee_type_id" value={f.id} />
                        <input type="hidden" name="academic_year_id" value={year.id} />
                        <input name="grade_level" type="number" min={0} max={13} placeholder="Tkt" aria-label="Tingkat" className="w-14 rounded border border-line bg-sheet px-1 py-0.5 text-xs" />
                        <input name="amount" type="number" min={0} required placeholder="Nominal" aria-label="Nominal" className="w-24 rounded border border-line bg-sheet px-1 py-0.5 text-xs" />
                        <button className="text-xs font-semibold text-brand">Simpan</button>
                      </form>
                    )}
                  </td>
                  <td>
                    <form action={toggleFee}>
                      <input type="hidden" name="id" value={f.id} /><input type="hidden" name="active" value={String(!f.is_active)} />
                      <button className="text-xs font-semibold text-muted hover:text-ink">{f.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </Table>
        </div>
        <Card title="Jenis biaya baru" className="h-fit">
          <form action={createFee} className="flex flex-col gap-3">
            <div className="grid grid-cols-[90px_1fr] gap-3">
              <Field label="Kode"><Input id="f-code" name="code" required placeholder="SPP" /></Field>
              <Field label="Nama"><Input id="f-name" name="name" required placeholder="SPP bulanan" /></Field>
            </div>
            <Field label="Kategori"><Select id="f-cat" name="category">{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Nominal dasar (Rp)"><Input id="f-amt" name="default_amount" type="number" min={0} required /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_monthly" /> Ditagih setiap bulan</label>
            <SubmitButton>Simpan</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
