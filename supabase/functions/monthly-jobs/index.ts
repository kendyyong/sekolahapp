// Pekerjaan terjadwal harian (dipanggil pg_cron / Supabase Scheduled Function):
//  - tanggal 1: buat tagihan bulanan untuk semua sekolah berbayar
//  - tanggal 1: hitung tagihan langganan platform bulan lalu
//  - setiap hari: batalkan permintaan isi saldo kantin yang tidak dibayar, terapkan denda
//    keterlambatan, kirim pengingat jatuh tempo (H-3, H, H+7)
//  - setiap hari: pengingat H-1 agenda kalender pendidikan
//
// POST /functions/v1/monthly-jobs   header: x-cron-secret: <CRON_SECRET>
// Body opsional: { "date": "2026-11-01" } untuk menjalankan ulang tanggal tertentu.
import { adminClient, env, HttpError, json, serve } from "../_shared/supabase.ts";

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== env("CRON_SECRET")) throw new HttpError(401, "Tidak berwenang");
  const body = await req.json().catch(() => ({})) as { date?: string };
  const today = body.date ?? jakartaToday();
  const isFirst = today.endsWith("-01");

  const admin = adminClient();
  const { data: schools, error } = await admin.from("schools").select("id, name, plan").eq("is_active", true);
  if (error) throw error;
  // Tagihan SPP otomatis hanya untuk paket yang memuat modul "finance".
  const { data: plans } = await admin.from("plans").select("tier, modules");
  const withFinance = new Set((plans ?? []).filter((p) => (p.modules as string[]).includes("finance")).map((p) => p.tier));

  const report: Record<string, unknown>[] = [];
  for (const s of schools ?? []) {
    const r: Record<string, unknown> = { school: s.name };
    try {
      if (isFirst) {
        if (withFinance.has(s.plan)) {
          const { data } = await admin.rpc("generate_monthly_invoices", { p_school: s.id, p_period: today });
          r.invoices_created = data;
        }
        const lastMonth = addDays(today, -1).slice(0, 8) + "01";
        const { data: bill } = await admin.rpc("compute_platform_bill", { p_school: s.id, p_period: lastMonth });
        r.platform_bill_due = bill?.amount_due;
      }
      // Permintaan isi saldo kantin yang tidak dibayar sampai lewat hari dibatalkan (tanpa denda/pengingat).
      const { data: expired } = await admin.rpc("canteen_expire_topups", { p_school: s.id });
      r.canteen_topups_expired = expired;
      const { data: late } = await admin.rpc("apply_late_fees", { p_school: s.id });
      r.late_fees = late;
      const { data: agenda } = await admin.rpc("calendar_send_reminders", { p_school: s.id, p_date: today });
      r.calendar_reminders = agenda;

      // Pengingat jatuh tempo.
      for (const [offset, label] of [[3, "3 hari lagi"], [0, "hari ini"], [-7, "lewat 7 hari"]] as const) {
        const due = addDays(today, offset);
        const { data: invs } = await admin.from("invoices")
          .select("id, title, total, paid_amount, student_id, guardian_links:students!inner(guardian_links(guardian_id))")
          .eq("school_id", s.id).eq("due_on", due).eq("canteen_topup", false).in("status", ["unpaid", "partial"]);
        const rows = (invs ?? []).flatMap((i) =>
          // deno-lint-ignore no-explicit-any
          ((i as any).guardian_links?.guardian_links ?? []).map((g: { guardian_id: string }) => ({
            user_id: g.guardian_id, school_id: s.id, kind: "invoice.reminder",
            title: `Pengingat: ${i.title} jatuh tempo ${label}`,
            body: `Sisa Rp${(Number(i.total) - Number(i.paid_amount)).toLocaleString("id-ID")}`,
            ref_table: "invoices", ref_id: i.id,
          })));
        if (rows.length) await admin.from("notifications").insert(rows);
        r[`reminders_${offset}`] = rows.length;
      }
    } catch (e) {
      r.error = (e as Error).message;
    }
    report.push(r);
  }
  return json({ date: today, schools: report });
});
