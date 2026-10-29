import { PROMOTION_LABEL, type ReportView } from "@/lib/report";
import { Letterhead } from "@/components/letterhead";

const longDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }) : "";

/** Fase Kurikulum Merdeka dari tingkat kelas. */
function phase(grade: number) {
  if (grade <= 0) return "Fondasi";
  return grade <= 2 ? "A" : grade <= 4 ? "B" : grade <= 6 ? "C" : grade <= 9 ? "D" : grade === 10 ? "E" : "F";
}

/** Rapor satu murid, dengan tata letak yang siap dicetak di kertas A4. */
export function ReportCard({ r }: { r: ReportView }) {
  const draft = r.card.status !== "final" || !r.term.published_at;
  const row = "border border-line px-2 py-1.5 align-top print:border-black";
  return (
    <article className="relative mx-auto max-w-[190mm] break-after-page last:break-after-auto rounded-lg border border-line bg-sheet p-4 text-sm sm:p-6 text-ink print:max-w-none print:rounded-none print:border-0 print:p-0 print:text-[11pt] print:text-black">
      {draft && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
          <span className="-rotate-30 text-8xl font-extrabold tracking-widest text-line/70 print:text-black/10">DRAF</span>
        </div>
      )}
      <Letterhead school={r.school} title="LAPORAN HASIL BELAJAR" />

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 print:grid-cols-2">
        {[
          ["Nama murid", r.student.full_name],
          ["Kelas", r.class.name],
          ["NIS / NISN", [r.student.nis, r.student.nisn].filter(Boolean).join(" / ") || "–"],
          ["Fase", phase(r.class.grade_level)],
          ["Sekolah", r.school.name],
          ["Semester", `${r.term.semester} (${r.term.name})`],
          ["", ""],
          ["Tahun pelajaran", r.term.year],
        ].map(([k, v], i) => (
          <div key={i} className={`grid grid-cols-[120px_minmax(0,1fr)] gap-2 ${k ? "" : "hidden sm:grid print:grid"}`}>
            <dt className="text-muted print:text-black">{k}</dt><dd className="font-semibold">{k && ": "}{v}</dd>
          </div>
        ))}
      </dl>

      <table className="mt-5 w-full border-collapse">
        <thead>
          <tr className="bg-paper print:bg-transparent">
            <th className={`${row} w-8`}>No</th><th className={`${row} text-left`}>Mata pelajaran</th>
            <th className={`${row} w-16`}>Nilai akhir</th><th className={`${row} text-left`}>Capaian kompetensi</th>
          </tr>
        </thead>
        <tbody>
          {r.grades.map((g, i) => (
            <tr key={g.subject}>
              <td className={`${row} text-center tabular-nums`}>{i + 1}</td>
              <td className={row}>{g.subject}</td>
              <td className={`${row} text-center font-semibold tabular-nums`}>{g.score == null ? "–" : Math.round(g.score)}</td>
              <td className={row}>{g.description ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="bg-paper print:bg-transparent">
            <th className={`${row} w-8`}>No</th><th className={`${row} text-left`}>Ekstrakurikuler</th>
            <th className={`${row} w-24`}>Predikat</th><th className={`${row} text-left`}>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          {(r.card.extracurriculars.length ? r.card.extracurriculars : [{ name: "–" }]).map((e, i) => (
            <tr key={i}>
              <td className={`${row} text-center`}>{i + 1}</td><td className={row}>{e.name}</td>
              <td className={`${row} text-center`}>{e.grade ?? ""}</td><td className={row}>{e.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)] print:grid-cols-[220px_minmax(0,1fr)]">
        <table className="w-full border-collapse self-start">
          <thead><tr className="bg-paper print:bg-transparent"><th colSpan={2} className={`${row} text-left`}>Ketidakhadiran</th></tr></thead>
          <tbody>
            {[["Sakit", r.card.sick], ["Izin", r.card.permit], ["Tanpa keterangan", r.card.absent]].map(([k, v]) => (
              <tr key={k}><td className={row}>{k}</td><td className={`${row} w-20 tabular-nums`}>{v} hari</td></tr>
            ))}
          </tbody>
        </table>
        <div className="border border-line p-2 print:border-black">
          <div className="font-semibold">Catatan wali kelas</div>
          <p className="mt-1 whitespace-pre-line">{r.card.homeroom_note || "–"}</p>
        </div>
      </div>

      {r.term.semester === 2 && r.card.promotion && (
        <div className="mt-4 border border-line p-2 print:border-black">
          <span className="font-semibold">Keputusan: </span>{PROMOTION_LABEL[r.card.promotion]}
          {r.card.promotion === "naik" && ` ke kelas ${r.class.grade_level + 1}`}
        </div>
      )}

      <footer className="mt-8 grid grid-cols-2 gap-4 text-center break-inside-avoid sm:grid-cols-3 print:grid-cols-3">
        <div>
          <div>&nbsp;</div>
          <div>Orang tua/wali</div>
          <div className="mt-12 border-t border-ink pt-1 print:border-black">&nbsp;</div>
        </div>
        <div className="hidden sm:block print:block" />
        <div>
          <div>{[r.term.report_place, longDate(r.term.report_date)].filter(Boolean).join(", ") || "\u00a0"}</div>
          <div>Wali kelas</div>
          <div className="mt-12 border-t border-ink pt-1 font-semibold print:border-black">{r.homeroom ?? ""}</div>
          <div className="text-xs">{r.homeroom_nip ? `NIP. ${r.homeroom_nip}` : "\u00a0"}</div>
        </div>
        <div className="col-span-2 sm:col-span-3 print:col-span-3">
          <div>Mengetahui,<br />Kepala sekolah</div>
          <div className="mx-auto mt-12 w-56 border-t border-ink pt-1 font-semibold print:border-black">{r.principal ?? ""}</div>
          <div className="text-xs">{r.principal_nip ? `NIP. ${r.principal_nip}` : "\u00a0"}</div>
        </div>
      </footer>
    </article>
  );
}
