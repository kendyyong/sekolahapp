/**
 * Identitas penyelenggara untuk Kebijakan Privasi & Syarat Layanan.
 * WAJIB diisi dengan data badan usaha yang sebenarnya sebelum go-live
 * (lewat variabel lingkungan atau langsung di sini).
 */
export const LEGAL = {
  company: process.env.NEXT_PUBLIC_LEGAL_COMPANY ?? "[Nama badan usaha penyelenggara SekolahApp]",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "[Alamat kantor]",
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? "privasi@sekolahapp.id",
  updated: "28 Oktober 2026",
};
