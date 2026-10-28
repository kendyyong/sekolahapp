import { requireRole } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { Button, Card, Field, Flash, Input, PageHeader } from "@/components/ui";

async function saveSettings(fd: FormData) {
  "use server";
  const { schoolId } = await requireRole("school_admin");
  await run("/admin/pengaturan", "Pengaturan disimpan.", async (sb) => {
    const { data: school, error } = await sb.from("schools").select("settings").eq("id", schoolId).single();
    if (error) return { error };
    const lat = optStr(fd, "geo_lat"), lng = optStr(fd, "geo_lng");
    const int = (k: string, min: number, max: number) => {
      const v = Number(str(fd, k));
      if (!Number.isInteger(v) || v < min || v > max) throw new Error(`Nilai ${k} harus ${min}–${max}`);
      return v;
    };
    const settings = {
      ...(school.settings as object),
      school_start_time: str(fd, "school_start_time"),
      late_after_minutes: int("late_after_minutes", 0, 120),
      annual_leave_days: int("annual_leave_days", 0, 60),
      student_leave_escalate_days: int("student_leave_escalate_days", 1, 30),
      invoice_due_day: int("invoice_due_day", 1, 28),
      late_fee_amount: int("late_fee_amount", 0, 10_000_000),
      geofence: lat && lng ? { lat: Number(lat), lng: Number(lng), radius_m: int("geo_radius", 30, 5000) } : null,
    };
    return sb.from("schools").update({
      name: str(fd, "name"), npsn: optStr(fd, "npsn"), address: optStr(fd, "address"), phone: optStr(fd, "phone"), settings,
    }).eq("id", schoolId);
  });
}

export default async function SchoolSettings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireRole("school_admin");
  const { data: s } = await supabase.from("schools").select("name, npsn, address, phone, settings").eq("id", schoolId).single();
  const st = (s?.settings ?? {}) as Record<string, any>;

  return (
    <>
      <PageHeader title="Pengaturan Sekolah" />
      <Flash searchParams={sp} />
      <form action={saveSettings} className="grid gap-6 lg:grid-cols-2">
        <Card title="Identitas sekolah">
          <div className="flex flex-col gap-3">
            <Field label="Nama sekolah"><Input id="name" name="name" defaultValue={s?.name} required /></Field>
            <Field label="NPSN"><Input id="npsn" name="npsn" defaultValue={s?.npsn ?? ""} /></Field>
            <Field label="Alamat"><Input id="address" name="address" defaultValue={s?.address ?? ""} /></Field>
            <Field label="Telepon"><Input id="phone" name="phone" defaultValue={s?.phone ?? ""} /></Field>
          </div>
        </Card>
        <Card title="Absensi">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jam masuk"><Input id="start" name="school_start_time" type="time" defaultValue={st.school_start_time ?? "07:00"} /></Field>
              <Field label="Toleransi terlambat (menit)"><Input id="late" name="late_after_minutes" type="number" defaultValue={st.late_after_minutes ?? 15} /></Field>
            </div>
            <p className="text-xs text-muted">Batas lokasi (geofence): kosongkan agar absen bisa dari mana saja.</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Latitude"><Input id="lat" name="geo_lat" defaultValue={st.geofence?.lat ?? ""} placeholder="-6.2" /></Field>
              <Field label="Longitude"><Input id="lng" name="geo_lng" defaultValue={st.geofence?.lng ?? ""} placeholder="106.8" /></Field>
              <Field label="Radius (m)"><Input id="rad" name="geo_radius" type="number" defaultValue={st.geofence?.radius_m ?? 150} /></Field>
            </div>
          </div>
        </Card>
        <Card title="Izin & cuti">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kuota cuti tahunan guru (hari)"><Input id="leave" name="annual_leave_days" type="number" defaultValue={st.annual_leave_days ?? 12} /></Field>
            <Field label="Izin murid diteruskan ke BK setelah (hari)"><Input id="esc" name="student_leave_escalate_days" type="number" defaultValue={st.student_leave_escalate_days ?? 3} /></Field>
          </div>
        </Card>
        <Card title="Tagihan">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal jatuh tempo tiap bulan"><Input id="due" name="invoice_due_day" type="number" defaultValue={st.invoice_due_day ?? 10} /></Field>
            <Field label="Denda keterlambatan (Rp)"><Input id="fee" name="late_fee_amount" type="number" defaultValue={st.late_fee_amount ?? 0} /></Field>
          </div>
        </Card>
        <div className="lg:col-span-2"><Button type="submit">Simpan pengaturan</Button></div>
      </form>
    </>
  );
}
