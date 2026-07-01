-- 09_snapshots.sql
-- Weekly auto-snapshots, per-scope (org + per location), last 24 kept per scope.

create table if not exists public.period_snapshots (
  id             uuid primary key default gen_random_uuid(),
  scope          snapshot_scope not null,
  location_id    uuid references public.locations(id) on delete cascade,
  period_start   date not null,
  period_end     date not null,
  net_sales      numeric(12,2),
  covers         int,
  avg_check      numeric(10,2),
  food_pct       numeric(6,2),
  labor_pct      numeric(6,2),
  liquor_pct     numeric(6,2),
  voids_pct      numeric(6,2),
  discounts_pct  numeric(6,2),
  total_expenses numeric(12,2),
  created_at     timestamptz not null default now(),
  constraint scope_loc_consistent check (
    (scope = 'org'      and location_id is null) or
    (scope = 'location' and location_id is not null)
  )
);

-- One snapshot per scope per period (partial indexes handle the NULL location).
create unique index if not exists uq_snap_org
  on public.period_snapshots (period_start, period_end) where scope = 'org';
create unique index if not exists uq_snap_loc
  on public.period_snapshots (location_id, period_start, period_end)
  where scope = 'location';

create index if not exists idx_snap_scope_end
  on public.period_snapshots (scope, location_id, period_end desc);

-- Build snapshots for a period. Defaults to the prior ISO week (Mon–Sun).
-- ORG ROLLUP RECOMPUTES FROM SUMMED DOLLARS — it does not average the
-- per-location percentages. This is the correctness crux.
create or replace function public.build_weekly_snapshot(
  p_period_start date default (date_trunc('week', now())::date - 7),
  p_period_end   date default (date_trunc('week', now())::date - 1)
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Per-location
  delete from public.period_snapshots
   where scope='location' and period_start=p_period_start and period_end=p_period_end;

  insert into public.period_snapshots
    (scope, location_id, period_start, period_end, net_sales, covers, avg_check,
     food_pct, labor_pct, liquor_pct, voids_pct, discounts_pct, total_expenses)
  select 'location', d.location_id, p_period_start, p_period_end,
     sum(d.net_sales),
     sum(d.covers),
     sum(d.net_sales)/nullif(sum(d.covers),0),
     sum(d.food_cost)       /nullif(sum(d.net_sales),0)*100,
     sum(d.labor_cost)      /nullif(sum(d.net_sales),0)*100,
     sum(d.liquor_cost)     /nullif(sum(d.net_sales),0)*100,
     sum(d.voids_amount)    /nullif(sum(d.net_sales),0)*100,
     sum(d.discounts_amount)/nullif(sum(d.net_sales),0)*100,
     sum(d.expenses)
  from public.daily_metrics d
  where d.business_date between p_period_start and p_period_end
  group by d.location_id;

  -- Org (recompute from dollars across all locations)
  delete from public.period_snapshots
   where scope='org' and period_start=p_period_start and period_end=p_period_end;

  insert into public.period_snapshots
    (scope, location_id, period_start, period_end, net_sales, covers, avg_check,
     food_pct, labor_pct, liquor_pct, voids_pct, discounts_pct, total_expenses)
  select 'org', null, p_period_start, p_period_end,
     sum(net_sales),
     sum(covers),
     sum(net_sales)/nullif(sum(covers),0),
     sum(food_cost)       /nullif(sum(net_sales),0)*100,
     sum(labor_cost)      /nullif(sum(net_sales),0)*100,
     sum(liquor_cost)     /nullif(sum(net_sales),0)*100,
     sum(voids_amount)    /nullif(sum(net_sales),0)*100,
     sum(discounts_amount)/nullif(sum(net_sales),0)*100,
     sum(expenses)
  from public.daily_metrics
  where business_date between p_period_start and p_period_end;

  -- Prune to most recent 24 per scope/location.
  delete from public.period_snapshots p
  using (
    select id, row_number() over
      (partition by scope, location_id order by period_end desc) rn
    from public.period_snapshots
  ) r
  where p.id = r.id and r.rn > 24;
end $$;

-- Convenience read (plain selects also work and are RLS-protected).
create or replace function public.get_period_snapshots(
  p_scope snapshot_scope, p_location_id uuid default null, p_limit int default 24)
returns setof public.period_snapshots
language sql stable security definer set search_path = public
as $$
  select * from public.period_snapshots
  where scope = p_scope
    and (p_location_id is null or location_id = p_location_id)
    and case when p_scope='org' then public.is_org_admin()
             else public.can_access_location(location_id) end
  order by period_end desc
  limit p_limit;
$$;

-- Clear All (admin only). Pass nulls to wipe everything, or scope it.
create or replace function public.clear_period_snapshots(
  p_scope snapshot_scope default null, p_location_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_org_admin() then raise exception 'not authorized'; end if;
  delete from public.period_snapshots
   where (p_scope is null or scope = p_scope)
     and (p_location_id is null or location_id = p_location_id);
end $$;

alter table public.period_snapshots enable row level security;

-- Org snapshots: owner/admin only. Location snapshots: anyone who can access it.
drop policy if exists snap_select on public.period_snapshots;
create policy snap_select on public.period_snapshots
  for select using (
    (scope='org'      and public.is_org_admin()) or
    (scope='location' and public.can_access_location(location_id))
  );

-- Interactive writes admin-only; the cron job runs as definer and bypasses this.
drop policy if exists snap_write on public.period_snapshots;
create policy snap_write on public.period_snapshots
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );
