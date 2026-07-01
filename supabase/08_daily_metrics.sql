-- 08_daily_metrics.sql
-- Import landing table. Your Toast/GitHub-Actions pipeline writes here (one row
-- per location per business day). The snapshot job reads ONLY this table, which
-- keeps aggregation source-agnostic. Dollar amounts only — percentages are
-- derived downstream so the org rollup never averages percentages.

create table if not exists public.daily_metrics (
  id               uuid primary key default gen_random_uuid(),
  location_id      uuid not null references public.locations(id) on delete cascade,
  business_date    date not null,
  net_sales        numeric(12,2) not null default 0,
  gross_sales      numeric(12,2) not null default 0,
  covers           int           not null default 0,
  food_cost        numeric(12,2) not null default 0,
  labor_cost       numeric(12,2) not null default 0,
  liquor_cost      numeric(12,2) not null default 0,
  voids_amount     numeric(12,2) not null default 0,
  discounts_amount numeric(12,2) not null default 0,
  expenses         numeric(12,2) not null default 0,  -- from invoice sheet
  source           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (location_id, business_date)
);
create index if not exists idx_daily_loc_date
  on public.daily_metrics(location_id, business_date);

alter table public.daily_metrics enable row level security;

-- Read: scoped to accessible locations. Write: admins / service-role import.
drop policy if exists daily_select on public.daily_metrics;
create policy daily_select on public.daily_metrics
  for select using ( public.can_access_location(location_id) );

drop policy if exists daily_write on public.daily_metrics;
create policy daily_write on public.daily_metrics
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );
-- (The cron snapshot job and a service-role import both bypass RLS, so this
--  write policy only governs interactive writes.)
