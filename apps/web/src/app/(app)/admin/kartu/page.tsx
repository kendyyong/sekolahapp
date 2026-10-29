import QRCode from "qrcode";
import { requireRole } from "@/lib/session";
import { run, str } from "@/lib/actions";
import { Button, Empty, Field, Flash, PageHeader, Select } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

async function resetCard(fd: FormData) {
  "use server";
  await requireRole("school_admin");
  await run(`/admin/kartu?kelas=${str(fd, "kelas")}`, "Kartu baru dibuat. Kartu lama tidak berlaku lagi.", (sb) =>
    sb.rpc("reset_student_card", { p_student: str(fd, "student_id") }));
}

/** Isi QR: awalan agar kios bisa membedakan kartu SekolahApp dari QR lain. */
const cardCode = (token: string) => `sekolahapp:card:${token}`;

export default async function StudentCards({ searchParams }: {
  searchParams: Promise<{ kelas?: string; ok?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, schoolId, brand } = await requireRole("school_admin");
  const [{ data: school }, { data: classes }] = await Promise.all([
    supabase.from("schools").select("name, logo_url, address").eq("id", schoolId).single(),
    supabase.from("classes").select("id, name, academic_years!inner(is_active, name)")
      .eq("school_id", schoolId).eq("academic_years.is_active", true).order("name"),
  ]);
  const cls = (classes ?? []).find((c) => c.id === sp.kelas) ?? classes?.[0];
  const year = (cls?.academic_years as unknown as { name: string } | undefined)?.name;

  const { data: enr } = cls ? await supabase.from("enrollments")
    .select("roll_number, students!inner(id, full_name, nis, nisn, card_token, status)")
    .eq("class_id", cls.id).eq("students.status", "aktif")
    .order("roll_number", { ascending: true, nullsFirst: false }) : { data: [] };
  const students = ((enr ?? []) as any[]).map((e) => e.students as {
    id: string; full_name: string; nis: string | null; nisn: string | null; card_token: string;
  });
  const cards = await Promise.all(students.map(async (s) => ({
    ...s, qr: await QRCode.toString(cardCode(s.card_token), { type: "svg", margin: 0, errorCorrectionLevel: "M" }),
  })));

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Kartu Pelajar" subtitle="Murid menempelkan kartu ke kios absen. Tidak perlu ponsel."
          actions={cards.length ? <PrintButton label="Cetak kartu" /> : null} />
        <Flash searchParams={sp} />
        <form className="mb-5 flex items-end gap-2">
          <Field label="Kelas">
            <Select id="kelas" name="kelas" defaultValue={cls?.id}>
              {(classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Button variant="secondary">Tampilkan</Button>
        </form>
        <p className="mb-5 max-w-3xl text-sm text-muted">
          Cetak di kertas A4 (10 kartu per lembar, ukuran KTP 85,6 × 54 mm), lalu laminasi. Bila kartu hilang, klik
          “Ganti kartu” agar kartu lama tidak bisa dipakai, lalu cetak ulang kartu murid tersebut.
        </p>
      </div>

      {!cls ? <Empty>Belum ada kelas di tahun ajaran aktif.</Empty>
        : !cards.length ? <Empty>Belum ada murid aktif di kelas {cls.name}.</Empty> : (
        <div className="grid grid-cols-[repeat(auto-fill,85.6mm)] gap-[4mm] print:grid-cols-[85.6mm_85.6mm] print:gap-[3mm]">
          {cards.map((c) => (
            <div key={c.id} className="flex flex-col gap-1 break-inside-avoid">
              <article className="flex h-[54mm] w-[85.6mm] overflow-hidden rounded-[3mm] border border-[#c9d2e3] bg-white text-[#18233d]">
                <div className="flex w-[30mm] shrink-0 flex-col items-center justify-center gap-[1.5mm] p-[3mm]"
                  style={{ background: brand?.brand_color ?? "#1f4fb8" }}>
                  <div className="rounded-[1.5mm] bg-white p-[1.5mm] [&_svg]:h-[22mm] [&_svg]:w-[22mm]"
                    dangerouslySetInnerHTML={{ __html: c.qr }} />
                  <span className="text-center text-[2.4mm] font-bold uppercase leading-tight tracking-wide text-white">Tempel untuk absen</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-[3.5mm]">
                  <div className="text-[2.4mm] font-bold uppercase tracking-wide text-[#c8372d]">Kartu Pelajar</div>
                  <div className="flex items-center gap-[1.5mm]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {school?.logo_url && <img src={school.logo_url} alt="" className="size-[6mm] shrink-0 object-contain" />}
                    <div className="truncate text-[3mm] font-bold leading-tight">{school?.name}</div>
                  </div>
                  <div className="mt-auto">
                    <div className="line-clamp-2 text-[4.2mm] font-extrabold leading-tight">{c.full_name}</div>
                    <dl className="mt-[1.5mm] grid grid-cols-[auto_1fr] gap-x-[2mm] text-[2.8mm] leading-snug">
                      <dt className="text-[#5b6680]">Kelas</dt><dd className="font-semibold">{cls.name}{year ? ` · ${year}` : ""}</dd>
                      <dt className="text-[#5b6680]">NIS</dt><dd className="font-semibold tabular-nums">{c.nis ?? "–"}</dd>
                      {c.nisn && <><dt className="text-[#5b6680]">NISN</dt><dd className="font-semibold tabular-nums">{c.nisn}</dd></>}
                    </dl>
                  </div>
                </div>
              </article>
              <form action={resetCard} className="print:hidden">
                <input type="hidden" name="student_id" value={c.id} />
                <input type="hidden" name="kelas" value={cls.id} />
                <button className="text-xs font-semibold text-muted hover:text-bad">Ganti kartu (hilang/rusak)</button>
              </form>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
