-- 06_kpi_targets.sql
-- Org-wide defaults (location_id IS NULL) + optional per-location overrides.
-- Partial unique indexes enforce "one row per metric per scope" correctly
-- (plain UNIQUE would treat NULL location_ids as distinct and let duplicates in).

create table if not exists public.kpi_targets (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid references public.locations(id) on delete cascade, -- NULL = org default
  metric         kpi_metric not null,
  threshold      numeric(6,2) not null,
  goal_direction text not null default 'below',  -- 'below' = under threshold is good
  updated_at     timestamptz not null default now()
);

create unique index if not exists uq_kpi_org
  on public.kpi_targets (metric) where location_id is null;
create unique index if not exists uq_kpi_override
  on public.kpi_targets (location_id, metric) where location_id is not null;

-- Org defaults.
insert into public.kpi_targets (location_id, metric, threshold, goal_direction) values
  (null,'void_pct',     1,'below'),
  (null,'discount_pct', 3,'below'),
  (null,'food_pct',    30,'below'),
  (null,'labor_pct',   28,'below'),
  (null,'liquor_pct',  24,'below')
on conflict (metric) where location_id is null do nothing;

-- Effective targets for a location: override row if present, else org default.
create or replace function public.get_effective_targets(p_location_id uuid)
returns table(metric kpi_metric, threshold numeric, goal_direction text)
language sql stable security definer set search_path = public
as $$
  select t.metric,
         coalesce(o.threshold, t.threshold),
         coalesce(o.goal_direction, t.goal_direction)
  from public.kpi_targets t
  left join public.kpi_targets o
    on o.metric = t.metric and o.location_id = p_location_id
  where t.location_id is null;
$$;

-- Reset: drop all overrides and restore org defaults.
create or replace function public.reset_kpi_targets()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_org_admin() then raise exception 'not authorized'; end if;
  delete from public.kpi_targets where location_id is not null;
  insert into public.kpi_targets (location_id, metric, threshold, goal_direction) values
    (null,'void_pct',1,'below'),(null,'discount_pct',3,'below'),
    (null,'food_pct',30,'below'),(null,'labor_pct',28,'below'),
    (null,'liquor_pct',24,'below')
  on conflict (metric) where location_id is null
  do update set threshold = excluded.threshold,
                goal_direction = excluded.goal_direction,
                updated_at = now();
end $$;

alter table public.kpi_targets enable row level security;

-- Read: org rows everyone authenticated; override rows if you can access the loc.
drop policy if exists kpi_select on public.kpi_targets;
create policy kpi_select on public.kpi_targets
  for select using ( location_id is null or public.can_access_location(location_id) );

-- Write: org-admins only. (To let GMs edit their own location override, add a
--  second policy: for all using (location_id is not null and
--  can_access_location(location_id)).)
drop policy if exists kpi_write on public.kpi_targets;
create policy kpi_write on public.kpi_targets
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );
