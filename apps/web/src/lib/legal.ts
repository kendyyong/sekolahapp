/**
 * Identitas penyelenggara untuk halaman publik (kontak, harga, Kebijakan Privasi, Syarat Layanan).
 * Bisa ditimpa lewat variabel lingkungan bila data badan usaha berubah.
 */
export const LEGAL = {
  company: process.env.NEXT_PUBLIC_LEGAL_COMPANY ?? "PT Wahana Media Berkat",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS
    ?? "Jl. A. Yani RT 08, Kel. Muara Jawa Ulu, Kec. Muara Jawa, Kab. Kutai Kartanegara, Kalimantan Timur 75261",
  email: process.env.NEXT_PUBLIC_LEGAL_EMAIL ?? "wahanamediaberkat@gmail.com",
  phone: process.env.NEXT_PUBLIC_LEGAL_PHONE ?? "+62 853-5344-1001",
  updated: "31 Oktober 2026",
};

/** Tautan WhatsApp ke nomor kontak, dengan pesan pembuka opsional. */
export function waLink(text?: string) {
  const digits = LEGAL.phone.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? "?text=" + encodeURIComponent(text) : ""}`;
}
