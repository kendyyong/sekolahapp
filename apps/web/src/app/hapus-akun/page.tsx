import type { Metadata } from "next";
import Link from "next/link";
import { run, str } from "@/lib/actions";
import { tanggal } from "@/lib/format";
import { LEGAL } from "@/lib/legal";
import { createClient } from "@/lib/supabase/server";
import { LegalPage } from "@/components/legal/legal-page";
import { Badge, Button, Field, Flash, LinkButton, Textarea } from "@/components/ui";

export const metadata: Metadata = { title: "Hapus akun · SekolahApp" };

async function requestDeletion(fd: FormData) {
  "use server";
  await run("/hapus-akun", "Permintaan hapus akun terkirim. Kami memprosesnya paling lambat 14 hari.", (sb) =>
    sb.rpc("request_account_deletion", { p_reason: str(fd, "reason") }));
}

async function cancelDeletion() {
  "use server";
  await run("/hapus-akun", "Permintaan hapus akun dibatalkan.", (sb) => sb.rpc("cancel_account_deletion"));
}

const STATUS: Record<string, [string, "warn" | "good" | "bad" | "neutral"]> = {
  pending: ["Sedang diproses", "warn"],
  approved: ["Selesai", "good"],
  rejected: ["Ditolak", "bad"],
  cancelled: ["Dibatalkan", "neutral"],
};

export default async function DeleteAccount({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: last } = user
    ? await sb.from("account_deletion_requests").select("status, reason, review_note, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const pending = last?.status === "pending";

  return (
    <LegalPage title="Hapus akun">
      <section>
        <p>
          Anda dapat meminta penghapusan akun SekolahApp beserta data pribadi yang terkait. Halaman ini berlaku untuk aplikasi web
          dan aplikasi Android/iOS SekolahApp.
        </p>
      </section>
      <section>
        <h2>Yang dihapus</h2>
        <ul>
          <li>Akun masuk (email dan kata sandi), nama, nomor telepon, dan token notifikasi perangkat.</li>
          <li>Hubungan akun dengan sekolah dan dengan murid (untuk akun orang tua).</li>
          <li>Pesan dan lampiran yang Anda kirim, kecuali yang wajib disimpan sekolah.</li>
        </ul>
      </section>
      <section>
        <h2>Yang tetap disimpan</h2>
        <p>
          Sekolah wajib menyimpan sebagian catatan pendidikan dan keuangan, misalnya buku induk, nilai rapor, riwayat kehadiran, dan
          bukti pembayaran. Catatan tersebut tetap disimpan oleh sekolah tanpa terhubung ke akun Anda, dan dihapus atau dianonimkan
          sesuai masa simpan dalam <Link href="/privasi" className="font-semibold text-brand">Kebijakan Privasi</Link>.
          Penghapusan akun murid yang masih aktif perlu persetujuan sekolah.
        </p>
      </section>
      <section className="rounded-lg border border-line bg-sheet p-5">
        <h2>Ajukan permintaan</h2>
        <div className="mt-3"><Flash searchParams={sp} /></div>
        {!user ? (
          <div className="mt-3 flex flex-col gap-3">
            <p>Masuk dengan akun yang ingin dihapus, lalu kembali ke halaman ini.</p>
            <LinkButton href="/login?next=/hapus-akun" variant="primary" className="self-start">Masuk</LinkButton>
            <p className="text-sm">
              Tidak bisa masuk? Kirim email dari alamat yang terdaftar ke{" "}
              <a href={`mailto:${LEGAL.email}?subject=Hapus%20akun`} className="font-semibold text-brand">{LEGAL.email}</a>{" "}
              dengan judul “Hapus akun”. Akun murid tanpa email dapat diajukan oleh orang tua atau admin sekolah.
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {last && (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                Permintaan terakhir {tanggal(last.created_at)}: <Badge tone={STATUS[last.status]?.[1]}>{STATUS[last.status]?.[0] ?? last.status}</Badge>
                {last.review_note && <span>“{last.review_note}”</span>}
              </p>
            )}
            {pending ? (
              <form action={cancelDeletion}>
                <p className="mb-3">Akun Anda ({user.email}) akan dihapus paling lambat 14 hari sejak permintaan dibuat.</p>
                <Button type="submit" variant="secondary">Batalkan permintaan</Button>
              </form>
            ) : (
              <form action={requestDeletion} className="flex flex-col gap-3">
                <p>Akun yang akan dihapus: <b className="text-ink">{user.email}</b></p>
                <Field label="Alasan (opsional)">
                  <Textarea id="reason" name="reason" rows={3} maxLength={500} placeholder="Misalnya: anak sudah lulus" />
                </Field>
                <Button type="submit" className="self-start">Minta hapus akun</Button>
              </form>
            )}
          </div>
        )}
      </section>
    </LegalPage>
  );
}
