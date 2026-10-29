import "server-only";
import writeXlsxFile, { type Cell, type Row, type Sheet } from "write-excel-file/node";

export interface ReportSheet {
  sheet: string;
  /** Baris judul di atas tabel, misalnya nama sekolah dan periode. */
  title: string[];
  head: string[];
  rows: Cell[][];
  widths?: number[];
}
export interface Report extends ReportSheet { filename: string }

function sheetOf(r: ReportSheet): Sheet<Buffer> {
  return {
    data: [
      ...r.title.map((t, i): Row => [{ value: t, fontWeight: i === 0 ? "bold" : undefined, fontSize: i === 0 ? 14 : undefined }]),
      [],
      r.head.map((h) => ({ value: h, fontWeight: "bold", backgroundColor: "#E8EEF9", wrap: true })),
      ...r.rows,
    ],
    sheet: r.sheet.replace(/[\\/?*:[\]]/g, "-").slice(0, 31),
    dateFormat: "dd/mm/yyyy",
    columns: r.widths?.map((width) => ({ width })),
    stickyRowsCount: r.title.length + 2,
  };
}

/** Berkas Excel (.xlsx) dengan baris judul, kepala tabel tebal, dan kepala yang tetap terlihat saat digulir. */
export async function xlsxResponse(r: Report) {
  return xlsxWorkbook(r.filename, [r]);
}

/** Satu berkas Excel berisi beberapa lembar kerja. */
export async function xlsxWorkbook(filename: string, sheets: ReportSheet[]) {
  const buf = await writeXlsxFile(sheets.map(sheetOf)).toBuffer();
  const name = filename.replace(/[^\w.-]+/g, "-");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Mengambil semua baris walau melebihi batas 1.000 baris per permintaan PostgREST. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** "2026-10" → daftar tanggal "2026-10-01" … "2026-10-31". */
export function monthDays(month: string) {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
}
