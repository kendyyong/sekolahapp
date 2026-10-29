/** Data kop surat sekolah (rapor, kartu, cetakan lain). */
export interface LetterheadSchool {
  name: string; logo_url: string | null; address?: string | null; npsn?: string | null;
  phone?: string | null; email?: string | null; website?: string | null; foundation?: string | null;
}

/** Kop sekolah resmi: logo di kiri, nama & kontak di tengah, garis ganda di bawah. */
/** `compact`: untuk kolom sempit (pratinjau), tanpa ruang kosong penyeimbang di kanan. */
export function Letterhead({ school, title, compact }: { school: LetterheadSchool; title?: string; compact?: boolean }) {
  const contact = [school.phone && `Telp. ${school.phone}`, school.email, school.website].filter(Boolean).join(" · ");
  return (
    <header className="border-b-[3px] border-double border-ink pb-3 print:border-black">
      <div className={compact ? "grid grid-cols-[48px_minmax(0,1fr)] items-center gap-3 [&_img]:size-12"
        : "grid grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-3 sm:grid-cols-[72px_minmax(0,1fr)_72px]"}>
        {school.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={school.logo_url} alt={`Logo ${school.name}`} className="size-14 object-contain sm:size-[72px]" />
          : <span />}
        <div className="text-center">
          {school.foundation && <div className="text-xs font-semibold uppercase tracking-wide">{school.foundation}</div>}
          <div className={compact ? "text-base font-extrabold uppercase leading-tight" : "text-lg font-extrabold uppercase leading-tight sm:text-xl"}>{school.name}</div>
          {(school.address || school.npsn) && (
            <div className="text-xs text-muted print:text-black">{[school.address, school.npsn && `NPSN ${school.npsn}`].filter(Boolean).join(" · ")}</div>
          )}
          {contact && <div className="text-xs text-muted print:text-black">{contact}</div>}
        </div>
        {!compact && <span />}
      </div>
      {title && <div className="mt-3 text-center text-base font-extrabold tracking-wide">{title}</div>}
    </header>
  );
}
