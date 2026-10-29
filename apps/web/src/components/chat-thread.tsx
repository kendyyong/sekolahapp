import type { SupabaseClient } from "@supabase/supabase-js";
import { waktu } from "@/lib/format";
import { Button, Empty, Textarea, cx } from "@/components/ui";

/** Utas pesan orang tua ↔ wali kelas tentang seorang murid. */
export async function ChatThread({ sb, studentId, me, action, back }: {
  sb: SupabaseClient; studentId: string; me: string; back: string;
  action: (fd: FormData) => Promise<void>;
}) {
  const { data: msgs } = await sb.from("student_messages")
    .select("id, body, created_at, sender_id, profiles:sender_id(full_name)")
    .eq("student_id", studentId).order("created_at", { ascending: true }).limit(200);

  return (
    <div className="flex flex-col gap-4">
      {!msgs?.length ? <Empty>Belum ada pesan. Mulai percakapan di bawah.</Empty> : (
        <ol className="flex flex-col gap-2">
          {msgs.map((m: any) => {
            const mine = m.sender_id === me;
            return (
              <li key={m.id} className={cx("max-w-[85%] rounded-lg px-3 py-2 text-sm", mine ? "self-end bg-brand-solid text-white" : "self-start border border-line bg-sheet")}>
                {!mine && <div className="mb-0.5 text-xs font-semibold text-brand">{m.profiles?.full_name}</div>}
                <p className="whitespace-pre-line">{m.body}</p>
                <div className={cx("mt-1 text-[11px]", mine ? "text-white/70" : "text-muted")}>{waktu(m.created_at)}</div>
              </li>
            );
          })}
        </ol>
      )}
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="student_id" value={studentId} />
        <input type="hidden" name="back" value={back} />
        <Textarea name="body" required rows={3} maxLength={4000} placeholder="Tulis pesan…" aria-label="Pesan" />
        <Button type="submit" className="self-end">Kirim</Button>
      </form>
    </div>
  );
}
