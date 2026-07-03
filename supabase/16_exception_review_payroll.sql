-- 16_exception_review_payroll.sql
-- Groundwork for the exception review flow (handoff §7), large-tip auto-hold
-- (§8), and payroll runs (§9). Applied to the live project on 2026-07-03 as
-- migration `exception_review_payroll`.
--
-- The UI ships against sample data until the import-time rule evaluator and
-- the Toast-payroll/tips-sheet feeds exist; these tables define where that
-- data lands. The ADP column template in payroll_runs.csv must be confirmed
-- against the group's actual ADP product before the real export is wired.

-- ---------- exception review flow (§7) ----------
-- Status grows held / released / denied alongside open / cleared (= approved).
alter type exception_status add value if not exists 'held';
alter type exception_status add value if not exists 'released';
alter type exception_status add value if not exists 'denied';

-- Generalize the clear-only audit columns: approve AND deny are both reviews.
alter table public.exception_flags rename column cleared_by to reviewed_by;
alter table public.exception_flags rename column cleared_at to reviewed_at;

-- ---------- payroll runs (§9) ----------
create table if not exists public.payroll_runs (
  id           uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end   date not null,
  checks_dated date,
  batch_id     text unique,                 -- e.g. TG0928
  status       text not null default 'in_progress',  -- in_progress | exported
  exported_at  timestamptz,
  exported_by  uuid references public.profiles(id),
  csv          text,                        -- the exact CSV sent to ADP, kept per batch
  created_at   timestamptz not null default now()
);

create table if not exists public.payroll_lines (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.payroll_runs(id) on delete cascade,
  location_id   uuid not null references public.locations(id) on delete cascade,
  employee_name text not null,
  employee_type text not null default 'hourly',  -- hourly | salaried
  hours         numeric(8,2) not null default 0,
  ot_hours      numeric(8,2) not null default 0, -- paid at straight time; read-only column
  rate          numeric(8,2) not null default 0,
  tips          numeric(10,2) not null default 0, -- net of tip-out, from recon sheet
  tip_out       numeric(10,2) not null default 0, -- reference only
  salary        numeric(10,2) not null default 0,
  matched       boolean not null default true,    -- Toast name ↔ sheet name
  created_at    timestamptz not null default now()
);
create index if not exists idx_pl_run on public.payroll_lines(run_id);
create index if not exists idx_pl_loc on public.payroll_lines(location_id);

-- ---------- large-tip holds (§8) ----------
do $$ begin
  create type tip_hold_status as enum ('held','released','denied');
exception when duplicate_object then null; end $$;

create table if not exists public.tip_holds (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references public.locations(id) on delete cascade,
  exception_id    uuid references public.exception_flags(id) on delete set null,
  check_number    text,
  server_name     text,
  amount          numeric(10,2) not null,
  flagged_at      timestamptz not null,
  release_at      date not null,            -- flagged date + hold window (14 days)
  status          tip_hold_status not null default 'held',
  released_run_id uuid references public.payroll_runs(id), -- run whose check picked it up
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_th_loc_status on public.tip_holds(location_id, status);
create index if not exists idx_th_release on public.tip_holds(release_at) where status = 'held';

-- ---------- RLS ----------
-- Payroll is pay-sensitive: org admin/owner only, both directions.
alter table public.payroll_runs enable row level security;
drop policy if exists pr_all on public.payroll_runs;
create policy pr_all on public.payroll_runs
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );

alter table public.payroll_lines enable row level security;
drop policy if exists pll_all on public.payroll_lines;
create policy pll_all on public.payroll_lines
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );

-- Holds surface on the (location-scoped) exception page; writes stay admin.
alter table public.tip_holds enable row level security;
drop policy if exists th_select on public.tip_holds;
create policy th_select on public.tip_holds
  for select using ( public.can_access_location(location_id) );
drop policy if exists th_write on public.tip_holds;
create policy th_write on public.tip_holds
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );
