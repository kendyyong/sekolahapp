// Kokurikuler (8 dimensi profil lulusan) dan P5 (Profil Pelajar Pancasila): konstanta dan teks rapor.

export type Framework = "kokurikuler" | "p5";
export type Level = "BB" | "MB" | "BSH" | "SB";

export const FRAMEWORK_LABEL: Record<Framework, string> = {
  kokurikuler: "Kokurikuler (8 dimensi profil lulusan)",
  p5: "P5 (Profil Pelajar Pancasila)",
};
export const FRAMEWORK_SHORT: Record<Framework, string> = { kokurikuler: "Kokurikuler", p5: "P5" };
/** Judul bagian di rapor. */
export const FRAMEWORK_TITLE: Record<Framework, string> = {
  kokurikuler: "Kokurikuler",
  p5: "Projek Penguatan Profil Pelajar Pancasila",
};

export const LEVELS: Level[] = ["BB", "MB", "BSH", "SB"];
export const LEVEL_LABEL: Record<Level, string> = {
  BB: "Belum Berkembang", MB: "Mulai Berkembang", BSH: "Berkembang Sesuai Harapan", SB: "Sangat Berkembang",
};
const LEVEL_PHRASE: Record<Level, string> = {
  SB: "sangat berkembang", BSH: "berkembang sesuai harapan", MB: "mulai berkembang", BB: "belum berkembang",
};

/** Tema yang lazim dipakai, sebagai saran isian (boleh menulis tema sendiri). */
export const THEMES = [
  "Gaya Hidup Berkelanjutan", "Kearifan Lokal", "Bhinneka Tunggal Ika", "Bangunlah Jiwa dan Raganya",
  "Suara Demokrasi", "Rekayasa dan Teknologi", "Kewirausahaan", "Kebekerjaan",
  "Gerakan 7 Kebiasaan Anak Indonesia Hebat", "Literasi dan Numerasi", "Lingkungan Sekolah Sehat",
];

export interface Aspect { id: string; framework: Framework; dimension: string; element: string | null; position: number }

/** Nama aspek yang dinilai: elemen (P5) atau dimensi (kokurikuler). */
export const aspectName = (a: Pick<Aspect, "dimension" | "element">) => a.element ?? a.dimension;

/** Mengelompokkan aspek per dimensi untuk daftar centang. */
export function byDimension<T extends Pick<Aspect, "dimension">>(aspects: T[]) {
  const groups = new Map<string, T[]>();
  for (const a of aspects) groups.set(a.dimension, [...(groups.get(a.dimension) ?? []), a]);
  return [...groups.entries()];
}

/** Satu projek di rapor murid (RPC kokurikuler_report). */
export interface ProjectReport {
  id: string; title: string; theme: string | null; framework: Framework; description: string | null; note: string | null;
  aspects: { id: string; dimension: string; element: string | null; level: Level | null }[];
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const list = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} dan ${xs.at(-1)}`;

/**
 * Deskripsi capaian projek untuk rapor, dikelompokkan dari predikat tertinggi:
 * "Ananda Andi sangat berkembang dalam kolaborasi; berkembang sesuai harapan dalam kreativitas."
 */
export function projectNarrative(name: string, p: Pick<ProjectReport, "aspects">) {
  const parts = (["SB", "BSH", "MB", "BB"] as Level[]).flatMap((lv) => {
    const names = p.aspects.filter((a) => a.level === lv).map((a) => lowerFirst(aspectName(a)));
    return names.length ? [`${LEVEL_PHRASE[lv]} dalam ${list(names)}`] : [];
  });
  return parts.length ? `Ananda ${name} ${parts.join("; ")}.` : "";
}
