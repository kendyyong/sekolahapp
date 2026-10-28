import { requireRole, ROLE_LABEL, type Role } from "@/lib/session";
import { tanggal, todayJakarta, waktu } from "@/lib/format";
import { Button, Field, Input, PageHeader, StatusBadge, Table } from "@/components/ui";

export default async function StaffAttendance({ searchParams }: { searchParams: Promise<{ tanggal?: string }> }) {
  const sp = await searchParams;
  const { supabase, schoolId } = await requireRole("principal", "school_admin");
  const date = sp.tanggal ?? todayJakarta();
  const [{ data: staff }, { data: att }] = await Promise.all([
    supabase.from("memberships").select("user_id, role, profiles(full_name)").eq("school_id", schoolId).eq("is_active", true)
      .in("role", ["teacher", "counselor", "finance", "school_admin"]),
    supabase.from("staff_attendance").select("user_id, status, check_in_at, check_out_at, note").eq("school_id", schoolId).eq("date", date),
  ]);
  const people = new Map<string, { name: string; roles: string[] }>();
  for (const m of (staff ?? []) as any[]) {
    const p = people.get(m.user_id) ?? { name: m.profiles?.full_name ?? "", roles: [] as string[] };
    p.roles.push(ROLE_LABEL[m.role as Role]);
    people.set(m.user_id, p);
  }
  const byUser = new Map((att ?? []).map((a) => [a.user_id, a]));

  return (
    <>
      <PageHeader title="Kehadiran Guru & Pegawai" subtitle={tanggal(date, true)} />
      <form className="mb-5 flex items-end gap-2">
        <Field label="Tanggal"><Input id="tanggal" name="tanggal" type="date" defaultValue={date} /></Field>
        <Button variant="secondary">Tampilkan</Button>
      </form>
      <Table head={["Nama", "Peran", "Status", "Masuk", "Pulang"]}>
        {[...people.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, p]) => {
          const a = byUser.get(id);
          return (
            <tr key={id}>
              <td className="font-semibold">{p.name}</td>
              <td className="text-muted">{p.roles.join(", ")}</td>
              <td>{a ? <StatusBadge status={a.status} /> : <span className="text-muted">Belum absen</span>}</td>
              <td>{waktu(a?.check_in_at)}</td>
              <td>{waktu(a?.check_out_at)}</td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
