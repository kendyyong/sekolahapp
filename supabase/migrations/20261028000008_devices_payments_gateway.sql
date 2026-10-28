-- =====================================================================
-- SekolahApp · 0008 · Token perangkat (push), akun Xendit sekolah
-- =====================================================================

-- Token FCM per perangkat, untuk notifikasi push.
create table public.device_tokens (
  token       text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null check (platform in ('android', 'ios', 'web')),
  updated_at  timestamptz not null default now()
);
create index on public.device_tokens (user_id);
alter table public.device_tokens enable row level security;
create policy device_tokens_own on public.device_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Akun pembayaran sekolah (sub-akun xenPlatform). Hanya service role & admin platform.
create table public.school_payment_accounts (
  school_id          uuid primary key references public.schools(id) on delete cascade,
  provider           text not null default 'xendit',
  sub_account_id     text not null,                 -- for-user-id di Xendit
  status             text not null default 'pending' check (status in ('pending', 'live', 'suspended')),
  -- siapa menanggung biaya layanan: 'payer' (orang tua) atau 'school'
  service_fee_bearer text not null default 'payer' check (service_fee_bearer in ('payer', 'school')),
  created_at         timestamptz not null default now()
);
alter table public.school_payment_accounts enable row level security;
create policy spa_read on public.school_payment_accounts for select
  using (public.has_role(school_id, array['finance','school_admin','principal']::public.app_role[]) or public.is_platform_admin());
create policy spa_write on public.school_payment_accounts for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Apakah biaya langganan per siswa sudah terpotong bulan ini untuk murid ini?
create or replace function public.platform_fee_collected(p_student uuid, p_month date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from payments p join invoices i on i.id = p.invoice_id
    where i.student_id = p_student and p.platform_fee > 0 and p.status in ('pending', 'paid')
      and p.created_at >= date_trunc('month', p_month) and p.created_at < date_trunc('month', p_month) + interval '1 month')
$$;
revoke execute on function public.platform_fee_collected(uuid, date) from public, anon, authenticated;

-- Relasi paket langganan (untuk membaca harga per siswa bersama data sekolah).
alter table public.schools add constraint schools_plan_fkey foreign key (plan) references public.plans(tier);
