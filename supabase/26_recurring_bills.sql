-- 26 — Recurring bills worksheet (the workbook's Monthly Bills tab, live).
-- Bills that may never produce an invoice (rent, utilities, tax drafts) but
-- must be accounted for: a per-location list with due day + expected amount,
-- and manual per-month payment entries. Payments count as real expenses —
-- the rollup lands them on the 1st of their month in daily_metrics.expenses
-- (Payroll-category bills excluded there, same as payroll invoices).

create table if not exists public.recurring_bills (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references public.locations(id) on delete cascade,
  name            text not null,
  vendor_id       uuid references public.vendors(id),   -- links invoice actuals when the vendor also invoices
  category_id     uuid references public.expense_categories(id),
  due_day         text,                                  -- '1st' | '20th' | 'Mondays' | 'Varies'
  frequency       text not null default 'monthly',       -- 'monthly' | 'weekly' | 'as_needed'
  expected_amount numeric(12,2),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  unique (location_id, name)
);

create table if not exists public.recurring_bill_payments (
  bill_id    uuid not null references public.recurring_bills(id) on delete cascade,
  month      date not null,                              -- first of month
  amount     numeric(12,2) not null,
  updated_at timestamptz not null default now(),
  primary key (bill_id, month)
);

-- Reads location-scoped; writes admin-only (money entry).
alter table public.recurring_bills enable row level security;
drop policy if exists rb_select on public.recurring_bills;
create policy rb_select on public.recurring_bills for select using (public.can_access_location(location_id));
drop policy if exists rb_write on public.recurring_bills;
create policy rb_write on public.recurring_bills for all using (public.is_org_admin()) with check (public.is_org_admin());

alter table public.recurring_bill_payments enable row level security;
drop policy if exists rbp_select on public.recurring_bill_payments;
create policy rbp_select on public.recurring_bill_payments for select
  using (exists (select 1 from public.recurring_bills b where b.id = bill_id and public.can_access_location(b.location_id)));
drop policy if exists rbp_write on public.recurring_bill_payments;
create policy rbp_write on public.recurring_bill_payments for all
  using (public.is_org_admin()) with check (public.is_org_admin());

-- Manual bill payments join the nightly cost rollup: land on the 1st of the
-- month in daily_metrics.expenses (Payroll category excluded — labor comes
-- from Toast/ADP; payroll bills still show in the Financials P&L).
create or replace function public.rollup_bill_payments(p_from date, p_to date)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.daily_metrics (location_id, business_date, source)
  select distinct b.location_id, p.month, 'invoice_rollup'
  from public.recurring_bill_payments p join public.recurring_bills b on b.id = p.bill_id
  where p.month between date_trunc('month', p_from)::date and p_to
  on conflict (location_id, business_date) do nothing;

  update public.daily_metrics m
  set expenses = coalesce(inv.other, 0) + coalesce(bp.paid, 0),
      updated_at = now()
  from (
    select b.location_id, p.month,
           sum(p.amount) filter (where coalesce(ec.name, '') <> 'Payroll') as paid
    from public.recurring_bill_payments p
    join public.recurring_bills b on b.id = p.bill_id
    left join public.expense_categories ec on ec.id = b.category_id
    where p.month between date_trunc('month', p_from)::date and p_to
    group by 1, 2
  ) bp
  left join lateral (
    select sum(i.amount) as other
    from public.invoices i
    left join public.expense_categories ec on ec.id = i.category_id
    where i.location_id = bp.location_id and i.invoice_date = bp.month
      and i.status in ('auto_approved', 'approved', 'imported_legacy')
      and coalesce(ec.name, '') not in ('Food Supplies', 'Alcohol & Beverage', 'Payroll')
  ) inv on true
  where m.location_id = bp.location_id and m.business_date = bp.month;
end $$;

-- run right after the invoice rollup each night
select cron.schedule('bill-payments-rollup-nightly', '35 8 * * *',
  $$select public.rollup_bill_payments(current_date - 400, current_date)$$);

-- ---------- seed: the workbook's Monthly Bills rows (Brookhaven/ATL) ----------
with bills(name, cat, due, freq, exp, sort) as (values
  ('Property Rent',                 'Rent / Occupancy',       '1st',      'monthly',   null::numeric, 10),
  ('Standard Ops Associates LLC',   'Rent / Occupancy',       'Varies',   'monthly',   null,          20),
  ('Georgia Power',                 'Utilities',              'Varies',   'monthly',   null,          30),
  ('Scana Energy Natural Gas',      'Utilities',              'Varies',   'monthly',   null,          40),
  ('DeKalb County Water',           'Utilities',              'Varies',   'monthly',   null,          50),
  ('Comcast Business',              'Utilities',              '1st',      'monthly',   null,          60),
  ('Affordable Dumpster LLC',       'Waste Management',       'Varies',   'monthly',   979,           70),
  ('Mr. Curtis Cleaning Crew',      'Cleaning Supplies',      'Varies',   'monthly',   1400,          80),
  ('Cintas',                        'Cleaning Supplies',      'Varies',   'monthly',   500,           90),
  ('Apex Environmental Services',   'Waste Management',       'Varies',   'monthly',   300,           100),
  ('Extra Space Storage',           'Facility & Maintenance', '1st',      'monthly',   165,           110),
  ('All in One HVAC LLC',           'HVAC',                   'As needed','as_needed', 396,           120),
  ('Toast Inc. (POS)',              'POS Systems',            'Varies',   'monthly',   895,           130),
  ('OpenTable',                     'Seating Systems',        'Varies',   'monthly',   914,           140),
  ('Payroll – Labor & Wages',       'Payroll',                'Mondays',  'weekly',    68323,         150),
  ('Payroll Processing Fee',        'Payroll',                'Varies',   'monthly',   32,            160),
  ('Brookhaven Police Department',  'Security Services',      'Varies',   'monthly',   2100,          170),
  ('GA Sales Tax',                  'Tax',                    '20th',     'monthly',   26107.81,      180),
  ('Brookhaven Sales Tax',          'Tax',                    '20th',     'monthly',   272.11,        190),
  ('Van, Insurance and Fuel',       'Transportation',         'Varies',   'monthly',   1546.99,       200)
)
insert into public.recurring_bills (location_id, name, vendor_id, category_id, due_day, frequency, expected_amount, sort_order)
select
  (select id from public.locations where name = 'Teranga ATL'),
  b.name,
  (select id from public.vendors v where v.name = b.name),
  (select id from public.expense_categories ec where ec.name = b.cat),
  b.due, b.freq, b.exp, b.sort
from bills b
on conflict (location_id, name) do nothing;
