-- =====================================================================
-- SekolahApp · 0018 · Notifikasi WhatsApp
-- Setiap notifikasi aplikasi yang kategorinya diaktifkan sekolah juga
-- dikirim ke WhatsApp penerima lewat gateway Fonnte (nomor WA milik
-- sekolah). Antrean disimpan di whatsapp_outbox dan dikirim Edge
-- Function wa-dispatch. Token gateway hanya bisa ditulis admin dan
-- dibaca service role.
-- =====================================================================

update public.plans set modules = array_append(modules, 'whatsapp')
 where tier in ('pro', 'enterprise') and not ('whatsapp' = any(modules));

create or replace function public.module_label(p_module text)
returns text language sql immutable as $$
  select case p_module
    when 'staff' then 'Absen & cuti guru'
    when 'finance' then 'SPP & pembayaran'
    when 'grades' then 'Penilaian & rapor'
    when 'counseling' then 'BK & catatan sikap'
    when 'dashboard' then 'Dasbor kepala sekolah'
    when 'foundation' then 'Dasbor yayasan'
    when 'ppdb' then 'PPDB online'
    when 'cbt' then 'Ujian online (CBT)'
    when 'whatsapp' then 'Notifikasi WhatsApp'
    else p_module end
$$;

-- Penerima bisa berhenti menerima WhatsApp (notifikasi di aplikasi tetap ada).
alter table public.profiles add column if not exists wa_opt_out boolean not null default false;

-- Kategori notifikasi yang bisa dipilih sekolah.
create or replace function public.wa_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind like 'attendance.%' then 'kehadiran'
    when p_kind in ('invoice.new', 'payment.paid') then 'tagihan'
    when p_kind like 'leave.%' then 'izin'
    when p_kind = 'announcement' then 'pengumuman'
    when p_kind = 'message' then 'pesan'
    when p_kind in ('assignment.new', 'submission.graded', 'report.published', 'exam.scheduled', 'exam.reset', 'online_session.new') then 'akademik'
    when p_kind like 'ppdb.%' then 'ppdb'
    when p_kind like 'staff_leave.%' or p_kind like 'directive.%' then 'kepegawaian'
    else null end
$$;

-- Nomor WA dalam format 62xxxxxxxxxx, atau null bila tidak valid.
create or replace function public.wa_number(p_phone text)
returns text language sql immutable as $$
  select case when n ~ '^62[0-9]{8,13}$' then n end
  from (select case
                 when d like '0%' then '62' || substr(d, 2)
                 when d like '8%' then '62' || d
                 else d end n
          from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') d) x) y
$$;

create table public.whatsapp_settings (
  school_id   uuid primary key references public.schools(id) on delete cascade,
  is_enabled  boolean not null default false,
  categories  text[] not null default array['kehadiran', 'tagihan', 'izin', 'pengumuman', 'pesan', 'ppdb'],
  token_hint  text,                       -- 4 karakter terakhir token, untuk ditampilkan
  device      text,                       -- nomor WA pengirim (informasi)
  updated_at  timestamptz not null default now(),
  check (categories <@ array['kehadiran', 'tagihan', 'izin', 'pengumuman', 'pesan', 'akademik', 'ppdb', 'kepegawaian'])
);
create trigger whatsapp_settings_module before insert on public.whatsapp_settings
  for each row execute function public.require_module('whatsapp');
create trigger whatsapp_settings_touch before update on public.whatsapp_settings
  for each row execute function public.touch_updated_at();

-- Token gateway: tanpa kebijakan RLS sama sekali, jadi hanya service role yang membaca.
create table public.whatsapp_tokens (
  school_id  uuid primary key references public.schools(id) on delete cascade,
  api_token  text not null
);

create type public.wa_status as enum ('queued', 'sent', 'failed');

create table public.whatsapp_outbox (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  notification_id uuid references public.notifications(id) on delete set null,
  phone           text not null,
  kind            text not null,
  title           text not null,
  body            text,
  status          public.wa_status not null default 'queued',
  attempts        smallint not null default 0,
  error           text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index on public.whatsapp_outbox (school_id, created_at desc);
create index on public.whatsapp_outbox (status, created_at) where status = 'queued';
create index on public.whatsapp_outbox (notification_id);

alter table public.whatsapp_settings enable row level security;
alter table public.whatsapp_tokens enable row level security;
alter table public.whatsapp_outbox enable row level security;

create policy whatsapp_settings_read on public.whatsapp_settings for select using (public.is_school_manager(school_id));
create policy whatsapp_settings_write on public.whatsapp_settings for all
  using (public.has_role(school_id, array['school_admin']::public.app_role[]))
  with check (public.has_role(school_id, array['school_admin']::public.app_role[]));
create policy whatsapp_outbox_read on public.whatsapp_outbox for select using (public.is_school_manager(school_id));

-- Admin menyimpan token Fonnte; yang tersimpan di pengaturan hanya 4 karakter terakhirnya.
create or replace function public.wa_set_token(p_school uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v_token text := btrim(coalesce(p_token, ''));
begin
  if not public.has_role(p_school, array['school_admin']::public.app_role[]) then
    raise exception 'Hanya admin sekolah yang bisa mengatur WhatsApp';
  end if;
  if not public.school_has_module(p_school, 'whatsapp') then
    raise exception 'Fitur % belum termasuk paket sekolah Anda. Admin sekolah dapat menaikkan paket di menu Langganan & Paket.',
      public.module_label('whatsapp');
  end if;
  insert into whatsapp_settings (school_id) values (p_school) on conflict do nothing;
  if v_token = '' then
    delete from whatsapp_tokens where school_id = p_school;
    update whatsapp_settings set token_hint = null, is_enabled = false where school_id = p_school;
    return;
  end if;
  if length(v_token) < 10 or length(v_token) > 200 or v_token ~ '\s' then raise exception 'Token tidak valid'; end if;
  insert into whatsapp_tokens (school_id, api_token) values (p_school, v_token)
  on conflict (school_id) do update set api_token = excluded.api_token;
  update whatsapp_settings set token_hint = right(v_token, 4) where school_id = p_school;
end $$;
revoke execute on function public.wa_set_token(uuid, text) from public, anon;
grant execute on function public.wa_set_token(uuid, text) to authenticated;

-- Notifikasi baru → antrean WhatsApp bila sekolah mengaktifkan kategorinya.
create or replace function public.queue_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cat text := public.wa_category(new.kind); v_phone text;
begin
  if v_cat is null or new.school_id is null then return new; end if;
  if not exists (select 1 from whatsapp_settings w where w.school_id = new.school_id and w.is_enabled and v_cat = any(w.categories)
                   and w.token_hint is not null)
     or not public.school_has_module(new.school_id, 'whatsapp') then
    return new;
  end if;
  select public.wa_number(p.phone) into v_phone from profiles p where p.id = new.user_id and not p.wa_opt_out;
  if v_phone is null then return new; end if;
  insert into whatsapp_outbox (school_id, user_id, notification_id, phone, kind, title, body)
  values (new.school_id, new.user_id, new.id, v_phone, new.kind, new.title, new.body);
  return new;
end $$;
create trigger notifications_whatsapp after insert on public.notifications
  for each row execute function public.queue_whatsapp();

-- Mengambil antrean untuk dikirim (dipakai Edge Function dengan service role).
create or replace function public.wa_claim(p_notification uuid default null, p_limit int default 50)
returns table (id uuid, school_id uuid, phone text, kind text, title text, body text, school_name text, api_token text)
language sql security definer set search_path = public as $$
  update whatsapp_outbox o set attempts = attempts + 1
    from schools s, whatsapp_tokens t
   where o.id in (select x.id from whatsapp_outbox x
                   where x.status = 'queued' and x.attempts < 5
                     and (p_notification is null or x.notification_id = p_notification)
                     and (p_notification is not null or x.created_at < now() - interval '1 minute')
                   order by x.created_at limit p_limit for update skip locked)
     and s.id = o.school_id and t.school_id = o.school_id
  returning o.id, o.school_id, o.phone, o.kind, o.title, o.body, s.name, t.api_token
$$;
revoke execute on function public.wa_claim(uuid, int) from public, anon, authenticated;
grant execute on function public.wa_claim(uuid, int) to service_role;
