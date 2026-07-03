-- 21 — Payroll exclusions.
-- Some people clock in through Toast but aren't paid through this payroll
-- (managers, security). Excluding one removes them from the hourly run, the
-- totals, and the ADP export; they surface in an "Excluded employees" section
-- at the bottom of the run instead, with a Restore action. Their sheet tips
-- (if any) fall into the unmatched banner rather than vanishing silently.

create table if not exists public.payroll_exclusions (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  employee_guid text not null unique,          -- Toast employee guid
  employee_name text,                          -- display convenience only
  created_at    timestamptz not null default now()
);

-- Pay-sensitive, same posture as the rest of payroll: org admin/owner only.
alter table public.payroll_exclusions enable row level security;
drop policy if exists pe_all on public.payroll_exclusions;
create policy pe_all on public.payroll_exclusions
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );
