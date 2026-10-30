import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSession } from "@/lib/session";
import { optStr, run, str } from "@/lib/actions";
import { todayJakarta } from "@/lib/format";
import {
  AUDIENCE_LABEL, BULAN, CALENDAR_COLUMNS, KIND_LABEL, KIND_SHORT, KIND_TONE, addDays, holidayOn, isoDow, monthLabel, rangeLabel, shiftMonth,
  type CalendarAudience, type CalendarEvent, type CalendarKind,
} from "@/lib/calendar";
import { Badge, Card, Empty, Field, Flash, Input, LinkButton, PageHeader, Select, Tabs, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PrintButton } from "@/components/print-button";

const MANAGERS = ["school_admin", "principal"];
const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const CHIP: Record<CalendarKind, string> = {
  libur: "bg-bad-soft text-bad", ujian: "bg-warn-soft text-warn", rapor: "bg-good-soft text-good",
  kegiatan: "bg-brand-soft text-brand", akademik: "bg-paper text-ink border border-line", lainnya: "bg-paper text-muted border border-line",
};
const DOT: Record<CalendarKind, string> = {
  libur: "bg-bad", ujian: "bg-warn", rapor: "bg-good", kegiatan: "bg-brand", akademik: "bg-ink/60", lainnya: "bg-muted",
};

type Search = { bulan?: string; tampilan?: string; ubah?: string; ok?: string; err?: string };

function backPath(fd: FormData) {
  const bulan = str(fd, "bulan");
  return `/kalender${/^\d{4}-\d{2}$/.test(bulan) ? `?bulan=${bulan}` : ""}`;
}

async function save(fd: FormData) {
  "use server";
  const { active } = await getSession();
  const id = optStr(fd, "id");
  const starts = str(fd, "starts_on");
  const row = {
    title: str(fd, "title"),
    kind: str(fd, "kind") as CalendarKind,
    starts_on: starts,
    ends_on: optStr(fd, "ends_on") ?? starts,
    audience: str(fd, "audience") as CalendarAudience,
    description: optStr(fd, "description"),
    notify_members: fd.get("notify_members") === "on",
  };
  const back = `/kalender?bulan=${starts.slice(0, 7)}`;
  await run(back, id ? "Agenda diperbarui." : "Agenda ditambahkan ke kalender.", (sb) => id
    ? sb.from("calendar_events").update(row).eq("id", id).select("id").single()
    : sb.from("calendar_events").insert({ ...row, school_id: active!.school_id }));
}

async function remove(fd: FormData) {
  "use server";
  await run(backPath(fd), "Agenda dihapus.", (sb) => sb.from("calendar_events").delete().eq("id", str(fd, "id")).select("id").single());
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, active } = await getSession();
  if (!active) return null;
  const canManage = MANAGERS.includes(active.role);
  const today = todayJakarta();
  const month = /^\d{4}-\d{2}$/.test(sp.bulan ?? "") ? sp.bulan! : today.slice(0, 7);
  const listView = sp.tampilan === "daftar";

  const tabs = (
    <Tabs active={listView ? "daftar" : "bulan"} items={[
      { key: "bulan", label: "Bulanan", href: `/kalender?bulan=${month}` },
      { key: "daftar", label: "Setahun (cetak)", href: "/kalender?tampilan=daftar" },
    ]} />
  );

  if (listView) return <YearList schoolName={active.school_name} schoolId={active.school_id} today={today} tabs={tabs} supabase={supabase} />;

  // Kisi bulan dimulai Senin; mencakup sisa hari bulan sebelum/sesudah.
  const first = `${month}-01`;
  const gridStart = addDays(first, 1 - isoDow(first));
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridEnd = addDays(last, 7 - isoDow(last));
  const days = Array.from({ length: Math.round((Date.parse(gridEnd) - Date.parse(gridStart)) / 864e5) + 1 }, (_, i) => addDays(gridStart, i));

  const [{ data }, { data: editing }] = await Promise.all([
    supabase.from("calendar_events").select(CALENDAR_COLUMNS).eq("school_id", active.school_id)
      .lte("starts_on", gridEnd).gte("ends_on", gridStart).order("starts_on").order("title"),
    canManage && sp.ubah
      ? supabase.from("calendar_events").select(CALENDAR_COLUMNS).eq("id", sp.ubah).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const events = (data ?? []) as CalendarEvent[];
  const inMonth = events.filter((e) => e.starts_on <= last && e.ends_on >= first);
  const edit = editing as CalendarEvent | null;
  const todayHoliday = holidayOn(events, today);

  return (
    <>
      <PageHeader title="Kalender Pendidikan" subtitle={active.school_name}
        actions={canManage && <LinkButton href={`/kalender?bulan=${month}#form-agenda`} variant="primary">Tambah agenda</LinkButton>} />
      <Flash searchParams={sp} />
      {tabs}
      {!!todayHoliday.length && (
        <p className="mb-4 rounded-lg border border-bad/20 bg-bad-soft px-4 py-3 text-sm text-bad">
          Hari ini libur: <b>{todayHoliday.map((e) => e.title).join(", ")}</b>. Absensi murid tidak dicatat.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title={monthLabel(month)} actions={
            <div className="flex items-center gap-1">
              <LinkButton href={`/kalender?bulan=${shiftMonth(month, -1)}`} variant="ghost" aria-label="Bulan sebelumnya"><ChevronLeft className="size-4" /></LinkButton>
              {month !== today.slice(0, 7) && <LinkButton href="/kalender" variant="ghost">Bulan ini</LinkButton>}
              <LinkButton href={`/kalender?bulan=${shiftMonth(month, 1)}`} variant="ghost" aria-label="Bulan berikutnya"><ChevronRight className="size-4" /></LinkButton>
            </div>
          }>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line text-xs">
              {DOW.map((d, i) => (
                <div key={d} className={cx("bg-paper px-1.5 py-2 text-center font-semibold uppercase tracking-wide", i === 6 ? "text-bad" : "text-muted")}>{d}</div>
              ))}
              {days.map((d) => {
                const here = events.filter((e) => e.starts_on <= d && d <= e.ends_on);
                const holiday = here.some((e) => e.kind === "libur" && e.audience !== "staff");
                const outside = d.slice(0, 7) !== month;
                return (
                  <div key={d} className={cx("flex min-h-16 flex-col gap-1 p-1 sm:min-h-24 sm:p-1.5", holiday ? "bg-bad-soft/60" : "bg-sheet", outside && "opacity-45")}>
                    <span className={cx("inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      d === today ? "bg-brand-solid font-bold text-white" : isoDow(d) === 7 || holiday ? "font-semibold text-bad" : "text-ink")}>
                      {Number(d.slice(8))}
                    </span>
                    <div className="flex flex-wrap gap-1 sm:hidden">
                      {here.map((e) => <span key={e.id} title={e.title} className={cx("size-1.5 rounded-full", DOT[e.kind])} />)}
                    </div>
                    <ul className="hidden flex-col gap-0.5 sm:flex">
                      {here.slice(0, 3).map((e) => (
                        <li key={e.id} title={`${e.title} · ${rangeLabel(e.starts_on, e.ends_on)}`}
                          className={cx("truncate rounded px-1 py-0.5 text-[11px] font-medium leading-tight", CHIP[e.kind])}>{e.title}</li>
                      ))}
                      {here.length > 3 && <li className="px-1 text-[11px] text-muted">+{here.length - 3} lagi</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {(Object.keys(KIND_SHORT) as CalendarKind[]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5"><span className={cx("size-2 rounded-full", DOT[k])} />{KIND_SHORT[k]}</span>
              ))}
            </div>
          </Card>

          <Card title={`Agenda ${monthLabel(month)}`}>
            {!inMonth.length ? <Empty>Belum ada agenda di bulan ini.</Empty> : (
              <ul className="divide-y divide-line">
                {inMonth.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={KIND_TONE[e.kind]}>{KIND_SHORT[e.kind]}</Badge>
                        <span className="text-sm font-semibold tabular-nums text-ink">{rangeLabel(e.starts_on, e.ends_on)}</span>
                      </div>
                      <div className="mt-1 font-semibold text-ink">{e.title}</div>
                      {e.description && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{e.description}</p>}
                      {e.audience !== "all" && <p className="mt-0.5 text-xs text-muted">Untuk: {AUDIENCE_LABEL[e.audience]}</p>}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <LinkButton href={`/kalender?bulan=${month}&ubah=${e.id}#form-agenda`} variant="ghost">Ubah</LinkButton>
                        <form action={remove}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="bulan" value={month} />
                          <SubmitButton variant="ghost" className="text-bad hover:bg-bad-soft">Hapus</SubmitButton>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {canManage ? (
          <div id="form-agenda" className="flex h-fit flex-col gap-4 scroll-mt-20">
            <Card title={edit ? "Ubah agenda" : "Tambah agenda"}>
              <form action={save} key={edit?.id ?? "baru"} className="flex flex-col gap-3">
                {edit && <input type="hidden" name="id" value={edit.id} />}
                <Field label="Nama agenda">
                  <Input id="cal-title" name="title" required maxLength={120} defaultValue={edit?.title} placeholder="Contoh: Libur Hari Guru, PTS Ganjil" />
                </Field>
                <Field label="Jenis" hint="Hari libur membuat absensi murid tidak dicatat pada tanggal itu.">
                  <Select id="cal-kind" name="kind" defaultValue={edit?.kind ?? "kegiatan"}>
                    {(Object.keys(KIND_LABEL) as CalendarKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Mulai"><Input id="cal-start" name="starts_on" type="date" required defaultValue={edit?.starts_on ?? (month === today.slice(0, 7) ? today : first)} /></Field>
                  <Field label="Selesai" hint="Kosongkan bila 1 hari"><Input id="cal-end" name="ends_on" type="date" defaultValue={edit && edit.ends_on !== edit.starts_on ? edit.ends_on : ""} /></Field>
                </div>
                <Field label="Untuk">
                  <Select id="cal-audience" name="audience" defaultValue={edit?.audience ?? "all"}>
                    {(Object.keys(AUDIENCE_LABEL) as CalendarAudience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
                  </Select>
                </Field>
                <Field label="Keterangan (opsional)">
                  <Textarea id="cal-desc" name="description" rows={3} maxLength={2000} defaultValue={edit?.description ?? ""} placeholder="Tempat, jadwal per hari, perlengkapan, dll." />
                </Field>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="notify_members" defaultChecked={edit?.notify_members ?? true} className="mt-0.5 size-4 accent-[var(--color-brand-solid)]" />
                  <span>Kirim notifikasi ke penerima, termasuk pengingat sehari sebelumnya<span className="block text-xs text-muted">Matikan bila sedang mengisi banyak agenda sekaligus.</span></span>
                </label>
                <div className="flex gap-2">
                  <SubmitButton>{edit ? "Simpan perubahan" : "Tambahkan"}</SubmitButton>
                  {edit && <LinkButton href={`/kalender?bulan=${month}`}>Batal</LinkButton>}
                </div>
              </form>
            </Card>
            <p className="px-1 text-xs text-muted">Guru, murid, dan orang tua melihat kalender ini di dasbor web dan aplikasi HP sesuai pilihan &ldquo;Untuk&rdquo;.</p>
          </div>
        ) : (
          <UpcomingList events={events.filter((e) => e.ends_on >= today)} />
        )}
      </div>
    </>
  );
}

function UpcomingList({ events }: { events: CalendarEvent[] }) {
  return (
    <Card title="Akan datang" className="h-fit">
      {!events.length ? <Empty>Tidak ada agenda dalam waktu dekat.</Empty> : (
        <ul className="divide-y divide-line">
          {events.slice(0, 8).map((e) => (
            <li key={e.id} className="py-2.5">
              <div className="flex items-center gap-2"><Badge tone={KIND_TONE[e.kind]}>{KIND_SHORT[e.kind]}</Badge>
                <span className="text-xs tabular-nums text-muted">{rangeLabel(e.starts_on, e.ends_on)}</span></div>
              <div className="mt-1 font-semibold text-ink">{e.title}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Daftar agenda satu tahun ajaran, dikelompokkan per bulan; siap cetak. */
async function YearList({ schoolName, schoolId, today, tabs, supabase }: {
  schoolName: string; schoolId: string; today: string; tabs: ReactNode;
  supabase: Awaited<ReturnType<typeof getSession>>["supabase"];
}) {
  const { data: year } = await supabase.from("academic_years").select("name, starts_on, ends_on")
    .eq("school_id", schoolId).eq("is_active", true).maybeSingle();
  // Tanpa tahun ajaran aktif: Juli–Juni yang memuat hari ini.
  const y = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 7 ? 1 : 0);
  const from = year?.starts_on ?? `${y}-07-01`;
  const to = year?.ends_on ?? `${y + 1}-06-30`;
  const { data } = await supabase.from("calendar_events").select(CALENDAR_COLUMNS).eq("school_id", schoolId)
    .lte("starts_on", to).gte("ends_on", from).order("starts_on").order("title");
  const events = (data ?? []) as CalendarEvent[];
  const months = [...new Set(events.map((e) => e.starts_on < from ? from.slice(0, 7) : e.starts_on.slice(0, 7)))];

  return (
    <>
      <PageHeader title={`Kalender Pendidikan ${year?.name ?? `${y}/${y + 1}`}`} subtitle={schoolName} actions={<PrintButton label="Cetak kalender" />} />
      <div className="print:hidden">{tabs}</div>
      {!events.length ? <Empty>Belum ada agenda di tahun ajaran ini.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-3">
          {months.map((m) => (
            <section key={m} className="break-inside-avoid rounded-xl border border-line bg-sheet p-4 print:p-3">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink">{BULAN[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</h2>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {events.filter((e) => (e.starts_on < from ? from.slice(0, 7) : e.starts_on.slice(0, 7)) === m).map((e) => (
                    <tr key={e.id}>
                      <td className="w-28 py-1.5 pr-2 align-top tabular-nums text-muted">{rangeLabel(e.starts_on, e.ends_on, false)}</td>
                      <td className="py-1.5 align-top">
                        <span className={cx("font-medium", e.kind === "libur" ? "text-bad" : "text-ink")}>{e.title}</span>
                        <span className="ml-1.5 text-xs text-muted">· {KIND_SHORT[e.kind]}{e.audience !== "all" ? ` · ${AUDIENCE_LABEL[e.audience]}` : ""}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
