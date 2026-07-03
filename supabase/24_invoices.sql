-- 24 — Invoice & expense system (handoff INVOICE_SYSTEM reference §4–7).
-- Replaces the sheet-based flow: Fillout → Zapier (Evernote note, then POST
-- here with the service role) → rules engine auto-approves normal invoices
-- and flags anomalies → nightly rollup writes cost columns on daily_metrics.
-- Approval inversion: humans review only flagged invoices.

-- ---------- categories: add the 5-group taxonomy to the existing table ----------
alter table public.expense_categories
  add column if not exists grp text;   -- 'Operations & Facility' | 'Inventory & COGS' | ...

-- ---------- vendors ----------
create table if not exists public.vendors (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,          -- canonical display name
  default_category_id uuid references public.expense_categories(id),
  is_recurring        boolean not null default false,
  expected_amount     numeric(12,2),                 -- per expected_frequency
  expected_frequency  text,                          -- 'monthly' | 'weekly' | 'as_needed'
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.vendor_aliases (
  alias      text primary key,                       -- normalized (see fn below)
  vendor_id  uuid not null references public.vendors(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_va_vendor on public.vendor_aliases(vendor_id);

-- lowercase, strip apostrophes (' and ’) and periods, collapse whitespace
create or replace function public.normalize_vendor_name(p text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    replace(replace(replace(lower(coalesce(p, '')), '''', ''), '’', ''), '.', ''),
    '\s+', ' ', 'g'))
$$;

-- ---------- invoices ----------
do $$ begin
  create type invoice_status as enum ('auto_approved', 'needs_review', 'approved', 'declined', 'imported_legacy');
exception when duplicate_object then null; end $$;

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  submission_id   text not null unique,              -- Fillout id = idempotency key
  submitted_at    timestamptz not null default now(),
  submitted_by    uuid references public.profiles(id),  -- phase-2 native form stub
  location_id     uuid not null references public.locations(id) on delete cascade,
  vendor_id       uuid references public.vendors(id),
  vendor_name_raw text not null,                     -- exact user input, always preserved
  invoice_number  text,
  invoice_date    date not null,
  amount          numeric(12,2) not null,
  category_id     uuid references public.expense_categories(id),
  file_url        text,
  evernote_link   text,
  evernote_id     text,
  notes           text,
  status          invoice_status not null default 'needs_review',
  flag_reasons    text[],                            -- why the rules flagged it
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_inv_loc_date on public.invoices(location_id, invoice_date);
create index if not exists idx_inv_vendor on public.invoices(vendor_id, invoice_date);
create index if not exists idx_inv_status on public.invoices(status) where status = 'needs_review';

-- ---------- rule thresholds as rows (tunable without redeploy) ----------
create table if not exists public.invoice_rule_config (
  key   text primary key,
  value numeric not null
);
insert into public.invoice_rule_config (key, value) values
  ('baseline_multiplier', 2.5),
  ('baseline_min_amount', 500),
  ('baseline_lookback_days', 120),
  ('baseline_min_history', 4),
  ('duplicate_window_days', 7),
  ('recurring_variance_pct', 25),
  ('category_jump_multiplier', 1.6)
on conflict (key) do nothing;

create or replace function public.invoice_cfg(p_key text)
returns numeric language sql stable as $$
  select value from public.invoice_rule_config where key = p_key
$$;

-- ---------- rules engine: BEFORE INSERT ----------
-- Rules 1–4 (§6). imported_legacy rows skip the engine but count toward
-- baselines. Flagged inserts also raise an exception_flags row (source
-- 'rule', so reviewing it is admin-only per migration 19).
create or replace function public.invoice_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_norm text;
  v_vendor public.vendors%rowtype;
  v_reasons text[] := '{}';
  v_median numeric;
  v_history int;
  v_dupes int;
begin
  new.updated_at := now();
  v_norm := public.normalize_vendor_name(new.vendor_name_raw);

  -- resolve vendor via alias; auto-create the vendor for a new name
  select v.* into v_vendor
  from public.vendor_aliases a join public.vendors v on v.id = a.vendor_id
  where a.alias = v_norm;

  if v_vendor.id is null then
    insert into public.vendors (name) values (trim(new.vendor_name_raw))
    on conflict (name) do update set updated_at = now()
    returning * into v_vendor;
    insert into public.vendor_aliases (alias, vendor_id) values (v_norm, v_vendor.id)
    on conflict (alias) do nothing;
    if new.status not in ('imported_legacy') then
      v_reasons := array_append(v_reasons, 'New vendor — first invoice from "' || trim(new.vendor_name_raw) || '"');
    end if;
  end if;

  new.vendor_id := v_vendor.id;
  if new.category_id is null then
    new.category_id := v_vendor.default_category_id;
  end if;

  -- legacy imports keep their given status; no rules
  if new.status = 'imported_legacy' or new.status in ('approved', 'declined') then
    return new;
  end if;

  -- rule 3: possible duplicate (highest severity)
  select count(*) into v_dupes
  from public.invoices i
  where i.vendor_id = new.vendor_id
    and (
      (i.amount = new.amount
       and abs(i.invoice_date - new.invoice_date) <= public.invoice_cfg('duplicate_window_days'))
      or (new.invoice_number is not null and i.invoice_number = new.invoice_number)
    );
  if v_dupes > 0 then
    v_reasons := array_append(v_reasons,
      'Possible duplicate — same vendor with matching amount within ' ||
      public.invoice_cfg('duplicate_window_days')::int || ' days or same invoice #');
  end if;

  -- rule 2: vendor baseline (median, not mean; $ floor; needs history)
  select count(*), percentile_cont(0.5) within group (order by i.amount)
    into v_history, v_median
  from public.invoices i
  where i.vendor_id = new.vendor_id
    and i.status in ('auto_approved', 'approved', 'imported_legacy')
    and i.invoice_date >= new.invoice_date - (public.invoice_cfg('baseline_lookback_days')::int);
  if v_history >= public.invoice_cfg('baseline_min_history')
     and new.amount >= public.invoice_cfg('baseline_min_amount')
     and v_median > 0
     and new.amount > v_median * public.invoice_cfg('baseline_multiplier') then
    v_reasons := array_append(v_reasons,
      'Amount $' || to_char(new.amount, 'FM999,999,990.00') || ' is ' ||
      round(new.amount / v_median, 1) || '× this vendor''s ' ||
      public.invoice_cfg('baseline_lookback_days')::int || '-day median ($' ||
      to_char(v_median, 'FM999,999,990.00') || ')');
  end if;

  -- rule 4: recurring variance
  if v_vendor.is_recurring and v_vendor.expected_amount is not null and v_vendor.expected_amount > 0 then
    if abs(new.amount - v_vendor.expected_amount) / v_vendor.expected_amount * 100
       > public.invoice_cfg('recurring_variance_pct') then
      v_reasons := array_append(v_reasons,
        'Recurring bill off by ' ||
        round(abs(new.amount - v_vendor.expected_amount) / v_vendor.expected_amount * 100) ||
        '% (expected $' || to_char(v_vendor.expected_amount, 'FM999,999,990.00') || ')');
    end if;
  end if;

  if array_length(v_reasons, 1) is null then
    new.status := 'auto_approved';
    new.flag_reasons := null;
  else
    new.status := 'needs_review';
    new.flag_reasons := v_reasons;
    insert into public.exception_flags
      (location_id, occurred_at, server_name, rule_tripped, amount, severity, status, source, notes)
    values
      (new.location_id, new.submitted_at, v_vendor.name,
       'Invoice flagged: ' || array_to_string(v_reasons, ' · '),
       new.amount,
       (case when v_dupes > 0 then 'high' else 'med' end)::exception_severity,
       'open'::exception_status, 'rule',
       'Invoice ' || coalesce(new.invoice_number, '(no number)') || ' · submission ' || new.submission_id);
  end if;

  return new;
end $$;

drop trigger if exists trg_invoice_before_insert on public.invoices;
create trigger trg_invoice_before_insert
  before insert on public.invoices
  for each row execute function public.invoice_before_insert();

-- ---------- cost roll-up (§7) ----------
-- Food Supplies → food_cost · Alcohol & Beverage → liquor_cost ·
-- everything else EXCEPT Payroll → expenses. Lands on invoice_date.
-- Only auto_approved/approved/imported_legacy count. Recomputes the whole
-- window each run (idempotent; zeroes out days whose invoices were declined).
create or replace function public.rollup_invoice_costs(p_from date, p_to date)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- ensure a daily_metrics row exists for every (location, day) with invoices
  insert into public.daily_metrics (location_id, business_date, source)
  select distinct i.location_id, i.invoice_date, 'invoice_rollup'
  from public.invoices i
  where i.invoice_date between p_from and p_to
    and i.status in ('auto_approved', 'approved', 'imported_legacy')
  on conflict (location_id, business_date) do nothing;

  update public.daily_metrics m
  set food_cost   = coalesce(c.food, 0),
      liquor_cost = coalesce(c.liquor, 0),
      expenses    = coalesce(c.other, 0),
      updated_at  = now()
  from (
    select i.location_id, i.invoice_date,
      sum(i.amount) filter (where ec.name = 'Food Supplies')                                  as food,
      sum(i.amount) filter (where ec.name = 'Alcohol & Beverage')                             as liquor,
      sum(i.amount) filter (where coalesce(ec.name, '') not in ('Food Supplies', 'Alcohol & Beverage', 'Payroll')) as other
    from public.invoices i
    left join public.expense_categories ec on ec.id = i.category_id
    where i.invoice_date between p_from and p_to
      and i.status in ('auto_approved', 'approved', 'imported_legacy')
    group by 1, 2
  ) c
  where m.location_id = c.location_id and m.business_date = c.invoice_date;
end $$;

-- ---------- rule 5: weekly category jump ----------
create or replace function public.flag_category_jumps()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    with weekly as (
      select i.location_id, i.category_id,
        sum(i.amount) filter (where i.invoice_date >= current_date - 7) as last_week,
        sum(i.amount) filter (where i.invoice_date <  current_date - 7) / 8.0 as avg_week
      from public.invoices i
      where i.invoice_date >= current_date - 63
        and i.status in ('auto_approved', 'approved', 'imported_legacy')
        and i.category_id is not null
      group by 1, 2
    )
    select w.*, ec.name as category_name
    from weekly w join public.expense_categories ec on ec.id = w.category_id
    where w.avg_week > 0
      and w.last_week > w.avg_week * public.invoice_cfg('category_jump_multiplier')
  loop
    -- one flag per (location, category, week); skip if already raised
    if not exists (
      select 1 from public.exception_flags f
      where f.location_id = r.location_id and f.source = 'rule'
        and f.rule_tripped like 'Category spend jump: ' || r.category_name || '%'
        and f.occurred_at >= date_trunc('week', now())
    ) then
      insert into public.exception_flags
        (location_id, occurred_at, rule_tripped, amount, severity, status, source, notes)
      values
        (r.location_id, now(),
         'Category spend jump: ' || r.category_name,
         r.last_week, 'medium', 'open', 'rule',
         'Last week $' || to_char(r.last_week, 'FM999,999,990') ||
         ' vs trailing-8-week avg $' || to_char(r.avg_week, 'FM999,999,990'));
    end if;
  end loop;
end $$;

-- ---------- review action (single authority for approve/decline) ----------
create or replace function public.review_invoice(p_invoice_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin() then
    raise exception 'only admins can review invoices';
  end if;
  update public.invoices
  set status = case when p_approve then 'approved'::invoice_status else 'declined'::invoice_status end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_invoice_id and status = 'needs_review';
end $$;

-- ---------- cron ----------
-- nightly cost rollup over trailing 45 days (self-heals late entry & reviews)
select cron.schedule('invoice-rollup-nightly', '30 8 * * *',
  $$select public.rollup_invoice_costs(current_date - 45, current_date)$$);
-- weekly category-jump scan, Mondays 13:00 UTC
select cron.schedule('invoice-category-jumps-weekly', '0 13 * * 1',
  $$select public.flag_category_jumps()$$);

-- ---------- RLS ----------
alter table public.vendors enable row level security;
drop policy if exists ven_select on public.vendors;
create policy ven_select on public.vendors for select using (auth.role() = 'authenticated');
drop policy if exists ven_write on public.vendors;
create policy ven_write on public.vendors for all using (public.is_org_admin()) with check (public.is_org_admin());

alter table public.vendor_aliases enable row level security;
drop policy if exists va_select on public.vendor_aliases;
create policy va_select on public.vendor_aliases for select using (auth.role() = 'authenticated');
drop policy if exists va_write on public.vendor_aliases;
create policy va_write on public.vendor_aliases for all using (public.is_org_admin()) with check (public.is_org_admin());

alter table public.invoices enable row level security;
drop policy if exists inv_select on public.invoices;
create policy inv_select on public.invoices for select using (public.can_access_location(location_id));
-- writes: Zapier uses the service role (bypasses RLS); reviews go through
-- review_invoice() (security definer, admin-checked). Direct client updates
-- stay admin-only as a safety net.
drop policy if exists inv_update on public.invoices;
create policy inv_update on public.invoices for update
  using (public.is_org_admin()) with check (public.is_org_admin());

alter table public.invoice_rule_config enable row level security;
drop policy if exists irc_select on public.invoice_rule_config;
create policy irc_select on public.invoice_rule_config for select using (auth.role() = 'authenticated');
drop policy if exists irc_write on public.invoice_rule_config;
create policy irc_write on public.invoice_rule_config for all using (public.is_org_admin()) with check (public.is_org_admin());
