-- 15_daily_server_categories.sql
-- Per-employee × sales-category × day breakdown behind the Top Employees
-- section (role rankings + category leaders). Attribution is by the order's
-- server: every non-void selection on a server's orders counts toward that
-- server, split by Toast sales category. job_title comes from the day's
-- clock-in time entry (fallback: the employee's first job assignment).
-- Applied to the live project on 2026-07-03 as migration
-- `daily_server_categories`.

create table if not exists public.daily_server_categories (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  employee_guid text not null,
  employee_name text,
  job_title     text,
  category      text not null,
  quantity      numeric(12,2) not null default 0,
  net_sales     numeric(12,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (location_id, business_date, employee_guid, category)
);
create index if not exists idx_dsvc_loc_date on public.daily_server_categories(location_id, business_date);

-- RLS: same posture as the other breakdown tables — location-scoped reads,
-- admin writes (the import runs as service role and bypasses RLS).
alter table public.daily_server_categories enable row level security;
drop policy if exists daily_server_categories_select on public.daily_server_categories;
create policy daily_server_categories_select on public.daily_server_categories for select using ( public.can_access_location(location_id) );
drop policy if exists daily_server_categories_insert on public.daily_server_categories;
create policy daily_server_categories_insert on public.daily_server_categories for insert with check ( public.is_org_admin() );
drop policy if exists daily_server_categories_update on public.daily_server_categories;
create policy daily_server_categories_update on public.daily_server_categories for update using ( public.is_org_admin() ) with check ( public.is_org_admin() );
drop policy if exists daily_server_categories_delete on public.daily_server_categories;
create policy daily_server_categories_delete on public.daily_server_categories for delete using ( public.is_org_admin() );
