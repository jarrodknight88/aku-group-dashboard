-- 14_daily_breakdowns.sql
-- Per-day breakdown tables behind the dashboard's product-mix, payment, and
-- top-employee sections. Same grain philosophy as daily_metrics (one bundle
-- per location per business day), but one row per dimension member. The pull
-- script replaces a day's rows wholesale (delete + insert) so re-pulls never
-- leave stale members behind.

-- Revenue Streams / Category Performance
create table if not exists public.daily_sales_categories (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  category      text not null,               -- Toast sales category name
  net_sales     numeric(12,2) not null default 0,
  item_count    numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (location_id, business_date, category)
);
create index if not exists idx_dsc_loc_date on public.daily_sales_categories(location_id, business_date);

-- Top Sellers / Detail Drill item lists
create table if not exists public.daily_menu_items (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  item_key      text not null,               -- Toast item guid (or display name fallback)
  item_name     text not null,
  category      text,
  quantity      numeric(12,2) not null default 0,
  net_sales     numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (location_id, business_date, item_key)
);
create index if not exists idx_dmi_loc_date on public.daily_menu_items(location_id, business_date);

-- Payment Mix / Payment Methods detail
create table if not exists public.daily_payments (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  payment_type  text not null,               -- Cash / Visa / Mastercard / Amex / Discover / Gift Card / <other name>
  pay_count     int not null default 0,
  amount        numeric(12,2) not null default 0,
  tips          numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (location_id, business_date, payment_type)
);
create index if not exists idx_dp_loc_date on public.daily_payments(location_id, business_date);

-- Top Employees (net sales attribution per server)
create table if not exists public.daily_server_sales (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  employee_guid text not null,
  employee_name text,
  net_sales     numeric(12,2) not null default 0,
  order_count   int not null default 0,
  created_at    timestamptz not null default now(),
  unique (location_id, business_date, employee_guid)
);
create index if not exists idx_dss_loc_date on public.daily_server_sales(location_id, business_date);

-- RLS: same posture as daily_metrics — location-scoped reads, admin writes
-- (the import runs as service role and bypasses RLS).
do $$
declare t text;
begin
  foreach t in array array['daily_sales_categories','daily_menu_items','daily_payments','daily_server_sales'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select using ( public.can_access_location(location_id) )', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert with check ( public.is_org_admin() )', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update using ( public.is_org_admin() ) with check ( public.is_org_admin() )', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete using ( public.is_org_admin() )', t, t);
  end loop;
end $$;
