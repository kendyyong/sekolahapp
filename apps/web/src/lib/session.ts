import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "school_admin" | "principal" | "teacher" | "counselor" | "finance" | "canteen" | "student" | "guardian";

export const ROLE_LABEL: Record<Role, string> = {
  school_admin: "Admin Sekolah",
  principal: "Kepala Sekolah",
  teacher: "Guru",
  counselor: "Guru BK",
  finance: "Tata Usaha",
  canteen: "Petugas Kantin",
  student: "Murid",
  guardian: "Orang Tua",
};

export const ROLE_HOME: Record<Role, string> = {
  school_admin: "/admin",
  principal: "/kepsek",
  teacher: "/guru",
  counselor: "/bk",
  finance: "/tu",
  canteen: "/kantin",
  student: "/murid",
  guardian: "/ortu",
};

export interface RoleOption { school_id: string; school_name: string; role: Role }

/** Modul paket langganan (lihat tabel plans di database). */
export type Module = "core" | "staff" | "finance" | "grades" | "counseling" | "dashboard" | "foundation" | "whitelabel" | "ppdb" | "cbt" | "whatsapp" | "canteen" | "payroll";

export const MODULE_LABEL: Record<Module, string> = {
  core: "Absensi, tugas, izin, pengumuman, pesan",
  staff: "Absen & cuti guru, arahan kepala sekolah",
  finance: "SPP & pembayaran online",
  grades: "Penilaian & rapor",
  counseling: "BK & catatan sikap",
  dashboard: "Dasbor kepala sekolah",
  foundation: "Dasbor yayasan",
  whitelabel: "Nama & logo sekolah sendiri",
  ppdb: "PPDB online (penerimaan murid baru)",
  cbt: "Ujian online (CBT)",
  whatsapp: "Notifikasi WhatsApp",
  canteen: "Kantin digital (jajan pakai kartu pelajar)",
  payroll: "Penggajian guru & staf",
};

export interface AdminScopes { platform: boolean; foundations: { id: string; name: string }[] }

/** Merek sekolah aktif; brand_color & app_name hanya terisi bila paketnya memuat whitelabel. */
export interface SchoolBrand {
  name: string; slug: string; logo_url: string | null; motto: string | null;
  brand_color: string | null; app_name: string | null;
}

export const ACTIVE_ROLE_COOKIE = "sa_active";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: roles }, { data: scopeData }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone, avatar_url").eq("id", user.id).single(),
    supabase.rpc("my_roles"),
    supabase.rpc("my_admin_scopes"),
  ]);
  const scopes = (scopeData ?? { platform: false, foundations: [] }) as AdminScopes;
  const options = (roles ?? []) as RoleOption[];

  const raw = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value;
  const [sid, r] = raw?.split("|") ?? [];
  const active = options.find((o) => o.school_id === sid && o.role === r) ?? options[0] ?? null;

  const [{ data: mods }, { data: brandData }] = active
    ? await Promise.all([
        supabase.rpc("school_modules", { p_school: active.school_id }),
        supabase.rpc("school_brand", { p_school: active.school_id }),
      ])
    : [{ data: [] }, { data: null }];
  const modules = (mods ?? []) as Module[];
  const brand = (brandData ?? null) as SchoolBrand | null;

  return { supabase, user, profile, roles: options, active, scopes, modules, brand };
});

/** Halaman pemilik platform (super admin). */
export async function requirePlatform() {
  const s = await getSession();
  if (!s.scopes.platform) redirect("/mulai");
  return s;
}

/** Halaman admin yayasan; `id` memilih yayasan bila mengelola lebih dari satu. */
export async function requireFoundation(id?: string) {
  const s = await getSession();
  const foundation = s.scopes.foundations.find((f) => f.id === id) ?? s.scopes.foundations[0];
  if (!foundation) redirect("/mulai");
  return { ...s, foundation };
}

/** Halaman yang hanya boleh dibuka peran tertentu. Mengembalikan sesi dengan peran aktif. */
export async function requireRole(...allowed: Role[]) {
  const s = await getSession();
  if (!s.active) redirect("/tanpa-peran");
  if (!allowed.includes(s.active.role)) redirect(ROLE_HOME[s.active.role]);
  return { ...s, active: s.active, schoolId: s.active.school_id };
}

/** Seperti requireRole, tetapi halaman juga butuh modul paket tertentu. */
export async function requireModule(module: Module, ...allowed: Role[]) {
  const s = await requireRole(...allowed);
  if (!s.modules.includes(module)) redirect(`/paket?fitur=${module}`);
  return s;
}
