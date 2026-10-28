import { requireRole } from "@/lib/session";
import { num, optStr, run, str } from "@/lib/actions";
import { rupiah, tanggal } from "@/lib/format";
import { Button, Card, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";

async function addDiscount(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("finance");
  await run("/tu/beasiswa", "Potongan disimpan. Berlaku pada tagihan berikutnya.", (sb) => sb.from("student_discounts").insert({
    school_id: schoolId, student_id: str(fd, "student_id"), fee_type_id: str(fd, "fee_type_id"),
    kind: str(fd, "kind"), value: num(fd, "value"), reason: str(fd, "reason"),
    valid_from: str(fd, "valid_from"), valid_to: optStr(fd, "valid_to"),
  }));
}

async function removeDiscount(fd: FormData) {
  "use server";
  await run("/tu/beasiswa", "Potongan dihapus.", (sb) => sb.from("student_discounts").delete().eq("id", str(fd, "id")));
}

export default async function Discounts({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireRole("finance");
  const [{ data: rows }, { data: students }, { data: fees }] = await Promise.all([
    supabase.from("student_discounts").select("id, kind, value, reason, valid_from, valid_to, students(full_name), fee_types(name)")
      .eq("school_id", schoolId).order("created_at", { ascending: false }),
    supabase.from("students").select("id, full_name").eq("school_id", schoolId).eq("status", "aktif").order("full_name"),
    supabase.from("fee_types").select("id, name").eq("school_id", schoolId).eq("is_active", true).order("name"),
  ]);

  return (
    <>
      <PageHeader title="Beasiswa & Potongan" />
      <Flash searchParams={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Table head={["Murid", "Biaya", "Potongan", "Alasan", "Berlaku", ""]} empty="Belum ada potongan.">
            {((rows ?? []) as any[]).map((d) => (
              <tr key={d.id}>
                <td className="font-semibold">{d.students?.full_name}</td>
                <td>{d.fee_types?.name}</td>
                <td className="tabular-nums">{d.kind === "percent" ? `${d.value}%` : rupiah(d.value)}</td>
                <td>{d.reason}</td>
                <td className="whitespace-nowrap">{tanggal(d.valid_from)} – {d.valid_to ? tanggal(d.valid_to) : "seterusnya"}</td>
                <td><form action={removeDiscount}><input type="hidden" name="id" value={d.id} /><button className="text-sm text-muted hover:text-bad">Hapus</button></form></td>
              </tr>
            ))}
          </Table>
        </div>
        <Card title="Tambah potongan" className="h-fit">
          <form action={addDiscount} className="flex flex-col gap-3">
            <Field label="Murid"><Select id="d-st" name="student_id">{(students ?? []).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select></Field>
            <Field label="Untuk biaya"><Select id="d-fee" name="fee_type_id">{(fees ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bentuk"><Select id="d-kind" name="kind"><option value="percent">Persen</option><option value="amount">Nominal (Rp)</option></Select></Field>
              <Field label="Nilai"><Input id="d-val" name="value" type="number" min={1} required /></Field>
            </div>
            <Field label="Alasan"><Input id="d-reason" name="reason" required placeholder="Beasiswa prestasi" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mulai"><Input id="d-from" name="valid_from" type="date" required /></Field>
              <Field label="Sampai (opsional)"><Input id="d-to" name="valid_to" type="date" /></Field>
            </div>
            <Button type="submit">Simpan</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
