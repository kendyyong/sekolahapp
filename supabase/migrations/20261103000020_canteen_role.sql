-- =====================================================================
-- SekolahApp · 0020 · Peran "Petugas Kantin"
-- Dipisah dari 0021 karena nilai enum baru baru bisa dipakai setelah
-- transaksi yang menambahkannya selesai.
-- =====================================================================
alter type public.app_role add value if not exists 'canteen';
