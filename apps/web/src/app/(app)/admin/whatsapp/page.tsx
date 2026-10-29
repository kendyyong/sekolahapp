import { requireModule } from "@/lib/session";
import { invokeFunction, run, str } from "@/lib/actions";
import { waktu } from "@/lib/format";
import { Badge, Card, Field, Flash, Input, PageHeader, Stat, Table } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

const CATEGORIES: [string, string, string][] = [
  ["kehadiran", "Kehadiran murid", "Anak tidak hadir, tiba, dan pulang (kios absen)"],
  ["tagihan", "Tagihan & pembayaran", "Tagihan baru dan pembayaran diterima"],
  ["izin", "Izin murid", "Pengajuan dan keputusan izin/sakit"],
  ["pengumuman", "Pengumuman", "Pengumuman sekolah untuk penerimanya"],
  ["pesan", "Pesan wali kelas", "Pesan antara wali kelas dan orang tua"],
  ["akademik", "Tugas, ujian & rapor", "Tugas baru, nilai tugas, jadwal ujian, rapor terbit"],
  ["ppdb", "PPDB", "Status pendaftaran calon murid"],
  ["kepegawaian", "Kepegawaian", "Cuti guru dan arahan kepala sekolah"],
];
const STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" }> = {
  sent: { label: "Terkirim", tone: "good" }, queued: { label: "Antre", tone: "warn" }, failed: { label: "Gagal", tone: "bad" },
};

async function saveToken(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("whatsapp", "school_admin");
  const clear = fd.get("clear") === "1";
  await run("/admin/whatsapp", clear ? "Token dihapus dan WhatsApp dimatikan." : "Token disimpan. Kirim pesan uji untuk memastikan.",
    (sb) => sb.rpc("wa_set_token", { p_school: schoolId, p_token: clear ? "" : str(fd, "token") }));
}

async function saveSettings(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("whatsapp", "school_admin");
  await run("/admin/whatsapp", "Pengaturan WhatsApp disimpan.", (sb) => sb.from("whatsapp_settings").update({
    is_enabled: fd.get("is_enabled") === "on", categories: fd.getAll("category").map(String), device: str(fd, "device") || null,
  }).eq("school_id", schoolId));
}

async function sendTest(fd: FormData) {
  "use server";
  const { schoolId } = await requireModule("whatsapp", "school_admin");
  await run("/admin/whatsapp", "Pesan uji terkirim. Periksa WhatsApp nomor tujuan.", async (sb) => {
    await invokeFunction(sb, "wa-dispatch", { test: { school_id: schoolId, phone: str(fd, "phone") } });
  });
}

const maskPhone = (p: string) => p.replace(/^62/, "0").replace(/(\d{4})\d+(\d{3})$/, "$1•••$2");

export default async function WhatsappPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireModule("whatsapp", "school_admin");
  const monthStart = new Date(new Date().toISOString().slice(0, 8) + "01T00:00:00+07:00").toISOString();
  const [{ data: settings }, { data: log }, ...counts] = await Promise.all([
    supabase.from("whatsapp_settings").select("*").eq("school_id", schoolId).maybeSingle(),
    supabase.from("whatsapp_outbox").select("id, phone, kind, title, status, error, created_at, sent_at, profiles(full_name)")
      .eq("school_id", schoolId).order("created_at", { ascending: false }).limit(50),
    ...(["sent", "queued", "failed"] as const).map((st) => supabase.from("whatsapp_outbox").select("id", { count: "exact", head: true })
      .eq("school_id", schoolId).eq("status", st).gte("created_at", monthStart)),
  ]);
  const [sent, queued, failed] = counts.map((c) => c.count ?? 0);
  const s = settings as { is_enabled: boolean; categories: string[]; token_hint: string | null; device: string | null } | null;
  const ready = !!s?.token_hint;

  return (
    <>
      <PageHeader title="Notifikasi WhatsApp"
        subtitle="Notifikasi aplikasi juga dikirim ke WhatsApp orang tua, murid, dan guru dari nomor WhatsApp sekolah sendiri."
        actions={<Badge tone={s?.is_enabled && ready ? "good" : "neutral"}>{s?.is_enabled && ready ? "Aktif" : "Belum aktif"}</Badge>} />
      <Flash searchParams={sp} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Terkirim bulan ini" value={sent} tone="good" />
        <Stat label="Antre" value={queued} tone={queued ? "warn" : undefined} />
        <Stat label="Gagal" value={failed} tone={failed ? "bad" : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Yang dikirim ke WhatsApp">
            {!ready ? <p className="text-sm text-muted">Simpan token Fonnte dulu (kotak di samping), lalu pilih notifikasi yang dikirim.</p> : (
              <form action={saveSettings} className="flex flex-col gap-4">
                <label className="flex items-center gap-2 font-semibold text-ink">
                  <input type="checkbox" name="is_enabled" defaultChecked={s?.is_enabled} className="size-4 accent-[var(--color-brand-solid)]" />
                  Aktifkan notifikasi WhatsApp
                </label>
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="mb-2 text-sm text-muted">Kategori yang dikirim</legend>
                  {CATEGORIES.map(([key, label, hint]) => (
                    <label key={key} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="category" value={key} defaultChecked={s?.categories.includes(key)} className="mt-0.5 size-4 accent-[var(--color-brand-solid)]" />
                      <span><span className="font-medium text-ink">{label}</span><span className="block text-xs text-muted">{hint}</span></span>
                    </label>
                  ))}
                </fieldset>
                <Field label="Nomor WhatsApp pengirim (catatan)" hint="Hanya untuk catatan admin; nomor yang dipakai mengikuti token Fonnte.">
                  <Input id="device" name="device" defaultValue={s?.device ?? ""} placeholder="0812 …" />
                </Field>
                <p className="text-xs text-muted">Penerima hanya yang mengisi nomor WhatsApp di profilnya (atau didaftarkan admin dengan nomor HP) dan tidak mematikan notifikasi WhatsApp.</p>
                <SubmitButton className="w-fit" pendingLabel="Menyimpan…">Simpan</SubmitButton>
              </form>
            )}
          </Card>
          <Card title="Riwayat pengiriman">
            <Table head={["Waktu", "Penerima", "Notifikasi", "Status"]} empty="Belum ada pesan WhatsApp.">
              {((log ?? []) as unknown as { id: string; phone: string; title: string; status: string; error: string | null; created_at: string; profiles: { full_name: string } | null }[])
                .map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-sm">{waktu(m.created_at)}</td>
                    <td className="text-sm">{m.profiles?.full_name ?? "–"}<div className="text-xs text-muted">{maskPhone(m.phone)}</div></td>
                    <td className="max-w-xs text-sm">{m.title}</td>
                    <td><Badge tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Badge>{m.error && <div className="mt-1 max-w-48 text-xs text-bad">{m.error}</div>}</td>
                  </tr>
                ))}
            </Table>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Hubungkan nomor WhatsApp sekolah">
            <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-ink">
              <li>Daftar di <a href="https://fonnte.com" target="_blank" rel="noreferrer" className="font-semibold text-brand">fonnte.com</a> dan pilih paket sesuai jumlah pesan.</li>
              <li>Di menu <b>Device</b>, tambahkan nomor WhatsApp sekolah lalu pindai kode QR dari HP sekolah.</li>
              <li>Salin <b>token</b> device tersebut dan tempel di bawah.</li>
            </ol>
            <form action={saveToken} className="flex flex-col gap-3">
              <Field label="Token Fonnte" hint={ready ? `Tersimpan: ••••${s!.token_hint}. Isi lagi untuk mengganti.` : "Token disimpan di server dan tidak ditampilkan lagi."}>
                <Input id="token" name="token" type="password" autoComplete="off" required minLength={10} />
              </Field>
              <SubmitButton pendingLabel="Menyimpan…">Simpan token</SubmitButton>
            </form>
            {ready && (
              <form action={saveToken} className="mt-2">
                <input type="hidden" name="clear" value="1" />
                <SubmitButton variant="ghost" className="-ml-3 text-bad hover:bg-bad-soft">Hapus token</SubmitButton>
              </form>
            )}
          </Card>
          {ready && (
            <Card title="Kirim pesan uji">
              <form action={sendTest} className="flex flex-col gap-3">
                <Field label="Nomor tujuan"><Input id="test-phone" name="phone" type="tel" required placeholder="0812 3456 7890" /></Field>
                <SubmitButton variant="secondary" pendingLabel="Mengirim…">Kirim pesan uji</SubmitButton>
              </form>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
