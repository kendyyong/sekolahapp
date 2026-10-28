import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.8";
import { computeFees } from "./fees.ts";

Deno.test("VA, biaya ditanggung orang tua, potongan langganan belum terambil", () => {
  const f = computeFees({ invoiceAmount: 475000, method: "va", feeBearer: "payer", pricePerStudent: 6000, platformFeeAlreadyCollected: false });
  assertEquals(f, {
    invoiceAmount: 475000, serviceFee: 5500, chargeAmount: 480500,
    platformFee: 6000, platformMargin: 1000, routeToPlatform: 7000,
  });
});

Deno.test("QRIS, potongan langganan sudah terambil bulan ini", () => {
  const f = computeFees({ invoiceAmount: 100000, method: "qris", feeBearer: "payer", pricePerStudent: 6000, platformFeeAlreadyCollected: true });
  assertEquals(f.serviceFee, 1700);
  assertEquals(f.platformFee, 0);
  assertEquals(f.chargeAmount, 101700);
  assertEquals(f.platformMargin, 1700 - 712);
});

Deno.test("biaya ditanggung sekolah: orang tua membayar sesuai tagihan", () => {
  const f = computeFees({ invoiceAmount: 300000, method: "va", feeBearer: "school", pricePerStudent: 3000, platformFeeAlreadyCollected: false });
  assertEquals(f.chargeAmount, 300000);
  assertEquals(f.platformMargin, 0);
  assertEquals(f.routeToPlatform, 3000);
});

Deno.test("potongan tidak melebihi nominal tagihan kecil", () => {
  const f = computeFees({ invoiceAmount: 2000, method: "va", feeBearer: "payer", pricePerStudent: 6000, platformFeeAlreadyCollected: false });
  assertEquals(f.platformFee, 2000);
});

Deno.test("nominal tidak valid ditolak", () => {
  assertThrows(() => computeFees({ invoiceAmount: 0, method: "va", feeBearer: "payer", pricePerStudent: 0, platformFeeAlreadyCollected: false }));
});
