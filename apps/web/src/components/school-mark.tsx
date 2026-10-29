import { cx } from "@/components/ui";

/** Logo sekolah, atau inisial nama sekolah di kotak berwarna bila belum ada logo. */
export function SchoolMark({ name, logo, className }: { name: string; logo: string | null; className?: string }) {
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={`Logo ${name}`} className={cx("shrink-0 rounded-lg bg-white object-contain p-1", className)} />;
  }
  const letters = name.replace(/^(SD|SMP|SMA|SMK|MI|MTs|MA|TK)\s+(Negeri|N|Swasta|IT|Islam)?\s*/i, "")
    .split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-lg bg-brand-solid text-sm font-extrabold text-white", className)}>
      {letters || "S"}
    </span>
  );
}
