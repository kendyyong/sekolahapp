import Link from "next/link";
import { CircleAlert, CircleCheck, Download, Inbox } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { STATUS_LABEL, STATUS_TONE, type Tone } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        <h1 className="text-[1.375rem] font-bold leading-tight tracking-tight text-ink text-balance">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted text-pretty">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx("min-w-0 rounded-xl border border-line bg-sheet shadow-card", className)}>
      {(title || actions) && (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-5 py-3">
          {title && <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-paper text-muted border-line",
  good: "bg-good-soft text-good border-good/20",
  warn: "bg-warn-soft text-warn border-warn/20",
  bad: "bg-bad-soft text-bad border-bad/20",
  info: "bg-brand-soft text-brand border-brand/20",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold", TONE_CLASS[tone])}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-brand-solid text-white shadow-sm hover:bg-brand-solid/90",
  secondary: "bg-sheet text-ink border border-line shadow-sm hover:bg-paper",
  danger: "bg-bad text-white shadow-sm hover:opacity-90",
  ghost: "text-brand hover:bg-brand-soft",
};
const BTN_BASE = "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:pointer-events-none disabled:opacity-50";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: BtnVariant }) {
  return (
    <button
      {...props}
      className={cx(BTN_BASE, BTN[variant], className)}
    />
  );
}

export function LinkButton({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return (
    <Link
      {...props}
      className={cx(BTN_BASE, BTN[variant], className)}
    />
  );
}

/** Tautan unduhan berkas (bukan navigasi, jadi tidak di-prefetch). */
export function DownloadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} download className={cx(BTN_BASE, BTN.secondary)}>
      <Download aria-hidden className="size-4 text-muted" />{children}
    </a>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1 text-sm", className)}>
      <span className="font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

const INPUT = "w-full rounded-lg border border-line bg-sheet px-3 py-2 text-sm text-ink shadow-xs placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:bg-paper disabled:text-muted";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(INPUT, props.className)} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(INPUT, props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={cx(INPUT, props.className)} />;
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-sheet">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-paper text-left text-[11px] uppercase tracking-wider text-muted">
            {head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&>tr]:transition-colors [&>tr:hover]:bg-paper/60">
          {hasRows ? children : (
            <tr><td colSpan={head.length} className="py-8 text-center text-muted">{empty ?? "Belum ada data."}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className={cx("relative overflow-hidden rounded-xl border border-line bg-sheet p-4 shadow-card",
      "before:absolute before:inset-y-0 before:left-0 before:w-1",
      tone === "bad" ? "before:bg-bad" : tone === "warn" ? "before:bg-warn" : tone === "good" ? "before:bg-good" : "before:bg-brand/70")}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cx("mt-1.5 text-[1.375rem] font-bold leading-none tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-[1.625rem]",
        tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-ink")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
      <Inbox aria-hidden className="size-6 text-muted/60" />
      <p className="text-pretty">{children}</p>
    </div>
  );
}

/** Pesan hasil aksi dari query string (?ok= / ?err=). */
export function Flash({ searchParams }: { searchParams: { ok?: string; err?: string } }) {
  if (searchParams.err) {
    return (
      <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
        <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />{searchParams.err}
      </div>
    );
  }
  if (searchParams.ok) {
    return (
      <div role="status" className="mb-5 flex items-start gap-2.5 rounded-lg border border-good/30 bg-good-soft px-4 py-3 text-sm text-good">
        <CircleCheck aria-hidden className="mt-px size-4 shrink-0" />{searchParams.ok}
      </div>
    );
  }
  return null;
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link key={t.key} href={t.href}
          className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
            t.key === active ? "border-brand text-brand" : "border-transparent text-muted hover:border-line hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
