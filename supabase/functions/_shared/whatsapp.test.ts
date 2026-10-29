import { assertEquals } from "jsr:@std/assert@1.0.8";
import { composeMessage, waNumber } from "./whatsapp.ts";

Deno.test("nomor WA dinormalkan ke 62…", () => {
  assertEquals(waNumber("0812-3456-7890"), "6281234567890");
  assertEquals(waNumber("+62 812 3456 7890"), "6281234567890");
  assertEquals(waNumber("81234567890"), "6281234567890");
  assertEquals(waNumber("12345"), null);
  assertEquals(waNumber(""), null);
});

Deno.test("isi pesan WA", () => {
  assertEquals(composeMessage("SMP Harapan", "Anak Anda tidak hadir", "Andi · 29-10-2026", "https://x.id/notifikasi"),
    "*SMP Harapan*\nAnak Anda tidak hadir\nAndi · 29-10-2026\n\nBuka aplikasi: https://x.id/notifikasi");
  assertEquals(composeMessage("SMP", "Judul", "  ", null), "*SMP*\nJudul");
});
