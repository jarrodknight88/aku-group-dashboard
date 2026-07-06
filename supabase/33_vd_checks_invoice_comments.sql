-- 33 — Check-level void/discount detail + invoice comment threads.
--
-- daily_vd_checks: one row per (check, kind) whenever a check had a void or
-- discount — carries the Toast check number, who rang it, the reason, and a
-- jsonb snapshot of EVERYTHING on the ticket (voided/discounted lines
-- flagged), so the drill-down can show what else was rung in. Written by
-- the Toast pull (service role) alongside the daily aggregates; the check
-- number is also the future join key for GroupMe photos.
--
-- invoice_comments: the same threaded commenting the void lines got, on
-- expenses — visible to anyone who can see the invoice's location.

create table if not exists public.daily_vd_checks (
  id            bigint generated always as identity primary key,
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  kind          text not null check (kind in ('void', 'discount')),
  check_guid    text,
  check_number  text,
  employee_guid text,
  employee_name text,
  reason        text,
  amount        numeric(12,2) not null default 0,
  qty           numeric(10,2) not null default 0,
  opened_at     timestamptz,
  items         jsonb          -- [{name, qty, price, voided, discounted}] — the whole ticket
);
create index if not exists idx_dvc_loc_date on public.daily_vd_checks(location_id, business_date);

alter table public.daily_vd_checks enable row level security;
drop policy if exists dvc_select on public.daily_vd_checks;
create policy dvc_select on public.daily_vd_checks
  for select using (public.can_access_location(location_id));

create table if not exists public.invoice_comments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  comment     text not null,
  author_id   uuid references public.profiles(id),
  author_name text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ic_invoice on public.invoice_comments(invoice_id);

alter table public.invoice_comments enable row level security;
drop policy if exists ic_select on public.invoice_comments;
create policy ic_select on public.invoice_comments for select
  using (exists (select 1 from public.invoices i where i.id = invoice_id and public.can_access_location(i.location_id)));
drop policy if exists ic_insert on public.invoice_comments;
create policy ic_insert on public.invoice_comments for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.invoices i where i.id = invoice_id and public.can_access_location(i.location_id))
  );
drop policy if exists ic_delete on public.invoice_comments;
create policy ic_delete on public.invoice_comments for delete
  using (author_id = auth.uid() or public.is_org_admin());
