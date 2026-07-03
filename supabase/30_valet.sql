-- 30 — Valet revenue (mapped from the workbooks' "Valet Detail" tab).
-- Valet is an in-house operation tracked per business day: revenue arrives
-- as Cash / CashApp / Clover, minus valet workers paid and incidental costs
-- (cones, tickets, walkies) = Teranga net. total_revenue is authoritative —
-- on event nights it can exceed the three payment columns, matching the
-- sheet. Data surfaces as a headline KPI (design handoff: Net Sales, Covers,
-- Avg Check, Valet), a Financials worksheet, and P&L revenue/expense lines.
--
-- History: Brookhaven/ATL rows Apr–Nov 2025 imported from the workbook
-- (source = 'workbook_import'; four sheet date typos corrected against the
-- day-of-week column). Going forward, managers enter nights here.

create table if not exists public.valet_days (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references public.locations(id) on delete cascade,
  business_date  date not null,
  cash           numeric(12,2) not null default 0,
  cashapp        numeric(12,2) not null default 0,
  clover         numeric(12,2) not null default 0,
  total_revenue  numeric(12,2) not null default 0,
  workers_paid   numeric(12,2) not null default 0,
  other_expenses numeric(12,2) not null default 0,
  net            numeric(12,2) not null default 0,   -- total_revenue - workers_paid - other_expenses
  notes          text,
  source         text not null default 'manual',     -- 'manual' | 'workbook_import'
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (location_id, business_date)
);
create index if not exists idx_valet_loc_date on public.valet_days(location_id, business_date);

-- RLS: managers record their own venue's valet nights; only admins delete.
alter table public.valet_days enable row level security;
drop policy if exists valet_select on public.valet_days;
create policy valet_select on public.valet_days for select
  using (public.can_access_location(location_id));
drop policy if exists valet_insert on public.valet_days;
create policy valet_insert on public.valet_days for insert
  with check (public.can_access_location(location_id));
drop policy if exists valet_update on public.valet_days;
create policy valet_update on public.valet_days for update
  using (public.can_access_location(location_id))
  with check (public.can_access_location(location_id));
drop policy if exists valet_delete on public.valet_days;
create policy valet_delete on public.valet_days for delete
  using (public.is_org_admin());
