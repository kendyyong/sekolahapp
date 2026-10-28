import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { STATUS_LABEL, STATUS_TONE, type Tone } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink text-balance">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-lg border border-line bg-sheet p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-paper text-muted border-line",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  info: "bg-brand-soft text-brand border-transparent",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold", TONE_CLASS[tone])}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
const BTN: Record<BtnVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "bg-sheet text-ink border border-line hover:bg-paper",
  danger: "bg-bad text-white hover:opacity-90",
  ghost: "text-brand hover:bg-brand-soft",
};

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: BtnVariant }) {
  return (
    <button
      {...props}
      className={cx("inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50", BTN[variant], className)}
    />
  );
}

export function LinkButton({ variant = "secondary", className, ...props }: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return (
    <Link
      {...props}
      className={cx("inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition", BTN[variant], className)}
    />
  );
}

/** Tautan unduhan berkas (bukan navigasi, jadi tidak di-prefetch). */
export function DownloadLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} download className={cx("inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition", BTN.secondary)}>
      <span aria-hidden>⤓</span>{children}
    </a>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1 text-sm", className)}>
      <span className="font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

const INPUT = "w-full rounded-md border border-line bg-sheet px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

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
          <tr className="border-b border-line bg-paper text-left text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => <th key={i} className="px-3 py-2.5 font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top">
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
    <div className="rounded-lg border border-line bg-sheet p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("mt-1 text-2xl font-extrabold tabular-nums",
        tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-ink")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

/** Pesan hasil aksi dari query string (?ok= / ?err=). */
export function Flash({ searchParams }: { searchParams: { ok?: string; err?: string } }) {
  if (searchParams.err) {
    return <div role="alert" className="mb-5 rounded-md border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">{searchParams.err}</div>;
  }
  if (searchParams.ok) {
    return <div role="status" className="mb-5 rounded-md border border-good/30 bg-good-soft px-4 py-3 text-sm text-good">{searchParams.ok}</div>;
  }
  return null;
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link key={t.key} href={t.href}
          className={cx("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold",
            t.key === active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
