// Pembantu notifikasi WhatsApp yang bisa diuji tanpa jaringan.

/** Nomor WA dalam format 62xxxxxxxxxx (sama dengan public.wa_number), atau null bila tidak valid. */
export function waNumber(phone: string): string | null {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return /^62\d{8,13}$/.test(d) ? d : null;
}

/** Isi pesan: nama sekolah tebal, judul, isi, lalu tautan ke aplikasi. */
export function composeMessage(school: string, title: string, body: string | null, link: string | null) {
  return [`*${school}*`, title, body?.trim() || null, link ? `\nBuka aplikasi: ${link}` : null].filter(Boolean).join("\n");
}
