import { Field, Input } from "@/components/ui";

/** Isian batas jajan harian & bekukan kartu (orang tua dan TU). */
export function CanteenControlFields({ limit, frozen }: { limit: number | null; frozen: boolean }) {
  return (
    <>
      <Field label="Batas jajan per hari (Rp)" hint="Kosongkan bila tanpa batas">
        <Input name="daily_limit" type="number" min={1000} max={1000000} step={1000} defaultValue={limit ?? ""} placeholder="Contoh: 15000" />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="frozen" defaultChecked={frozen} className="mt-0.5 size-4 accent-[var(--color-brand-solid)]" />
        <span><span className="font-medium text-ink">Bekukan kartu jajan</span><span className="block text-xs text-muted">Misalnya bila kartu hilang. Saldo tetap aman.</span></span>
      </label>
    </>
  );
}

export function controlsFromForm(fd: FormData) {
  const raw = String(fd.get("daily_limit") ?? "").trim();
  return { p_daily_limit: raw ? Number(raw) : null, p_frozen: fd.get("frozen") === "on" };
}
