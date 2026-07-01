-- 10_exceptions_chargebacks.sql
-- Per-transaction chargebacks (Option A) + theft/audit exception flags.

-- ---------- chargebacks ----------
create table if not exists public.chargebacks (
  id               uuid primary key default gen_random_uuid(),
  location_id      uuid not null references public.locations(id) on delete cascade,
  check_number     text,
  transaction_date date,
  amount           numeric(10,2) not null,
  stage            chargeback_stage not null default 'in_progress',
  reason           text,
  card_network     text,
  opened_at        date,
  resolved_at      date,
  notes            text,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_cb_loc_stage on public.chargebacks(location_id, stage);
create index if not exists idx_cb_loc_date  on public.chargebacks(location_id, transaction_date);

-- Stage tiles: count + dollars per Won / In Progress / Lost.
-- p_location_id NULL = every location the caller can access.
create or replace function public.get_chargeback_totals(
  p_location_id uuid default null, p_start date default null, p_end date default null)
returns table(stage chargeback_stage, cnt bigint, total numeric)
language sql stable security definer set search_path = public
as $$
  select stage, count(*), coalesce(sum(amount),0)
  from public.chargebacks
  where (p_location_id is null or location_id = p_location_id)
    and (p_start is null or transaction_date >= p_start)
    and (p_end   is null or transaction_date <= p_end)
    and public.can_access_location(location_id)   -- definer bypasses RLS; enforce here
  group by stage;
$$;

alter table public.chargebacks enable row level security;

drop policy if exists cb_select on public.chargebacks;
create policy cb_select on public.chargebacks
  for select using ( public.can_access_location(location_id) );

-- Insert/update by anyone who can access the location (managers log them,
-- admin/owner work them). Delete restricted to admins to protect history.
drop policy if exists cb_insert on public.chargebacks;
create policy cb_insert on public.chargebacks
  for insert with check ( public.can_access_location(location_id) );
drop policy if exists cb_update on public.chargebacks;
create policy cb_update on public.chargebacks
  for update using ( public.can_access_location(location_id) )
            with check ( public.can_access_location(location_id) );
drop policy if exists cb_delete on public.chargebacks;
create policy cb_delete on public.chargebacks
  for delete using ( public.is_org_admin() );

-- ---------- exception_flags ----------
create table if not exists public.exception_flags (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  occurred_at   timestamptz not null,
  check_number  text,
  server_name   text,
  rule_tripped  text not null,
  amount        numeric(10,2),
  severity      exception_severity not null default 'med',
  status        exception_status   not null default 'open',
  source        exception_source   not null default 'manual',
  rule_id       uuid,               -- future FK to a rules table; nullable for now
  cleared_by    uuid references public.profiles(id),
  cleared_at    timestamptz,
  notes         text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_exc_loc_status on public.exception_flags(location_id, status);
create index if not exists idx_exc_loc_time   on public.exception_flags(location_id, occurred_at desc);
create index if not exists idx_exc_severity   on public.exception_flags(severity);

alter table public.exception_flags enable row level security;

drop policy if exists exc_select on public.exception_flags;
create policy exc_select on public.exception_flags
  for select using ( public.can_access_location(location_id) );

drop policy if exists exc_insert on public.exception_flags;
create policy exc_insert on public.exception_flags
  for insert with check ( public.can_access_location(location_id) );

-- Clearing is allowed by anyone who can access the location. If clearing should
-- be a GM/admin-only control action, change this USING to is_org_admin().
drop policy if exists exc_update on public.exception_flags;
create policy exc_update on public.exception_flags
  for update using ( public.can_access_location(location_id) )
            with check ( public.can_access_location(location_id) );

drop policy if exists exc_delete on public.exception_flags;
create policy exc_delete on public.exception_flags
  for delete using ( public.is_org_admin() );
