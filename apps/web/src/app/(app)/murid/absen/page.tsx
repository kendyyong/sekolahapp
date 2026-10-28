import { requireRole } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { tanggal, todayJakarta, waktu } from "@/lib/format";
import { myStudent } from "@/lib/queries";
import { GeoFields } from "@/components/geo-fields";
import { Button, Card, Empty, Field, Flash, Input, PageHeader, StatusBadge, Table } from "@/components/ui";

async function checkIn(fd: FormData) {
  "use server";
  const { supabase, user, schoolId } = await requireRole("student");
  const me = await myStudent(supabase, user.id, schoolId);
  const lat = optStr(fd, "lat"), lng = optStr(fd, "lng");
  await run("/murid/absen", "Absen tercatat. Terima kasih!", async (sb) => {
    if (!me?.class) throw new Error("Anda belum terdaftar di kelas");
    return sb.rpc("student_check_in", {
      p_class: me.class.id, p_qr_secret: str(fd, "code"), p_lat: lat ? Number(lat) : null, p_lng: lng ? Number(lng) : null,
    });
  });
}

export default async function StudentCheckIn({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user, schoolId } = await requireRole("student");
  const me = await myStudent(supabase, user.id, schoolId);
  if (!me) return <Empty>Data murid tidak ditemukan.</Empty>;
  const today = todayJakarta();
  const { data: history } = await supabase.from("student_attendance").select("date, status, method, checked_in_at")
    .eq("student_id", me.id).is("teaching_assignment_id", null).order("date", { ascending: false }).limit(30);
  const todayRow = history?.find((h) => h.date === today);

  return (
    <>
      <PageHeader title="Absen" subtitle={tanggal(today, true)} />
      <Flash searchParams={sp} />
      <div className="grid gap-6 md:grid-cols-[340px_minmax(0,1fr)]">
        <Card title="Absen hari ini" className="h-fit">
          {todayRow ? (
            <div className="text-sm"><StatusBadge status={todayRow.status} /><div className="mt-2 text-muted">Tercatat {waktu(todayRow.checked_in_at)}</div></div>
          ) : (
            <form action={checkIn} className="flex flex-col gap-3">
              <Field label="Kode absen kelas" hint="Kode ditampilkan guru di kelas.">
                <Input id="code" name="code" required autoComplete="off" className="text-center font-mono text-xl tracking-widest" />
              </Field>
              <GeoFields />
              <Button type="submit">Absen sekarang</Button>
            </form>
          )}
        </Card>
        <div className="min-w-0">
          <Table head={["Tanggal", "Status", "Cara", "Jam"]} empty="Belum ada riwayat absen.">
            {(history ?? []).map((h) => (
              <tr key={h.date}><td>{tanggal(h.date)}</td><td><StatusBadge status={h.status} /></td>
                <td className="text-muted">{({ manual: "Dicatat guru", qr: "Kode kelas", geo: "Kode + lokasi", leave: "Surat izin" } as Record<string, string>)[h.method]}</td>
                <td>{waktu(h.checked_in_at)}</td></tr>
            ))}
          </Table>
        </div>
      </div>
    </>
  );
}
