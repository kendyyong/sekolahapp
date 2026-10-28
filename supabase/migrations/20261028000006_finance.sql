-- =====================================================================
-- SekolahApp · 0006 · Keuangan: biaya sekolah, tagihan, pembayaran,
--                     dan tagihan langganan platform
-- Semua nominal dalam rupiah (bigint, tanpa desimal).
-- =====================================================================

create or replace function public.is_finance_viewer(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_school, array['finance','school_admin','principal']::public.app_role[])
      or public.is_foundation_admin_of_school(p_school)
      or public.is_platform_admin()
$$;

create or replace function public.is_finance_staff(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_school, array['finance']::public.app_role[]) or public.is_platform_admin()
$$;

-- Melihat tagihan murid: TU/kepsek/admin, wali kelas, orang tua, murid itu sendiri.
create or replace function public.can_view_student_finance(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from students s where s.id = p_student and (
    public.is_finance_viewer(s.school_id)
    or public.is_homeroom_of_student(s.id)
    or public.is_guardian_of(s.id)
    or s.user_id = auth.uid()))
$$;

-- ---------------------------------------------------------------------
-- Master biaya (ditetapkan Tata Usaha)
-- ---------------------------------------------------------------------
create table public.fee_types (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  code            text not null,
  name            text not null,
  category        text not null default 'lainnya'
                  check (category in ('spp','pendaftaran','gedung','seragam','buku','kegiatan','ujian','iuran','lainnya')),
  is_monthly      boolean not null default false,        -- ikut tagihan bulanan otomatis
  default_amount  bigint not null default 0 check (default_amount >= 0),
  description     text,
  is_active       boolean not null default true,
  unique (school_id, code)
);

-- Nominal per tahun ajaran & tingkat. grade_level kosong = berlaku untuk semua tingkat.
create table public.fee_rates (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools(id) on delete cascade,
  fee_type_id      uuid not null references public.fee_types(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  grade_level      smallint,
  amount           bigint not null check (amount >= 0),
  unique nulls not distinct (fee_type_id, academic_year_id, grade_level)
);
create trigger fee_rates_same_school before insert or update on public.fee_rates
  for each row execute function public.assert_same_school('fee_types', 'fee_type_id');

-- Potongan / beasiswa per murid.
create table public.student_discounts (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  fee_type_id  uuid not null references public.fee_types(id) on delete cascade,
  kind         text not null check (kind in ('percent', 'amount')),
  value        bigint not null check (value > 0),
  reason       text not null,
  valid_from   date not null default current_date,
  valid_to     date,
  created_at   timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);
create trigger student_discounts_same_school before insert or update on public.student_discounts
  for each row execute function public.assert_same_school('students', 'student_id');

-- ---------------------------------------------------------------------
-- Tagihan
-- ---------------------------------------------------------------------
create type public.invoice_status as enum ('unpaid', 'partial', 'paid', 'void');

create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  number       text not null,
  title        text not null,
  period       date,                         -- tanggal 1 bulan tagihan bulanan; kosong untuk tagihan sekali bayar
  issued_on    date not null default current_date,
  due_on       date not null,
  subtotal     bigint not null default 0,
  discount     bigint not null default 0,
  late_fee     bigint not null default 0,
  total        bigint generated always as (subtotal - discount + late_fee) stored,
  paid_amount  bigint not null default 0,
  status       public.invoice_status not null default 'unpaid',
  void_reason  text,
  created_by   uuid default auth.uid() references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (school_id, number)
);
create unique index invoices_one_monthly on public.invoices (student_id, period) where period is not null and status <> 'void';
create index on public.invoices (school_id, status, due_on);
create index on public.invoices (student_id);
create trigger invoices_same_school before insert or update on public.invoices
  for each row execute function public.assert_same_school('students', 'student_id');

create table public.invoice_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  school_id    uuid not null references public.schools(id) on delete cascade,
  fee_type_id  uuid references public.fee_types(id) on delete set null,
  description  text not null,
  amount       bigint not null check (amount >= 0),
  discount     bigint not null default 0 check (discount >= 0)
);
create trigger invoice_items_same_school before insert or update on public.invoice_items
  for each row execute function public.assert_same_school('invoices', 'invoice_id');

-- Subtotal & potongan tagihan selalu dihitung dari item.
create or replace function public.recalc_invoice_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update invoices i set
    subtotal = coalesce((select sum(amount) from invoice_items where invoice_id = v_invoice), 0),
    discount = coalesce((select sum(least(discount, amount)) from invoice_items where invoice_id = v_invoice), 0)
  where i.id = v_invoice;
  return null;
end $$;
create trigger invoice_items_recalc after insert or update or delete on public.invoice_items
  for each row execute function public.recalc_invoice_totals();

-- Nomor tagihan: INV/2026/10/000123 per sekolah.
create sequence public.invoice_number_seq;
create or replace function public.next_document_number(p_prefix text)
returns text language sql volatile as $$
  select p_prefix || '/' || to_char(now() at time zone 'Asia/Jakarta', 'YYYY/MM') || '/' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')
$$;

-- ---------------------------------------------------------------------
-- Pembayaran
-- ---------------------------------------------------------------------
create type public.payment_method as enum ('cash', 'transfer', 'va', 'qris', 'ewallet', 'retail');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'expired', 'refunded');

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references public.schools(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete restrict,
  amount          bigint not null check (amount > 0),     -- masuk ke tagihan
  service_fee     bigint not null default 0,              -- biaya layanan yang dibayar orang tua
  platform_fee    bigint not null default 0,              -- bagian platform (split payment)
  method          public.payment_method not null,
  status          public.payment_status not null default 'pending',
  gateway         text,                                   -- 'xendit'
  gateway_ref     text unique,                            -- external_id / invoice id gateway
  checkout_url    text,
  expires_at      timestamptz,
  gateway_payload jsonb,
  receipt_number  text unique,
  paid_at         timestamptz,
  received_by     uuid references public.profiles(id),    -- petugas TU untuk pembayaran tunai
  initiated_by    uuid default auth.uid() references public.profiles(id),
  notes           text,
  created_at      timestamptz not null default now()
);
create index on public.payments (invoice_id);
create index on public.payments (school_id, paid_at);
create trigger payments_same_school before insert or update on public.payments
  for each row execute function public.assert_same_school('invoices', 'invoice_id');

-- Status tagihan mengikuti pembayaran yang lunas.
create or replace function public.assign_receipt_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and new.receipt_number is null then
    new.receipt_number := public.next_document_number('KW');
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  return new;
end $$;
create trigger payments_receipt before insert or update on public.payments
  for each row execute function public.assign_receipt_number();

create or replace function public.sync_invoice_after_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_paid bigint; i invoices; v_name text;
begin
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = new.invoice_id and status = 'paid';
  update invoices set paid_amount = v_paid,
         status = case when status = 'void' then 'void'
                       when v_paid >= total then 'paid'
                       when v_paid > 0 then 'partial' else 'unpaid' end::invoice_status
   where id = new.invoice_id returning * into i;

  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    select full_name into v_name from students where id = i.student_id;
    insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
    select g.guardian_id, i.school_id, 'payment.paid', 'Pembayaran diterima: ' || i.title,
           v_name || ' · Rp' || to_char(new.amount, 'FM999G999G999G999') || ' · ' || new.receipt_number,
           'invoices', i.id
    from guardian_links g where g.student_id = i.student_id;
  end if;
  return null;
end $$;
create trigger payments_sync after insert or update of status on public.payments
  for each row execute function public.sync_invoice_after_payment();

create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.audit_row();
create trigger audit_invoices after update or delete on public.invoices
  for each row execute function public.audit_row();

-- Pembayaran tidak boleh dihapus; hanya dibatalkan (refunded) dengan jejak.
create or replace function public.forbid_delete()
returns trigger language plpgsql as $$
begin raise exception 'Data % tidak boleh dihapus', tg_table_name; end $$;
create trigger payments_no_delete before delete on public.payments
  for each row execute function public.forbid_delete();

-- ---------------------------------------------------------------------
-- RLS keuangan
-- ---------------------------------------------------------------------
alter table public.fee_types         enable row level security;
alter table public.fee_rates         enable row level security;
alter table public.student_discounts enable row level security;
alter table public.invoices          enable row level security;
alter table public.invoice_items     enable row level security;
alter table public.payments          enable row level security;

-- Informasi biaya sekolah boleh dilihat semua warga sekolah.
create policy fee_types_read on public.fee_types for select using (public.is_member(school_id) or public.is_finance_viewer(school_id));
create policy fee_types_write on public.fee_types for all
  using (public.is_finance_staff(school_id)) with check (public.is_finance_staff(school_id));
create policy fee_rates_read on public.fee_rates for select using (public.is_member(school_id) or public.is_finance_viewer(school_id));
create policy fee_rates_write on public.fee_rates for all
  using (public.is_finance_staff(school_id)) with check (public.is_finance_staff(school_id));

create policy discounts_read on public.student_discounts for select using (public.can_view_student_finance(student_id));
create policy discounts_write on public.student_discounts for all
  using (public.is_finance_staff(school_id)) with check (public.is_finance_staff(school_id));

create policy invoices_read on public.invoices for select using (public.can_view_student_finance(student_id));
create policy invoices_insert on public.invoices for insert with check (public.is_finance_staff(school_id));
create policy invoices_update on public.invoices for update
  using (public.is_finance_staff(school_id)) with check (public.is_finance_staff(school_id));

create policy invoice_items_read on public.invoice_items for select
  using (exists (select 1 from public.invoices i where i.id = invoice_id));
create policy invoice_items_write on public.invoice_items for all
  using (public.is_finance_staff(school_id)
         and exists (select 1 from public.invoices i where i.id = invoice_id and i.status in ('unpaid')))
  with check (public.is_finance_staff(school_id)
         and exists (select 1 from public.invoices i where i.id = invoice_id and i.status in ('unpaid')));

create policy payments_read on public.payments for select
  using (exists (select 1 from public.invoices i where i.id = invoice_id));
-- Pembayaran tunai lewat record_cash_payment; pembayaran online dibuat Edge Function (service role).

-- Kolom yang dihitung sistem tidak boleh diubah manual.
create or replace function public.guard_invoice_update()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or pg_trigger_depth() > 1 then return new; end if;
  if new.paid_amount <> old.paid_amount or new.student_id <> old.student_id or new.number <> old.number then
    raise exception 'Kolom ini dikelola sistem';
  end if;
  if new.status is distinct from old.status and new.status <> 'void'
     and not (new.status = 'paid' and new.subtotal - new.discount + new.late_fee = 0) then
    raise exception 'Status tagihan dikelola sistem; gunakan pembatalan untuk menandai batal';
  end if;
  if new.status = 'void' and old.status <> 'void' then
    if old.paid_amount > 0 then raise exception 'Tagihan yang sudah dibayar tidak dapat dibatalkan'; end if;
    if coalesce(trim(new.void_reason), '') = '' then raise exception 'Alasan pembatalan wajib diisi'; end if;
  end if;
  return new;
end $$;
create trigger invoices_guard before update on public.invoices
  for each row execute function public.guard_invoice_update();

-- ---------------------------------------------------------------------
-- Operasi Tata Usaha
-- ---------------------------------------------------------------------

-- Nominal biaya untuk seorang murid (setelah memperhitungkan tingkat kelas).
create or replace function public.fee_amount_for(p_fee_type uuid, p_student uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(
    (select fr.amount from fee_rates fr
       join classes c on c.academic_year_id = fr.academic_year_id
      where fr.fee_type_id = p_fee_type and c.id = public.current_class_of(p_student)
        and (fr.grade_level = c.grade_level or fr.grade_level is null)
      order by fr.grade_level nulls last limit 1),
    (select default_amount from fee_types where id = p_fee_type))
$$;

create or replace function public.discount_for(p_fee_type uuid, p_student uuid, p_amount bigint, p_on date)
returns bigint language sql stable security definer set search_path = public as $$
  select least(p_amount, coalesce(sum(case kind when 'percent' then p_amount * value / 100 else value end), 0))::bigint
  from student_discounts
  where fee_type_id = p_fee_type and student_id = p_student
    and valid_from <= p_on and (valid_to is null or valid_to >= p_on)
$$;

-- Membuat tagihan bulanan untuk semua murid aktif. Aman dijalankan berulang.
create or replace function public.generate_monthly_invoices(p_school uuid, p_period date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_period date := date_trunc('month', p_period)::date; v_due_day int; v_count int := 0;
        st record; v_invoice uuid; ft record; v_amount bigint;
begin
  if not (public.is_finance_staff(p_school) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Hanya Tata Usaha yang dapat membuat tagihan';
  end if;
  select coalesce((settings->>'invoice_due_day')::int, 10) into v_due_day from schools where id = p_school;

  for st in
    select s.id from students s
    where s.school_id = p_school and s.status = 'aktif' and public.current_class_of(s.id) is not null
      and not exists (select 1 from invoices i where i.student_id = s.id and i.period = v_period and i.status <> 'void')
  loop
    insert into invoices (school_id, student_id, number, title, period, due_on, created_by)
    values (p_school, st.id, public.next_document_number('INV'),
            'Tagihan ' || to_char(v_period, 'MM/YYYY'), v_period,
            v_period + (least(v_due_day, 28) - 1), auth.uid())
    returning id into v_invoice;

    for ft in select * from fee_types where school_id = p_school and is_monthly and is_active loop
      v_amount := public.fee_amount_for(ft.id, st.id);
      if v_amount > 0 then
        insert into invoice_items (invoice_id, school_id, fee_type_id, description, amount, discount)
        values (v_invoice, p_school, ft.id, ft.name || ' ' || to_char(v_period, 'MM/YYYY'), v_amount,
                public.discount_for(ft.id, st.id, v_amount, v_period));
      end if;
    end loop;

    -- Tagihan kosong (misalnya beasiswa penuh tanpa item) tidak perlu disimpan.
    if not exists (select 1 from invoice_items where invoice_id = v_invoice) then
      delete from invoices where id = v_invoice;
    else
      v_count := v_count + 1;
    end if;
  end loop;

  -- Beri tahu orang tua.
  insert into notifications (user_id, school_id, kind, title, body, ref_table, ref_id)
  select g.guardian_id, p_school, 'invoice.new', i.title || ' · ' || s.full_name,
         'Rp' || to_char(i.total, 'FM999G999G999G999') || ', jatuh tempo ' || to_char(i.due_on, 'DD-MM-YYYY'),
         'invoices', i.id
  from invoices i join students s on s.id = i.student_id join guardian_links g on g.student_id = s.id
  where i.school_id = p_school and i.period = v_period and i.created_at >= now() - interval '5 minutes'
    and i.status = 'unpaid' and i.total > 0
    and not exists (select 1 from notifications n where n.ref_id = i.id and n.kind = 'invoice.new' and n.user_id = g.guardian_id);

  -- Tagihan yang seluruhnya tertutup potongan langsung lunas.
  update invoices set status = 'paid' where school_id = p_school and period = v_period and total = 0 and status = 'unpaid';
  return v_count;
end $$;

-- Pembayaran tunai / transfer manual di loket TU.
create or replace function public.record_manual_payment(p_invoice uuid, p_amount bigint, p_method public.payment_method default 'cash', p_notes text default null)
returns public.payments language plpgsql security definer set search_path = public as $$
declare i invoices; p payments;
begin
  select * into i from invoices where id = p_invoice for update;
  if i.id is null then raise exception 'Tagihan tidak ditemukan'; end if;
  if not public.is_finance_staff(i.school_id) then raise exception 'Hanya Tata Usaha yang dapat mencatat pembayaran'; end if;
  if p_method not in ('cash', 'transfer') then raise exception 'Metode manual hanya tunai atau transfer'; end if;
  if i.status in ('paid', 'void') then raise exception 'Tagihan sudah lunas atau dibatalkan'; end if;
  if p_amount <= 0 or p_amount > i.total - i.paid_amount then
    raise exception 'Nominal harus antara 1 dan sisa tagihan (Rp%)', i.total - i.paid_amount;
  end if;
  insert into payments (school_id, invoice_id, amount, method, status, paid_at, received_by, notes)
  values (i.school_id, i.id, p_amount, p_method, 'paid', now(), auth.uid(), p_notes)
  returning * into p;
  return p;
end $$;

-- Denda keterlambatan sekali per tagihan (nominal dari settings.late_fee_amount).
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
   where school_id = p_school and status in ('unpaid', 'partial') and late_fee = 0
     and due_on < public.school_today(p_school);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Laporan tunggakan per murid.
create or replace view public.v_student_arrears with (security_invoker = true) as
select i.school_id, i.student_id, s.full_name, s.nis,
       c.name as class_name,
       count(*) as open_invoices,
       sum(i.total - i.paid_amount) as outstanding,
       min(i.due_on) as oldest_due_on
from public.invoices i
join public.students s on s.id = i.student_id
left join public.classes c on c.id = public.current_class_of(s.id)
where i.status in ('unpaid', 'partial') and i.due_on < current_date
group by i.school_id, i.student_id, s.full_name, s.nis, c.name;

-- Ringkasan kas.
create or replace function public.finance_summary(p_school uuid, p_from date, p_to date)
returns table (method public.payment_method, transactions bigint, amount bigint)
language sql stable security invoker as $$
  select p.method, count(*), sum(p.amount)::bigint
  from public.payments p
  where p.school_id = p_school and p.status = 'paid'
    and (p.paid_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  group by p.method order by 3 desc
$$;

-- ---------------------------------------------------------------------
-- Tagihan langganan platform ke sekolah
-- (potongan otomatis dari split payment + tagihan selisih akhir bulan)
-- ---------------------------------------------------------------------
create table public.plans (
  tier              public.plan_tier primary key,
  name              text not null,
  price_per_student bigint not null,     -- rupiah / siswa / bulan
  max_students      int,
  modules           text[] not null default '{}'
);
insert into public.plans (tier, name, price_per_student, max_students, modules) values
  ('free',       'Gratis',     0,    100,  array['core']),
  ('basic',      'Dasar',      3000, null, array['core','staff']),
  ('pro',        'Pro',        6000, null, array['core','staff','finance','grades','counseling','dashboard']),
  ('enterprise', 'Enterprise', 6000, null, array['core','staff','finance','grades','counseling','dashboard','foundation','whitelabel']);

create table public.platform_bills (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools(id) on delete cascade,
  period             date not null,
  tier               public.plan_tier not null,
  active_students    int not null,
  price_per_student  bigint not null,
  gross_amount       bigint not null,
  collected_by_split bigint not null default 0,
  amount_due         bigint generated always as (greatest(gross_amount - collected_by_split, 0)) stored,
  status             text not null default 'open' check (status in ('open', 'paid', 'waived')),
  gateway_ref        text,
  created_at         timestamptz not null default now(),
  unique (school_id, period)
);

alter table public.plans          enable row level security;
alter table public.platform_bills enable row level security;
create policy plans_read on public.plans for select using (true);
create policy plans_write on public.plans for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy platform_bills_read on public.platform_bills for select
  using (public.has_role(school_id, array['school_admin','principal','finance']::public.app_role[]) or public.is_platform_admin());
create policy platform_bills_write on public.platform_bills for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Dijalankan setiap awal bulan untuk bulan sebelumnya (cron / Edge Function).
create or replace function public.compute_platform_bill(p_school uuid, p_period date)
returns public.platform_bills language plpgsql security definer set search_path = public as $$
declare v_period date := date_trunc('month', p_period)::date; v_tier plan_tier; v_price bigint;
        v_students int; v_split bigint; b platform_bills;
begin
  if not (public.is_platform_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Tidak berwenang';
  end if;
  select s.plan, coalesce(nullif((s.settings->>'custom_price_per_student'), '')::bigint, p.price_per_student)
    into v_tier, v_price
    from schools s join plans p on p.tier = s.plan where s.id = p_school;
  select count(*) into v_students from students where school_id = p_school and status = 'aktif';
  select coalesce(sum(platform_fee), 0) into v_split from payments
   where school_id = p_school and status = 'paid'
     and paid_at >= v_period and paid_at < (v_period + interval '1 month');

  insert into platform_bills (school_id, period, tier, active_students, price_per_student, gross_amount, collected_by_split)
  values (p_school, v_period, v_tier, v_students, v_price, v_students * v_price, v_split)
  on conflict (school_id, period) do update
    set tier = excluded.tier, active_students = excluded.active_students, price_per_student = excluded.price_per_student,
        gross_amount = excluded.gross_amount, collected_by_split = excluded.collected_by_split
    where platform_bills.status = 'open'
  returning * into b;
  return b;
end $$;
