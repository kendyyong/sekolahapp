/** Syarat bawaan program affiliator (sama dengan nilai bawaan tabel affiliates). */
export const AFFILIATE_TERMS = { pct: 20, months: 12 };

export const AFFILIATE_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu persetujuan", active: "Aktif", suspended: "Dibekukan", rejected: "Ditolak",
};
export const AFFILIATE_STATUS_TONE = { pending: "warn", active: "good", suspended: "bad", rejected: "neutral" } as const;
export const COMMISSION_LABEL: Record<string, string> = { pending: "Menunggu transfer", paid: "Ditransfer", void: "Batal" };
export const COMMISSION_TONE = { pending: "warn", paid: "good", void: "neutral" } as const;
