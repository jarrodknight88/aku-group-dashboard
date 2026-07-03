-- 20 — Dashboard-managed hourly rates.
-- Toast time entries rarely carry a wage (48 of 2,348 rows at go-live), so
-- rates are owned here instead: set once on the Payroll page, applied to every
-- pay period's Toast hours until changed. A dashboard rate overrides whatever
-- Toast reports for that employee; employees with neither show $0 and stand
-- out in the run. Exported batches keep their CSV snapshot in payroll_runs,
-- so later rate edits never rewrite an exported run's record.

create table if not exists public.employee_rates (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  employee_guid text not null unique,          -- Toast employee guid
  employee_name text,                          -- display convenience only
  rate          numeric(8,2) not null check (rate >= 0),
  updated_at    timestamptz not null default now()
);

-- Pay-sensitive, same posture as payroll_runs: org admin/owner only.
alter table public.employee_rates enable row level security;
drop policy if exists er_all on public.employee_rates;
create policy er_all on public.employee_rates
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );
