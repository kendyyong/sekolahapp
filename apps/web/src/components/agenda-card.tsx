import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { todayJakarta } from "@/lib/format";
import { CALENDAR_COLUMNS, KIND_SHORT, KIND_TONE, addDays, holidayOn, rangeLabel, type CalendarEvent } from "@/lib/calendar";
import { Badge, Card, Empty } from "@/components/ui";

/** Agenda kalender pendidikan 45 hari ke depan untuk beranda; RLS menyaring sesuai sasaran. */
export async function AgendaCard({ supabase, schoolId, className }: { supabase: SupabaseClient; schoolId: string; className?: string }) {
  const today = todayJakarta();
  const { data } = await supabase.from("calendar_events").select(CALENDAR_COLUMNS).eq("school_id", schoolId)
    .gte("ends_on", today).lte("starts_on", addDays(today, 45)).order("starts_on").limit(6);
  const events = (data ?? []) as CalendarEvent[];
  const holiday = holidayOn(events, today);
  return (
    <Card title="Kalender pendidikan" className={className} actions={<Link href="/kalender" className="text-sm font-semibold text-brand">Lihat kalender</Link>}>
      {!!holiday.length && (
        <p className="mb-3 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">Hari ini libur: <b>{holiday.map((e) => e.title).join(", ")}</b></p>
      )}
      {!events.length ? <Empty>Tidak ada agenda dalam 45 hari ke depan.</Empty> : (
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink">{e.title}</div>
                <div className="text-xs tabular-nums text-muted">{rangeLabel(e.starts_on, e.ends_on)}</div>
              </div>
              <Badge tone={KIND_TONE[e.kind]}>{KIND_SHORT[e.kind]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
