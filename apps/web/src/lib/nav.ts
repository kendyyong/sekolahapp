import type { Role } from "@/lib/session";

export interface NavItem { href: string; label: string }

export const NAV: Record<Role, NavItem[]> = {
  school_admin: [
    { href: "/admin", label: "Ringkasan" },
    { href: "/admin/kelas", label: "Kelas & Tahun Ajaran" },
    { href: "/admin/mapel", label: "Mapel & Pengajar" },
    { href: "/admin/murid", label: "Data Murid" },
    { href: "/admin/kartu", label: "Kartu Pelajar" },
    { href: "/kios", label: "Kios Absen" },
    { href: "/admin/pengguna", label: "Akun & Peran" },
    { href: "/admin/pengaturan", label: "Pengaturan Sekolah" },
    { href: "/admin/langganan", label: "Langganan & Paket" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  principal: [
    { href: "/kepsek", label: "Dasbor" },
    { href: "/kepsek/cuti", label: "Persetujuan Cuti" },
    { href: "/kepsek/arahan", label: "Arahan untuk Guru" },
    { href: "/kepsek/kehadiran", label: "Kehadiran Guru" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  teacher: [
    { href: "/guru", label: "Hari Ini" },
    { href: "/guru/absensi", label: "Absensi Kelas" },
    { href: "/kios", label: "Kios Absen" },
    { href: "/guru/tugas", label: "Tugas & PR" },
    { href: "/guru/kelas-online", label: "Kelas Online" },
    { href: "/guru/kelompok", label: "Verifikasi Kelompok" },
    { href: "/guru/izin", label: "Izin Murid" },
    { href: "/guru/pesan", label: "Pesan Orang Tua" },
    { href: "/pegawai", label: "Absen & Cuti Saya" },
    { href: "/pegawai/arahan", label: "Arahan Kepsek" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  counselor: [
    { href: "/bk", label: "Murid Perlu Perhatian" },
    { href: "/bk/catatan", label: "Catatan Konseling" },
    { href: "/pegawai", label: "Absen & Cuti Saya" },
    { href: "/pegawai/arahan", label: "Arahan Kepsek" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  finance: [
    { href: "/tu", label: "Ringkasan Keuangan" },
    { href: "/tu/tagihan", label: "Tagihan & Pembayaran" },
    { href: "/tu/biaya", label: "Master Biaya" },
    { href: "/tu/beasiswa", label: "Beasiswa & Potongan" },
    { href: "/tu/tunggakan", label: "Tunggakan" },
    { href: "/kios", label: "Kios Absen" },
    { href: "/pegawai", label: "Absen & Cuti Saya" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  student: [
    { href: "/murid", label: "Beranda" },
    { href: "/murid/absen", label: "Absen" },
    { href: "/murid/tugas", label: "Tugas & PR" },
    { href: "/murid/kelompok", label: "Kelompok Kerja" },
    { href: "/murid/biaya", label: "Biaya Sekolah" },
    { href: "/pengumuman", label: "Pengumuman" },
  ],
  guardian: [
    { href: "/ortu", label: "Anak Saya" },
    { href: "/ortu/izin", label: "Pengajuan Izin" },
    { href: "/ortu/tagihan", label: "Tagihan & Bayar" },
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
