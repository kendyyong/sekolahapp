import { getSession } from "@/lib/session";
import { run } from "@/lib/actions";
import { waktu } from "@/lib/format";
import { Button, Empty, Flash, PageHeader, cx } from "@/components/ui";

async function markAll() {
  "use server";
  await run("/notifikasi", "Semua notifikasi ditandai sudah dibaca.", (sb) => sb.rpc("mark_all_notifications_read"));
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await getSession();
  const { data } = await supabase.from("notifications")
    .select("id, title, body, kind, created_at, read_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);

  return (
    <>
      <PageHeader title="Notifikasi" actions={
        <form action={markAll}><Button variant="secondary">Tandai semua dibaca</Button></form>
      } />
      <Flash searchParams={sp} />
      {!data?.length ? <Empty>Belum ada notifikasi.</Empty> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-sheet">
          {data.map((n) => (
            <li key={n.id} className={cx("flex gap-3 px-4 py-3", !n.read_at && "bg-brand-soft/40")}>
              <span className={cx("mt-2 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">{n.title}</div>
                {n.body && <div className="text-sm text-muted">{n.body}</div>}
              </div>
              <time className="shrink-0 text-xs text-muted">{waktu(n.created_at)}</time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
