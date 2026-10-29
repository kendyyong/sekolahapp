-- =====================================================================
-- SekolahApp · 0021 · Kantin digital (modul paket "canteen")
-- Murid jajan dengan kartu pelajar (QR) atau NIS; saldo diisi orang tua
-- lewat tagihan "Isi saldo kantin" (bayar online / di loket TU) atau
-- tunai di TU. Orang tua bisa memasang batas jajan harian dan membekukan
-- kartu. TU menyetor hasil penjualan ke tiap kios (dikurangi bagi hasil).
-- Saldo hanya berubah lewat fungsi di file ini, selalu dengan jejak di
-- canteen_ledger.
-- =====================================================================

update public.plans set modules = array_append(modules, 'canteen')
 where tier in ('pro', 'enterprise') and not ('canteen' = any(modules));

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
    when 'canteen' then 'Kantin digital'
    else p_module end
$$;

-- Notifikasi kantin ikut kategori WhatsApp "tagihan".
create or replace function public.wa_category(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind like 'attendance.%' then 'kehadiran'
    when p_kind in ('invoice.new', 'payment.paid') or p_kind like 'canteen.%' then 'tagihan'
    when p_kind like 'leave.%' then 'izin'
    when p_kind = 'announcement' then 'pengumuman'
    when p_kind = 'message' then 'pesan'
    when p_kind in ('assignment.new', 'submission.graded', 'report.published', 'exam.scheduled', 'exam.reset', 'online_session.new') then 'akademik'
    when p_kind like 'ppdb.%' then 'ppdb'
    when p_kind like 'staff_leave.%' or p_kind like 'directive.%' then 'kepegawaian'
    else null end
$$;

create or replace function public.rp(p_amount bigint)
returns text language sql immutable as $$ select 'Rp' || replace(to_char(p_amount, 'FM999,999,999,999'), ',', '.') $$;

-- ---------------------------------------------------------------------
-- Kios, menu, dompet, buku saldo, setoran
-- ---------------------------------------------------------------------
create table public.canteen_stalls (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools(id) on delete cascade,
  name           text not null check (length(name) between 2 and 80),
  operator_ids   uuid[] not null default '{}',     -- akun yang boleh menjadi kasir kios ini
  commission_pct numeric(5,2) not null default 0 check (commission_pct between 0 and 100),   -- bagi hasil untuk sekolah
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (school_id, name)
);
create trigger canteen_stalls_module before insert on public.canteen_stalls
  for each row execute function public.require_module('canteen');

create or replace function public.guard_canteen_stall()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from unnest(new.operator_ids) o
              where not exists (select 1 from memberships m where m.user_id = o and m.school_id = new.school_id and m.is_active)) then
    raise exception 'Petugas kios harus pengguna aktif sekolah ini';
  end if;
  return new;
end $$;
create trigger canteen_stalls_guard before insert or update on public.canteen_stalls
  for each row execute function public.guard_canteen_stall();

create or replace function public.is_stall_operator(p_stall uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from canteen_stalls s
                  where s.id = p_stall and auth.uid() = any(s.operator_ids)
                    and exists (select 1 from memberships m where m.user_id = auth.uid() and m.school_id = s.school_id and m.is_active))
$$;

create table public.canteen_items (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  stall_id     uuid not null references public.canteen_stalls(id) on delete cascade,
  name         text not null check (length(name) between 1 and 60),
  price        bigint not null check (price between 100 and 1000000),
  is_available boolean not null default true,
  position     smallint not null default 0
);
create index on public.canteen_items (stall_id, position);
create trigger canteen_items_same_school before insert or update on public.canteen_items
  for each row execute function public.assert_same_school('canteen_stalls', 'stall_id');

create table public.canteen_wallets (
  student_id   uuid primary key references public.students(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  balance      bigint not null default 0 check (balance >= 0),
  daily_limit  bigint check (daily_limit between 1000 and 1000000),   -- batas jajan per hari dari orang tua
  is_frozen    boolean not null default false,                         -- kartu dibekukan (hilang, dsb.)
  low_notified boolean not null default false,
  updated_at   timestamptz not null default now()
);
create index on public.canteen_wallets (school_id);

create type public.canteen_entry as enum ('topup', 'purchase', 'refund', 'withdraw', 'adjust');

create table public.canteen_settlements (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools(id) on delete cascade,
  stall_id    uuid not null references public.canteen_stalls(id) on delete restrict,
  period_to   date not null,
  gross       bigint not null,     -- penjualan bersih (pembelian dikurangi pembatalan)
  commission  bigint not null,     -- bagi hasil sekolah
  net         bigint not null,     -- dibayarkan ke kios
  entries     int not null,
  note        text check (length(note) <= 300),
  paid_by     uuid references public.profiles(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
create index on public.canteen_settlements (stall_id, created_at desc);

create table public.canteen_ledger (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  kind          public.canteen_entry not null,
  amount        bigint not null check (amount <> 0),          -- masuk positif, keluar negatif
  balance_after bigint not null,
  stall_id      uuid references public.canteen_stalls(id) on delete restrict,
  items         jsonb,                                         -- [{name, price, qty}] untuk pembelian
  method        text check (method in ('cash', 'online')),     -- untuk isi saldo / penarikan
  invoice_id    uuid unique references public.invoices(id) on delete restrict,
  refund_of     uuid unique references public.canteen_ledger(id),
  settlement_id uuid references public.canteen_settlements(id),
  note          text check (length(note) <= 300),
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  check ((kind in ('topup', 'refund') and amount > 0) or (kind in ('purchase', 'withdraw') and amount < 0) or kind = 'adjust'),
  check ((kind in ('purchase', 'refund')) = (stall_id is not null))
);
create index on public.canteen_ledger (student_id, created_at desc);
create index on public.canteen_ledger (stall_id, created_at desc) where stall_id is not null;
create index on public.canteen_ledger (school_id, created_at desc);

-- Tagihan isi saldo: dibuat dari permintaan orang tua, lunas → saldo bertambah.
alter table public.invoices add column if not exists canteen_topup boolean not null default false;

create or replace function public.canteen_settings(p_school uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'low_balance', coalesce((settings ->> 'canteen_low_balance')::bigint, 10000),
    'max_balance', coalesce((settings ->> 'canteen_max_balance')::bigint, 2000000))
  from schools where id = p_school
$$;

-- ---------------------------------------------------------------------
-- Inti: satu-satunya jalan saldo berubah.
-- ---------------------------------------------------------------------
create or replace function public.canteen_post(
  p_student uuid, p_kind public.canteen_entry, p_amount bigint,
  p_stall uuid default null, p_items jsonb default null, p_method text default null,
  p_invoice uuid default null, p_refund_of uuid default null, p_note text default null)
returns public.canteen_ledger language plpgsql security definer set search_path = public as $$
declare s students; w canteen_wallets; v_set jsonb; e canteen_ledger;
begin
  select * into s from students where id = p_student;
  if s.id is null then raise exception 'Murid tidak ditemukan'; end if;
  if not public.school_has_module(s.school_id, 'canteen') then
    raise exception 'Fitur % belum termasuk paket sekolah Anda. Admin sekolah dapat menaikkan paket di menu Langganan & Paket.',
      public.module_label('canteen');
  end if;
  insert into canteen_wallets (student_id, school_id) values (s.id, s.school_id) on conflict do nothing;
  select * into w from canteen_wallets where student_id = s.id for update;
  if w.balance + p_amount < 0 then
    raise exception 'Saldo % tidak cukup (sisa %)', s.full_name, public.rp(w.balance);
  end if;
  v_set := public.canteen_settings(s.school_id);
  if p_amount > 0 and p_kind = 'topup' and w.balance + p_amount > (v_set ->> 'max_balance')::bigint then
    raise exception 'Saldo maksimal %', public.rp((v_set ->> 'max_balance')::bigint);
  end if;
  update canteen_wallets set balance = balance + p_amount, updated_at = now(),
         low_notified = case when p_amount > 0 and balance + p_amount >= (v_set ->> 'low_balance')::bigint then false else low_notified end
   where student_id = s.id returning * into w;
  insert into canteen_ledger (school_id, student_id, kind, amount, balance_after, stall_id, items, method, invoice_id, refund_of, note)
  values (s.school_id, s.id, p_kind, p_amount, w.balance, p_stall, p_items, p_method, p_invoice, p_refund_of, nullif(btrim(p_note), ''))
  returning * into e;

  if p_amount < 0 and w.balance < (v_set ->> 'low_balance')::bigint and not w.low_notified then
    update canteen_wallets set low_notified = true where student_id = s.id;
    insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
    select g.guardian_id, s.school_id, 'canteen.low_balance', 'Saldo kantin ' || s.full_name || ' tinggal ' || public.rp(w.balance),
           'Isi saldo dari menu Saldo Kantin agar ananda tetap bisa jajan dengan kartu pelajar.', 'students', s.id
      from guardian_links g where g.student_id = s.id;
  end if;
  return e;
end $$;
revoke execute on function public.canteen_post(uuid, public.canteen_entry, bigint, uuid, jsonb, text, uuid, uuid, text) from public, anon, authenticated;

-- Kartu pelajar (QR "sekolahapp:card:<token>") atau NIS → murid aktif di sekolah itu.
create or replace function public.canteen_find_student(p_school uuid, p_code text)
returns public.students language plpgsql stable security definer set search_path = public as $$
declare v text := btrim(coalesce(p_code, '')); s students;
begin
  select * into s from students
   where school_id = p_school and (card_token = lower(regexp_replace(v, '^sekolahapp:card:', '', 'i')) or nis = v)
   order by (card_token = lower(regexp_replace(v, '^sekolahapp:card:', '', 'i'))) desc nulls last limit 1;
  if s.id is null then raise exception 'Kartu atau NIS tidak dikenal'; end if;
  if s.status <> 'aktif' then raise exception '% tidak berstatus aktif', s.full_name; end if;
  return s;
end $$;
revoke execute on function public.canteen_find_student(uuid, text) from public, anon, authenticated;

-- Jajan hari ini (bersih dari pembatalan) untuk batas harian.
create or replace function public.canteen_spent_today(p_student uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(-sum(l.amount), 0)::bigint from canteen_ledger l
   where l.student_id = p_student and l.kind in ('purchase', 'refund')
     and (l.created_at at time zone coalesce((select timezone from schools where id = l.school_id), 'Asia/Jakarta'))::date
         = public.school_today(l.school_id)
$$;

-- ---------------------------------------------------------------------
-- Kasir kios
-- ---------------------------------------------------------------------
create or replace function public.canteen_can_cashier(p_stall uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_stall_operator(p_stall)
      or exists (select 1 from canteen_stalls s where s.id = p_stall
                   and public.has_role(s.school_id, array['finance', 'school_admin']::public.app_role[]))
$$;

-- Cek kartu sebelum membayar: nama, kelas, dan berapa yang masih bisa dibelanjakan hari ini.
create or replace function public.canteen_lookup(p_stall uuid, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st canteen_stalls; s students; w canteen_wallets; v_left bigint;
begin
  select * into st from canteen_stalls where id = p_stall;
  if st.id is null or not public.canteen_can_cashier(p_stall) then raise exception 'Anda bukan kasir kios ini'; end if;
  s := public.canteen_find_student(st.school_id, p_code);
  select * into w from canteen_wallets where student_id = s.id;
  v_left := coalesce(w.balance, 0);
  if w.daily_limit is not null then v_left := least(v_left, greatest(w.daily_limit - public.canteen_spent_today(s.id), 0)); end if;
  return jsonb_build_object('student_id', s.id, 'full_name', s.full_name, 'nis', s.nis,
    'class_name', (select name from classes where id = public.current_class_of(s.id)),
    'spendable', v_left, 'frozen', coalesce(w.is_frozen, false), 'limited', w.daily_limit is not null);
end $$;
revoke execute on function public.canteen_lookup(uuid, text) from public, anon;
grant execute on function public.canteen_lookup(uuid, text) to authenticated;

create or replace function public.canteen_charge(p_stall uuid, p_code text, p_amount bigint, p_items jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare st canteen_stalls; s students; w canteen_wallets; e canteen_ledger;
begin
  select * into st from canteen_stalls where id = p_stall;
  if st.id is null or not public.canteen_can_cashier(p_stall) then raise exception 'Anda bukan kasir kios ini'; end if;
  if not st.is_active then raise exception 'Kios % sedang nonaktif', st.name; end if;
  if p_amount is null or p_amount < 100 or p_amount > 1000000 then raise exception 'Nominal belanja tidak valid'; end if;
  if p_items is not null and (jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50) then
    raise exception 'Daftar belanja tidak valid';
  end if;
  s := public.canteen_find_student(st.school_id, p_code);
  select * into w from canteen_wallets where student_id = s.id for update;
  if coalesce(w.is_frozen, false) then raise exception 'Kartu % sedang dibekukan orang tua', s.full_name; end if;
  if w.daily_limit is not null and public.canteen_spent_today(s.id) + p_amount > w.daily_limit then
    raise exception 'Melebihi batas jajan harian % (sisa hari ini %)', public.rp(w.daily_limit),
      public.rp(greatest(w.daily_limit - public.canteen_spent_today(s.id), 0));
  end if;
  e := public.canteen_post(s.id, 'purchase', -p_amount, p_stall, p_items);
  return jsonb_build_object('entry_id', e.id, 'student_id', s.id, 'full_name', s.full_name, 'amount', p_amount, 'balance_after', e.balance_after);
end $$;
revoke execute on function public.canteen_charge(uuid, text, bigint, jsonb) from public, anon;
grant execute on function public.canteen_charge(uuid, text, bigint, jsonb) to authenticated;

-- Membatalkan pembelian: kasir pada hari yang sama, TU/admin kapan saja, selama belum disetor.
create or replace function public.canteen_void(p_entry uuid, p_reason text default null)
returns public.canteen_ledger language plpgsql security definer set search_path = public as $$
declare e canteen_ledger; v_mgr boolean;
begin
  select * into e from canteen_ledger where id = p_entry for update;
  if e.id is null or e.kind <> 'purchase' then raise exception 'Transaksi pembelian tidak ditemukan'; end if;
  v_mgr := public.has_role(e.school_id, array['finance', 'school_admin']::public.app_role[]);
  if not (v_mgr or public.is_stall_operator(e.stall_id)) then raise exception 'Anda tidak berhak membatalkan transaksi ini'; end if;
  if not v_mgr and (e.created_at at time zone 'Asia/Jakarta')::date <> public.school_today(e.school_id) then
    raise exception 'Kasir hanya bisa membatalkan transaksi hari ini. Minta Tata Usaha untuk transaksi lama.';
  end if;
  if e.settlement_id is not null then raise exception 'Transaksi sudah disetorkan ke kios'; end if;
  if exists (select 1 from canteen_ledger where refund_of = e.id) then raise exception 'Transaksi sudah dibatalkan'; end if;
  return public.canteen_post(e.student_id, 'refund', -e.amount, e.stall_id, e.items, null, null, e.id,
    coalesce(nullif(btrim(p_reason), ''), 'Pembatalan'));
end $$;
revoke execute on function public.canteen_void(uuid, text) from public, anon;
grant execute on function public.canteen_void(uuid, text) to authenticated;

-- Transaksi satu kios dalam rentang tanggal, lengkap dengan nama murid (kasir tidak bisa membaca
-- data murid secara langsung).
create or replace function public.canteen_stall_entries(p_stall uuid, p_from date, p_to date)
returns table (id uuid, kind public.canteen_entry, amount bigint, items jsonb, note text, created_at timestamptz,
               student_name text, class_name text, refunded boolean, refund_of uuid, settlement_id uuid)
language sql stable security definer set search_path = public as $$
  select l.id, l.kind, l.amount, l.items, l.note, l.created_at, s.full_name,
         (select c.name from classes c where c.id = public.current_class_of(s.id)),
         exists (select 1 from canteen_ledger r where r.refund_of = l.id), l.refund_of, l.settlement_id
    from canteen_ledger l join students s on s.id = l.student_id
   where l.stall_id = p_stall and (public.canteen_can_cashier(p_stall) or public.is_finance_viewer(l.school_id))
     and (l.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
   order by l.created_at desc
   limit 5000
$$;
revoke execute on function public.canteen_stall_entries(uuid, date, date) from public, anon;
grant execute on function public.canteen_stall_entries(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Tata Usaha: isi saldo tunai, tarik saldo, setoran kios
-- ---------------------------------------------------------------------
create or replace function public.canteen_cash(p_student uuid, p_amount bigint, p_withdraw boolean default false, p_note text default null)
returns public.canteen_ledger language plpgsql security definer set search_path = public as $$
declare s students; e canteen_ledger;
begin
  select * into s from students where id = p_student;
  if s.id is null or not public.has_role(s.school_id, array['finance', 'school_admin']::public.app_role[]) then
    raise exception 'Hanya Tata Usaha yang bisa mengisi atau menarik saldo tunai';
  end if;
  if p_amount is null or p_amount < 1000 or p_amount > 2000000 then raise exception 'Nominal tidak valid'; end if;
  e := public.canteen_post(s.id, case when p_withdraw then 'withdraw' else 'topup' end::canteen_entry,
         case when p_withdraw then -p_amount else p_amount end, null, null, 'cash', null, null, p_note);
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select g.guardian_id, s.school_id, case when p_withdraw then 'canteen.withdraw' else 'canteen.topup' end,
         case when p_withdraw then 'Saldo kantin ditarik tunai: ' else 'Saldo kantin bertambah: ' end || s.full_name,
         public.rp(p_amount) || ' di loket Tata Usaha · saldo sekarang ' || public.rp(e.balance_after), 'students', s.id
    from guardian_links g where g.student_id = s.id;
  return e;
end $$;
revoke execute on function public.canteen_cash(uuid, bigint, boolean, text) from public, anon;
grant execute on function public.canteen_cash(uuid, bigint, boolean, text) to authenticated;

-- Menyetor penjualan kios sampai tanggal tertentu: dicatat sekali, transaksinya dikunci.
create or replace function public.canteen_settle(p_stall uuid, p_until date, p_note text default null)
returns public.canteen_settlements language plpgsql security definer set search_path = public as $$
declare st canteen_stalls; v_gross bigint; v_count int; r canteen_settlements;
begin
  select * into st from canteen_stalls where id = p_stall;
  if st.id is null or not public.has_role(st.school_id, array['finance', 'school_admin']::public.app_role[]) then
    raise exception 'Hanya Tata Usaha yang bisa mencatat setoran kios';
  end if;
  if p_until > public.school_today(st.school_id) then raise exception 'Tanggal setoran tidak boleh di masa depan'; end if;
  select coalesce(-sum(amount), 0), count(*) into v_gross, v_count from canteen_ledger
   where stall_id = p_stall and settlement_id is null and kind in ('purchase', 'refund')
     and (created_at at time zone 'Asia/Jakarta')::date <= p_until;
  if v_count = 0 then raise exception 'Tidak ada penjualan yang belum disetor sampai tanggal itu'; end if;
  insert into canteen_settlements (school_id, stall_id, period_to, gross, commission, net, entries, note)
  values (st.school_id, p_stall, p_until, v_gross, round(v_gross * st.commission_pct / 100),
          v_gross - round(v_gross * st.commission_pct / 100), v_count, nullif(btrim(p_note), ''))
  returning * into r;
  update canteen_ledger set settlement_id = r.id
   where stall_id = p_stall and settlement_id is null and kind in ('purchase', 'refund')
     and (created_at at time zone 'Asia/Jakarta')::date <= p_until;
  return r;
end $$;
revoke execute on function public.canteen_settle(uuid, date, text) from public, anon;
grant execute on function public.canteen_settle(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------
-- Orang tua: batas harian, bekukan kartu, minta isi saldo
-- ---------------------------------------------------------------------
create or replace function public.canteen_set_controls(p_student uuid, p_daily_limit bigint, p_frozen boolean)
returns public.canteen_wallets language plpgsql security definer set search_path = public as $$
declare s students; w canteen_wallets;
begin
  select * into s from students where id = p_student;
  if s.id is null or not (public.is_guardian_of(s.id)
                          or public.has_role(s.school_id, array['finance', 'school_admin']::public.app_role[])) then
    raise exception 'Hanya orang tua atau Tata Usaha yang bisa mengatur kartu jajan';
  end if;
  if not public.school_has_module(s.school_id, 'canteen') then
    raise exception 'Fitur % belum termasuk paket sekolah Anda.', public.module_label('canteen');
  end if;
  insert into canteen_wallets (student_id, school_id, daily_limit, is_frozen) values (s.id, s.school_id, p_daily_limit, coalesce(p_frozen, false))
  on conflict (student_id) do update set daily_limit = excluded.daily_limit, is_frozen = excluded.is_frozen, updated_at = now()
  returning * into w;
  return w;
end $$;
revoke execute on function public.canteen_set_controls(uuid, bigint, boolean) from public, anon;
grant execute on function public.canteen_set_controls(uuid, bigint, boolean) to authenticated;

-- Membuat tagihan "Isi saldo kantin" yang dibayar seperti tagihan lain (online atau di loket TU).
-- Permintaan lama yang belum dibayar dibatalkan agar tidak menumpuk.
create or replace function public.canteen_request_topup(p_student uuid, p_amount bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare s students; v_id uuid; v_max bigint; v_bal bigint;
begin
  select * into s from students where id = p_student;
  if s.id is null or not (public.is_guardian_of(s.id) or s.user_id = auth.uid()
                          or public.has_role(s.school_id, array['finance', 'school_admin']::public.app_role[])) then
    raise exception 'Murid tidak ditemukan';
  end if;
  if not public.school_has_module(s.school_id, 'canteen') then
    raise exception 'Fitur % belum termasuk paket sekolah Anda.', public.module_label('canteen');
  end if;
  if p_amount is null or p_amount < 10000 or p_amount > 1000000 or p_amount % 1000 <> 0 then
    raise exception 'Nominal isi saldo Rp10.000 sampai Rp1.000.000, kelipatan Rp1.000';
  end if;
  v_max := (public.canteen_settings(s.school_id) ->> 'max_balance')::bigint;
  select coalesce(balance, 0) into v_bal from canteen_wallets where student_id = s.id;
  if coalesce(v_bal, 0) + p_amount > v_max then raise exception 'Saldo maksimal %', public.rp(v_max); end if;
  update invoices set status = 'void', void_reason = 'Diganti permintaan isi saldo baru'
   where student_id = s.id and canteen_topup and status = 'unpaid';
  insert into invoices (school_id, student_id, number, title, due_on, canteen_topup)
  values (s.school_id, s.id, public.next_document_number('INV'), 'Isi saldo kantin', public.school_today(s.school_id), true)
  returning id into v_id;
  insert into invoice_items (invoice_id, school_id, description, amount) values (v_id, s.school_id, 'Isi saldo kantin', p_amount);
  return v_id;
end $$;
revoke execute on function public.canteen_request_topup(uuid, bigint) from public, anon;
grant execute on function public.canteen_request_topup(uuid, bigint) to authenticated;

-- Tagihan isi saldo lunas → saldo bertambah; pembayaran dibatalkan (refund) → saldo ditarik kembali.
create or replace function public.canteen_topup_from_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
declare e canteen_ledger;
begin
  if not new.canteen_topup then return null; end if;
  select * into e from canteen_ledger where invoice_id = new.id;
  if new.status = 'paid' and e.id is null then
    perform public.canteen_post(new.student_id, 'topup', new.total, null, null, 'online', new.id, null, new.number);
  elsif new.status <> 'paid' and e.id is not null
        and not exists (select 1 from canteen_ledger where refund_of = e.id) then
    perform public.canteen_post(new.student_id, 'adjust', -e.amount, null, null, null, null, e.id,
      'Pembayaran ' || new.number || ' dibatalkan');
  end if;
  return null;
end $$;
create trigger invoices_canteen_topup after update of status on public.invoices
  for each row when (old.status is distinct from new.status) execute function public.canteen_topup_from_invoice();

-- Denda keterlambatan tidak berlaku untuk permintaan isi saldo.
create or replace function public.apply_late_fees(p_school uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_fee bigint; v_count int;
begin
  if not (public.is_finance_staff(p_school) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Tidak berwenang';
  end if;
  select coalesce((settings->>'late_fee_amount')::bigint, 0) into v_fee from schools where id = p_school;
  if v_fee <= 0 then return 0; end if;
  update invoices set late_fee = v_fee
   where school_id = p_school and status in ('unpaid', 'partial') and late_fee = 0 and not canteen_topup
     and due_on < public.school_today(p_school);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Dipanggil tugas harian: permintaan isi saldo yang tidak dibayar sampai lewat hari dibatalkan.
create or replace function public.canteen_expire_topups(p_school uuid)
returns int language sql security definer set search_path = public as $$
  with v as (
    update invoices set status = 'void', void_reason = 'Permintaan isi saldo kedaluwarsa'
     where school_id = p_school and canteen_topup and status = 'unpaid' and due_on < public.school_today(p_school)
    returning 1)
  select count(*)::int from v
$$;
revoke execute on function public.canteen_expire_topups(uuid) from public, anon, authenticated;
grant execute on function public.canteen_expire_topups(uuid) to service_role;

-- ---------------------------------------------------------------------
-- RLS: semua perubahan lewat fungsi di atas
-- ---------------------------------------------------------------------
alter table public.canteen_stalls enable row level security;
alter table public.canteen_items enable row level security;
alter table public.canteen_wallets enable row level security;
alter table public.canteen_ledger enable row level security;
alter table public.canteen_settlements enable row level security;

create policy cs_read on public.canteen_stalls for select using (public.is_member(school_id) or public.is_finance_viewer(school_id));
create policy cs_write on public.canteen_stalls for all
  using (public.has_role(school_id, array['finance', 'school_admin']::public.app_role[]))
  with check (public.has_role(school_id, array['finance', 'school_admin']::public.app_role[]));

create policy ci_read on public.canteen_items for select using (public.is_member(school_id));
create policy ci_write on public.canteen_items for all
  using (public.has_role(school_id, array['finance', 'school_admin']::public.app_role[]) or public.is_stall_operator(stall_id))
  with check (public.has_role(school_id, array['finance', 'school_admin']::public.app_role[]) or public.is_stall_operator(stall_id));

create policy cw_read on public.canteen_wallets for select using (public.can_view_student_finance(student_id));

create policy cl_read on public.canteen_ledger for select
  using (public.can_view_student_finance(student_id) or (stall_id is not null and public.is_stall_operator(stall_id)));

create policy cst_read on public.canteen_settlements for select
  using (public.is_finance_viewer(school_id) or public.is_stall_operator(stall_id));
