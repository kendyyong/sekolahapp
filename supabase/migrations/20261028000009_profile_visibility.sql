-- Perbaikan: kebijakan profiles_read lama membaca memberships di bawah RLS, sehingga
-- orang tua dan murid tidak bisa melihat nama guru (misalnya pengirim pesan wali kelas).
-- Aturan baru:
--   * staf sekolah melihat profil semua anggota sekolahnya;
--   * murid dan orang tua melihat profil staf di sekolahnya (bukan profil orang tua/murid lain).

create or replace function public.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships me
    join memberships them on them.school_id = me.school_id
    where me.user_id = auth.uid() and me.is_active
      and them.user_id = p_user
      and (me.role   in ('school_admin', 'principal', 'teacher', 'counselor', 'finance')
        or them.role in ('school_admin', 'principal', 'teacher', 'counselor', 'finance'))
  );
$$;
revoke execute on function public.can_see_profile(uuid) from public, anon;
grant execute on function public.can_see_profile(uuid) to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.is_platform_admin() or public.can_see_profile(id));
