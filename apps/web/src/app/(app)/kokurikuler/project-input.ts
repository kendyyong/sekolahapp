import "server-only";
import { optStr, str } from "@/lib/actions";
import type { Framework } from "@/lib/kokurikuler";

/** Isian projek dari form; dipakai saat membuat maupun mengubah. */
export function projectFromForm(fd: FormData) {
  const framework: Framework = str(fd, "framework") === "p5" ? "p5" : "kokurikuler";
  const class_ids = fd.getAll("class").map(String);
  // Kotak centang kerangka lain tidak terkirim, tetapi saring juga untuk berjaga-jaga.
  const aspect_ids = fd.getAll("aspect").map(String).filter((a) => a.startsWith(framework === "p5" ? "p5." : "k."));
  if (!class_ids.length) throw new Error("Pilih minimal satu kelas peserta");
  if (!aspect_ids.length) throw new Error("Pilih minimal satu dimensi yang dinilai");
  return { framework, title: str(fd, "title"), theme: optStr(fd, "theme"), description: optStr(fd, "description"), class_ids, aspect_ids };
}
