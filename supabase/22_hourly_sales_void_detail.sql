-- 22 — Hourly sales + void/discount detail (both written by the Toast pull;
-- history populates when the backfill workflow is re-run for past dates).

-- Per-day 24-slot net-sales array (venue local time). Single-day dashboard
-- ranges render sales by hour instead of by day from this.
alter table public.daily_metrics
  add column if not exists sales_by_hour jsonb;

-- Void/discount detail behind the drill-down page: one row per
-- (day, kind, dimension member). dim='employee' rows carry the server and the
-- void reason / discount name; dim='item' rows carry the menu item.
create table if not exists public.daily_void_discounts (
  id            bigint generated always as identity primary key,
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  kind          text not null check (kind in ('void', 'discount')),
  dim           text not null check (dim in ('employee', 'item')),
  employee_guid text,
  employee_name text,
  reason        text,
  item_name     text,
  amount        numeric(12,2) not null default 0,
  qty           numeric(10,2) not null default 0
);
create index if not exists idx_dvd_loc_date on public.daily_void_discounts(location_id, business_date);

-- Read-only for anyone who can see the location (same posture as the other
-- daily_* breakdown tables); the import writes with the service role.
alter table public.daily_void_discounts enable row level security;
drop policy if exists dvd_select on public.daily_void_discounts;
create policy dvd_select on public.daily_void_discounts
  for select using ( public.can_access_location(location_id) );
