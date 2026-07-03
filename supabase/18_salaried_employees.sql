-- 18_salaried_employees.sql
-- Salaried staff are manual entries (not in Toast hours); the Payroll page's
-- add-row writes here. Salary is per pay period. Applied to the live project
-- on 2026-07-03 as migration `salaried_employees`.

create table if not exists public.salaried_employees (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null,
  role        text not null default 'Salaried',
  salary      numeric(10,2) not null,   -- per pay period
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.salaried_employees enable row level security;
drop policy if exists se_all on public.salaried_employees;
create policy se_all on public.salaried_employees
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );
