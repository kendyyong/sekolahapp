import { Field, Input, Select } from "@/components/ui";

export const LEVELS = ["TK", "SD", "MI", "SMP", "MTs", "SMA", "MA", "SMK", "LAINNYA"];

export interface SchoolDraft { name?: string; level?: string; npsn?: string; phone?: string; address?: string }

/** Isian data sekolah untuk pendaftaran (dipakai /daftar dan /sekolah-baru). */
export function SchoolFields({ draft = {} }: { draft?: SchoolDraft }) {
  return (
    <>
      <Field label="Nama sekolah"><Input id="school_name" name="school_name" required minLength={3} defaultValue={draft.name} placeholder="SMP Harapan Bangsa" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jenjang">
          <Select id="level" name="level" defaultValue={draft.level ?? "SD"}>{LEVELS.map((l) => <option key={l} value={l}>{l === "LAINNYA" ? "Lainnya" : l}</option>)}</Select>
        </Field>
        <Field label="NPSN (opsional)"><Input id="npsn" name="npsn" inputMode="numeric" pattern="[0-9]{8}" title="8 digit angka" defaultValue={draft.npsn} /></Field>
      </div>
      <Field label="Telepon sekolah (opsional)"><Input id="school_phone" name="school_phone" type="tel" defaultValue={draft.phone} /></Field>
      <Field label="Alamat (opsional)"><Input id="address" name="address" defaultValue={draft.address} /></Field>
    </>
  );
}

export function schoolDraftFrom(fd: FormData): SchoolDraft {
  const v = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
  return { name: v("school_name"), level: v("level"), npsn: v("npsn"), phone: v("school_phone"), address: v("address") };
}

export function registerParams(d: SchoolDraft) {
  return { p_name: d.name ?? "", p_level: d.level ?? "LAINNYA", p_npsn: d.npsn ?? null, p_address: d.address ?? null, p_phone: d.phone ?? null };
}
