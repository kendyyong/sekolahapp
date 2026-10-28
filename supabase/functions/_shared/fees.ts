// Perhitungan biaya layanan pembayaran online dan potongan platform.
// Angka tarif gateway adalah perkiraan; sesuaikan dengan kontrak Xendit Anda.

export type OnlineMethod = "va" | "qris" | "ewallet" | "retail";

interface FeeRule {
  /** Biaya tetap yang ditagihkan ke pembayar (rupiah). */
  flat: number;
  /** Persentase dari nominal tagihan yang ditagihkan ke pembayar. */
  percent: number;
  /** Perkiraan biaya yang dipotong gateway (untuk menghitung margin platform). */
  gatewayFlat: number;
  gatewayPercent: number;
}

export const FEE_RULES: Record<OnlineMethod, FeeRule> = {
  va:      { flat: 5500, percent: 0,   gatewayFlat: 4500, gatewayPercent: 0 },
  qris:    { flat: 1000, percent: 0.7, gatewayFlat: 0,    gatewayPercent: 0.7 },
  ewallet: { flat: 1000, percent: 2,   gatewayFlat: 0,    gatewayPercent: 2 },
  retail:  { flat: 6500, percent: 0,   gatewayFlat: 5000, gatewayPercent: 0 },
};

export const XENDIT_METHODS: Record<OnlineMethod, string[]> = {
  va: ["BCA", "BNI", "BRI", "MANDIRI", "PERMATA", "BSI", "CIMB"],
  qris: ["QRIS"],
  ewallet: ["OVO", "DANA", "SHOPEEPAY", "LINKAJA"],
  retail: ["ALFAMART", "INDOMARET"],
};

export interface FeeBreakdown {
  /** Nominal yang masuk ke tagihan sekolah. */
  invoiceAmount: number;
  /** Biaya layanan yang dibayar orang tua (0 jika ditanggung sekolah). */
  serviceFee: number;
  /** Total yang dibayar di halaman pembayaran. */
  chargeAmount: number;
  /** Biaya langganan per siswa yang dipotong bulan ini (0 jika sudah terpotong). */
  platformFee: number;
  /** Margin platform dari biaya layanan setelah biaya gateway. */
  platformMargin: number;
  /** Jumlah yang dialihkan ke akun platform lewat split rule. */
  routeToPlatform: number;
}

export function computeFees(opts: {
  invoiceAmount: number;
  method: OnlineMethod;
  feeBearer: "payer" | "school";
  pricePerStudent: number;
  platformFeeAlreadyCollected: boolean;
}): FeeBreakdown {
  const { invoiceAmount, method, feeBearer, pricePerStudent, platformFeeAlreadyCollected } = opts;
  if (!Number.isInteger(invoiceAmount) || invoiceAmount <= 0) throw new Error("Nominal tagihan tidak valid");
  const rule = FEE_RULES[method];
  if (!rule) throw new Error("Metode pembayaran tidak dikenal");

  const fee = Math.ceil(rule.flat + (invoiceAmount * rule.percent) / 100);
  const serviceFee = feeBearer === "payer" ? fee : 0;
  const chargeAmount = invoiceAmount + serviceFee;
  const gatewayCost = Math.ceil(rule.gatewayFlat + (chargeAmount * rule.gatewayPercent) / 100);
  const platformMargin = Math.max(serviceFee - gatewayCost, 0);
  const platformFee = platformFeeAlreadyCollected ? 0 : Math.min(pricePerStudent, invoiceAmount);

  return {
    invoiceAmount,
    serviceFee,
    chargeAmount,
    platformFee,
    platformMargin,
    routeToPlatform: platformFee + platformMargin,
  };
}
