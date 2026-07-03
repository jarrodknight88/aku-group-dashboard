-- 17_labor_tips_intake.sql
-- Payroll data intake (handoff §9): per-employee daily hours/rates from the
-- Toast pull, plus nightly tips from the reconciliation Google Sheet pushed
-- by its Apps Script through the ingest_daily_tips RPC. Applied to the live
-- project on 2026-07-03 as migration `labor_tips_intake`.

-- ---------- per-employee daily labor (written by the Toast pull) ----------
create table if not exists public.daily_labor (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  employee_guid text not null,
  employee_name text,
  job_title     text not null default '',
  hours         numeric(8,2) not null default 0,
  rate          numeric(8,2) not null default 0,  -- weighted avg when entries differ
  wages         numeric(12,2) not null default 0, -- straight time (hours × rate)
  created_at    timestamptz not null default now(),
  unique (location_id, business_date, employee_guid, job_title)
);
create index if not exists idx_dl_loc_date on public.daily_labor(location_id, business_date);

-- ---------- nightly tips from the reconciliation sheet ----------
-- amount = what the employee is owed for that night (earned tips for the
-- tipped section, received tipout for the support section — matching the
-- sheet's own weekly-gratuity logic). tip_out (optional) = what the employee
-- tipped out, carried as the reference-only column on the payroll page.
create table if not exists public.daily_tips (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  employee_name text not null,
  amount        numeric(10,2) not null default 0,
  tip_out       numeric(10,2),
  section       text not null default 'earned',   -- earned | tipout
  created_at    timestamptz not null default now(),
  unique (location_id, business_date, employee_name)
);
create index if not exists idx_dt_loc_date on public.daily_tips(location_id, business_date);

-- Sheet-name ↔ Toast-employee aliases for payroll matching (nicknames like
-- "Foxy Bittar" / "BB Epps"). Unmatched names surface as ● Review per §9.
create table if not exists public.employee_aliases (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade, -- null = org-wide
  sheet_name  text not null,          -- normalized lower-case sheet spelling
  toast_guid  text,
  toast_name  text,
  created_at  timestamptz not null default now(),
  unique (location_id, sheet_name)
);

-- ---------- ingest endpoint for the Apps Script ----------
-- Shared-secret table; RLS with no policies = only definer functions and the
-- service role can read it.
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
insert into public.app_secrets (key, value)
values ('tips_ingest_token', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- Replaces one location-day of tips wholesale (idempotent nightly re-push).
create or replace function public.ingest_daily_tips(
  p_token text, p_location_code text, p_business_date date, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_secret text;
  v_loc uuid;
  v_n integer := 0;
  r jsonb;
begin
  select value into v_secret from app_secrets where key = 'tips_ingest_token';
  if v_secret is null or p_token is distinct from v_secret then
    raise exception 'invalid ingest token';
  end if;
  select id into v_loc from locations where lower(code) = lower(p_location_code);
  if v_loc is null then
    raise exception 'unknown location code: %', p_location_code;
  end if;
  delete from daily_tips where location_id = v_loc and business_date = p_business_date;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if coalesce(trim(r->>'name'), '') = '' then continue; end if;
    insert into daily_tips (location_id, business_date, employee_name, amount, tip_out, section)
    values (
      v_loc, p_business_date, trim(r->>'name'),
      coalesce((r->>'amount')::numeric, 0),
      nullif(r->>'tip_out', '')::numeric,
      coalesce(nullif(r->>'section', ''), 'earned')
    )
    on conflict (location_id, business_date, employee_name)
    do update set amount = daily_tips.amount + excluded.amount;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.ingest_daily_tips(text, text, date, jsonb) from public;
grant execute on function public.ingest_daily_tips(text, text, date, jsonb) to anon, authenticated;

-- ---------- RLS: pay-sensitive, org admin only ----------
alter table public.daily_labor enable row level security;
drop policy if exists dl_all on public.daily_labor;
create policy dl_all on public.daily_labor
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );

alter table public.daily_tips enable row level security;
drop policy if exists dt_all on public.daily_tips;
create policy dt_all on public.daily_tips
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );

alter table public.employee_aliases enable row level security;
drop policy if exists ea_all on public.employee_aliases;
create policy ea_all on public.employee_aliases
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );
