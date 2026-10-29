-- Apakah sekolah sudah bisa menerima pembayaran online? Orang tua tidak boleh membaca
-- school_payment_accounts, jadi aplikasi menanyakannya lewat fungsi ini untuk menampilkan
-- atau menyembunyikan tombol "Bayar online".
create or replace function public.online_payment_enabled(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.is_member(p_school) or public.is_platform_admin())
     and exists (select 1 from school_payment_accounts where school_id = p_school and status = 'live');
$$;
revoke all on function public.online_payment_enabled(uuid) from public, anon;
grant execute on function public.online_payment_enabled(uuid) to authenticated;
