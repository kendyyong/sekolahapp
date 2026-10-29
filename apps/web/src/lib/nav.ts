import type { Module, Role } from "@/lib/session";

/** `module`: item hanya tampil bila paket sekolah memuat modul ini. */
export interface NavItem { href: string; label: string; module?: Module }

export const NAV: Record<Role, NavItem[]> = {
  school_admin: [
    { href: "/admin", label: "Ringkasan" },
    { href: "/admin/kelas", label: "Kelas & Tahun Ajaran" },
    { href: "/admin/mapel", label: "Mapel & Pengajar" },
    { href: "/admin/murid", label: "Data Murid" },
    { href: "/admin/rapor", label: "E-Rapor", module: "grades" },
    { href: "/admin/kartu", label: "Kartu Pelajar" },
    { href: "/kios", label: "Kios Absen" },
    { href: "/admin/pengguna", label: "Akun & Peran" },
    { href: "/admin/pengaturan", label: "Pengaturan Sekolah" },
    { href: "/admin/langganan", label: "Langganan & Paket" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  principal: [
    { href: "/kepsek", label: "Dasbor", module: "dashboard" },
    { href: "/kepsek/cuti", label: "Persetujuan Cuti", module: "staff" },
    { href: "/kepsek/arahan", label: "Arahan untuk Guru", module: "staff" },
    { href: "/kepsek/kehadiran", label: "Kehadiran Guru", module: "staff" },
    { href: "/admin/rapor", label: "E-Rapor", module: "grades" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  teacher: [
    { href: "/guru", label: "Hari Ini" },
    { href: "/guru/absensi", label: "Absensi Kelas" },
    { href: "/kios", label: "Kios Absen" },
    { href: "/guru/tugas", label: "Tugas & PR" },
    { href: "/guru/nilai", label: "Nilai & Rapor", module: "grades" },
    { href: "/guru/rapor", label: "Rapor Kelas (Wali)", module: "grades" },
    { href: "/guru/kelas-online", label: "Kelas Online" },
    { href: "/guru/kelompok", label: "Verifikasi Kelompok" },
    { href: "/guru/izin", label: "Izin Murid" },
    { href: "/guru/pesan", label: "Pesan Orang Tua" },
    { href: "/pegawai", label: "Absen & Cuti Saya", module: "staff" },
    { href: "/pegawai/arahan", label: "Arahan Kepsek", module: "staff" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  counselor: [
    { href: "/bk", label: "Murid Perlu Perhatian", module: "counseling" },
    { href: "/bk/catatan", label: "Catatan Konseling", module: "counseling" },
    { href: "/pegawai", label: "Absen & Cuti Saya", module: "staff" },
    { href: "/pegawai/arahan", label: "Arahan Kepsek", module: "staff" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  finance: [
    { href: "/tu", label: "Ringkasan Keuangan", module: "finance" },
    { href: "/tu/tagihan", label: "Tagihan & Pembayaran", module: "finance" },
    { href: "/tu/biaya", label: "Master Biaya", module: "finance" },
    { href: "/tu/beasiswa", label: "Beasiswa & Potongan", module: "finance" },
    { href: "/tu/tunggakan", label: "Tunggakan", module: "finance" },
    { href: "/kios", label: "Kios Absen" },
    { href: "/pegawai", label: "Absen & Cuti Saya", module: "staff" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  student: [
    { href: "/murid", label: "Beranda" },
    { href: "/murid/absen", label: "Absen" },
    { href: "/murid/tugas", label: "Tugas & PR" },
    { href: "/murid/kelompok", label: "Kelompok Kerja" },
    { href: "/murid/rapor", label: "Rapor", module: "grades" },
    { href: "/murid/biaya", label: "Biaya Sekolah", module: "finance" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  guardian: [
    { href: "/ortu", label: "Anak Saya" },
    { href: "/ortu/izin", label: "Pengajuan Izin" },
    { href: "/ortu/rapor", label: "Rapor", module: "grades" },
    { href: "/ortu/tagihan", label: "Tagihan & Bayar", module: "finance" },
    { href: "/ortu/pesan", label: "Pesan Wali Kelas" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
};

export const PLATFORM_NAV: NavItem[] = [
  { href: "/platform", label: "Ringkasan" },
  { href: "/platform/sekolah", label: "Sekolah & Paket" },
  { href: "/platform/tagihan", label: "Tagihan Langganan" },
];

export function foundationNav(foundations: { id: string; name: string }[]): NavItem[] {
  return foundations.length === 1
    ? [{ href: "/yayasan", label: foundations[0].name }]
    : foundations.map((f) => ({ href: `/yayasan?f=${f.id}`, label: f.name }));
}

export const visibleNav = (items: NavItem[], modules: Module[]) =>
  items.filter((i) => !i.module || modules.includes(i.module));
