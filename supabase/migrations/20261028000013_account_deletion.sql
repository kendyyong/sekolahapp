-- =====================================================================
-- SekolahApp · 0013 · Permintaan hapus akun (UU PDP & kebijakan Google Play)
-- Pengguna mengajukan dari aplikasi/web; admin sekolah dan admin platform
-- diberi tahu; admin platform menyelesaikan setelah akun dihapus.
-- =====================================================================

create table public.account_deletion_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  email       text not null,
  full_name   text,
  reason      text,
  status      public.request_status not null default 'pending',
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index account_deletion_one_pending on public.account_deletion_requests (user_id) where status = 'pending';

alter table public.account_deletion_requests enable row level security;
create policy adr_read on public.account_deletion_requests for select
  using (user_id = auth.uid() or public.is_platform_admin());

create or replace function public.request_account_deletion(p_reason text default null)
returns public.account_deletion_requests language plpgsql security definer set search_path = public as $$
declare v_profile profiles; r account_deletion_requests;
begin
  select * into v_profile from profiles where id = auth.uid();
  if v_profile.id is null then raise exception 'Silakan masuk terlebih dahulu'; end if;
  if exists (select 1 from account_deletion_requests where user_id = v_profile.id and status = 'pending') then
    raise exception 'Permintaan hapus akun Anda sedang diproses';
  end if;
  insert into account_deletion_requests (user_id, email, full_name, reason)
  values (v_profile.id, coalesce(v_profile.email, ''), v_profile.full_name, nullif(trim(p_reason), ''))
  returning * into r;

  -- Admin sekolah tempat pengguna terdaftar ikut diberi tahu (data murid/pegawai dikelola sekolah).
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select distinct m2.user_id, m.school_id, 'account.deletion_requested',
         coalesce(v_profile.full_name, v_profile.email) || ' meminta penghapusan akun',
         coalesce(r.reason, 'Tanpa alasan.'), 'account_deletion_requests', r.id
  from memberships m join memberships m2 on m2.school_id = m.school_id and m2.role = 'school_admin'
  where m.user_id = v_profile.id and m2.user_id <> v_profile.id;
  perform public.notify_platform_admins('account.deletion_requested',
    coalesce(v_profile.full_name, v_profile.email) || ' meminta penghapusan akun', coalesce(r.reason, ''),
    'account_deletion_requests', r.id);
  return r;
end $$;

create or replace function public.cancel_account_deletion()
returns void language sql security definer set search_path = public as $$
  update account_deletion_requests set status = 'cancelled' where user_id = auth.uid() and status = 'pending'
$$;

-- Admin platform menandai selesai (setelah menghapus pengguna di Supabase Auth) atau menolak dengan alasan.
create or replace function public.review_account_deletion(p_id uuid, p_done boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r account_deletion_requests;
begin
  if not public.is_platform_admin() then raise exception 'Hanya admin platform'; end if;
  update account_deletion_requests
     set status = case when p_done then 'approved' else 'rejected' end::request_status,
         review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id and status = 'pending' returning * into r;
  if r.id is null then raise exception 'Permintaan tidak ditemukan atau sudah diproses'; end if;
  if not p_done then
    perform public.notify(r.user_id, null, 'account.deletion_reviewed', 'Permintaan hapus akun ditolak',
      coalesce(p_note, ''), 'account_deletion_requests', r.id);
  end if;
end $$;
