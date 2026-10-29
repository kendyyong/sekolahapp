import type { Module, Role } from "@/lib/session";
import type { IconName } from "@/components/icons";

/**
 * `module`: item hanya tampil bila paket sekolah memuat modul ini.
 * `group`: judul kelompok di sidebar; item tanpa group ikut kelompok sebelumnya.
 */
export interface NavItem { href: string; label: string; icon?: IconName; module?: Module; group?: string }

const announcements: NavItem = { href: "/pengumuman", label: "Pengumuman", icon: "megaphone" };
const staffSelf: NavItem[] = [
  { href: "/pegawai", label: "Absen & Cuti Saya", icon: "fingerprint", module: "staff", group: "Kepegawaian" },
  { href: "/pegawai/arahan", label: "Arahan Kepsek", icon: "clipboardList", module: "staff" },
];

export const NAV: Record<Role, NavItem[]> = {
  school_admin: [
    { href: "/admin", label: "Ringkasan", icon: "dashboard", group: "Utama" },
    { href: "/admin/kelas", label: "Kelas & Tahun Ajaran", icon: "school", group: "Akademik" },
    { href: "/admin/mapel", label: "Mapel & Pengajar", icon: "book" },
    { href: "/admin/murid", label: "Data Murid", icon: "users" },
    { href: "/admin/rapor", label: "E-Rapor", icon: "scroll", module: "grades" },
    { href: "/admin/ppdb", label: "PPDB Online", icon: "userPlus", module: "ppdb" },
    { href: "/admin/kartu", label: "Kartu Pelajar", icon: "idCard", group: "Operasional" },
    { href: "/kios", label: "Kios Absen", icon: "scan" },
    { ...announcements },
    { href: "/admin/identitas", label: "Identitas & Merek", icon: "building", group: "Administrasi" },
    { href: "/admin/pengguna", label: "Akun & Peran", icon: "userCog" },
    { href: "/admin/pengaturan", label: "Pengaturan Sekolah", icon: "settings" },
    { href: "/admin/langganan", label: "Langganan & Paket", icon: "card" },
  ],
  principal: [
    { href: "/kepsek", label: "Dasbor", icon: "dashboard", module: "dashboard", group: "Utama" },
    { href: "/admin/rapor", label: "E-Rapor", icon: "scroll", module: "grades" },
    { href: "/admin/ppdb", label: "PPDB Online", icon: "userPlus", module: "ppdb" },
    { href: "/kepsek/cuti", label: "Persetujuan Cuti", icon: "calendarCheck", module: "staff", group: "Kepegawaian" },
    { href: "/kepsek/arahan", label: "Arahan untuk Guru", icon: "clipboardList", module: "staff" },
    { href: "/kepsek/kehadiran", label: "Kehadiran Guru", icon: "userCheck", module: "staff" },
    { ...announcements, group: "Komunikasi" },
  ],
  teacher: [
    { href: "/guru", label: "Hari Ini", icon: "calendar", group: "Utama" },
    { href: "/guru/absensi", label: "Absensi Kelas", icon: "clipboardCheck", group: "Pembelajaran" },
    { href: "/guru/tugas", label: "Tugas & PR", icon: "notebookPen" },
    { href: "/guru/ujian", label: "Ujian Online", icon: "timer", module: "cbt" },
    { href: "/guru/nilai", label: "Nilai & Rapor", icon: "graduation", module: "grades" },
    { href: "/guru/rapor", label: "Rapor Kelas (Wali)", icon: "scroll", module: "grades" },
    { href: "/guru/kelas-online", label: "Kelas Online", icon: "video" },
    { href: "/guru/kelompok", label: "Verifikasi Kelompok", icon: "usersRound" },
    { href: "/kios", label: "Kios Absen", icon: "scan" },
    { href: "/guru/izin", label: "Izin Murid", icon: "mailOpen", group: "Komunikasi" },
    { href: "/guru/pesan", label: "Pesan Orang Tua", icon: "messages" },
    { ...announcements },
    ...staffSelf,
  ],
  counselor: [
    { href: "/bk", label: "Murid Perlu Perhatian", icon: "heart", module: "counseling", group: "Bimbingan Konseling" },
    { href: "/bk/catatan", label: "Catatan Konseling", icon: "notebookText", module: "counseling" },
    { ...announcements, group: "Komunikasi" },
    ...staffSelf,
  ],
  finance: [
    { href: "/tu", label: "Ringkasan Keuangan", icon: "wallet", module: "finance", group: "Keuangan" },
    { href: "/tu/tagihan", label: "Tagihan & Pembayaran", icon: "receipt", module: "finance" },
    { href: "/tu/tunggakan", label: "Tunggakan", icon: "alert", module: "finance" },
    { href: "/admin/ppdb", label: "PPDB Online", icon: "userPlus", module: "ppdb" },
    { href: "/tu/biaya", label: "Master Biaya", icon: "tags", module: "finance", group: "Pengaturan Biaya" },
    { href: "/tu/beasiswa", label: "Beasiswa & Potongan", icon: "percent", module: "finance" },
    { href: "/kios", label: "Kios Absen", icon: "scan", group: "Operasional" },
    { ...announcements },
    ...staffSelf,
  ],
  student: [
    { href: "/murid", label: "Beranda", icon: "home", group: "Utama" },
    { href: "/murid/absen", label: "Absen", icon: "mapPin" },
    { href: "/murid/tugas", label: "Tugas & PR", icon: "notebookPen", group: "Belajar" },
    { href: "/murid/ujian", label: "Ujian Online", icon: "timer", module: "cbt" },
    { href: "/murid/kelompok", label: "Kelompok Kerja", icon: "usersRound" },
    { href: "/murid/rapor", label: "Rapor", icon: "scroll", module: "grades" },
    { href: "/murid/biaya", label: "Biaya Sekolah", icon: "wallet", module: "finance", group: "Lainnya" },
    { ...announcements },
  ],
  guardian: [
    { href: "/ortu", label: "Anak Saya", icon: "users", group: "Utama" },
    { href: "/ortu/rapor", label: "Rapor", icon: "scroll", module: "grades" },
    { href: "/ortu/izin", label: "Pengajuan Izin", icon: "mailOpen", group: "Layanan" },
    { href: "/ortu/tagihan", label: "Tagihan & Bayar", icon: "receipt", module: "finance" },
    { href: "/ortu/pesan", label: "Pesan Wali Kelas", icon: "messages" },
    { ...announcements },
  ],
};

export const PLATFORM_NAV: NavItem[] = [
  { href: "/platform", label: "Ringkasan", icon: "shield", group: "Pemilik Platform" },
  { href: "/platform/sekolah", label: "Sekolah & Paket", icon: "school" },
  { href: "/platform/tagihan", label: "Tagihan Langganan", icon: "receipt" },
];

export function foundationNav(foundations: { id: string; name: string }[]): NavItem[] {
  const items: NavItem[] = foundations.length === 1
    ? [{ href: "/yayasan", label: foundations[0].name, icon: "landmark" }]
    : foundations.map((f) => ({ href: `/yayasan?f=${f.id}`, label: f.name, icon: "landmark" as const }));
  items[0].group = "Yayasan";
  return items;
}

/** Menyaring item sesuai paket; judul kelompok dipindah ke item pertama yang tersisa. */
export function visibleNav(items: NavItem[], modules: Module[]) {
  let group: string | undefined;
  let shown: string | undefined;
  return items.flatMap((i) => {
    if (i.group) group = i.group;
    if (i.module && !modules.includes(i.module)) return [];
    const item = { ...i, group: group !== shown ? group : undefined };
    shown = group;
    return [item];
  });
}

/** Judul halaman untuk header: label tautan paling spesifik yang cocok dengan path. */
export function navTitle(items: NavItem[], path: string) {
  return items
    .filter((i) => path === i.href.split("?")[0] || path.startsWith(i.href.split("?")[0] + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Semua item dengan judul kelompok terisi, untuk judul halaman di header. */
export function withGroups(items: NavItem[]) {
  let group: string | undefined;
  return items.map((i) => ({ ...i, group: (group = i.group ?? group) }));
}
