-- 32 — Notes on void/discount lines. The Toast pull aggregates voids and
-- discounts per (day, employee, reason) in daily_void_discounts, and those
-- rows are rewritten on re-import — so notes live in their own table keyed
-- by the line's natural identity, not its row id. Managers annotate lines
-- for their own locations ("spoke to server", "kitchen error confirmed",
-- GroupMe photo link, …); notes survive re-imports.

create table if not exists public.void_discount_notes (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  kind          text not null check (kind in ('void', 'discount')),
  employee_key  text not null default '',   -- employee_guid, or name when Toast has no guid
  reason        text not null default '',
  note          text not null,
  author_id     uuid references public.profiles(id),
  author_name   text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_vdn_loc_date on public.void_discount_notes(location_id, business_date);

alter table public.void_discount_notes enable row level security;
drop policy if exists vdn_select on public.void_discount_notes;
create policy vdn_select on public.void_discount_notes for select
  using (public.can_access_location(location_id));
drop policy if exists vdn_insert on public.void_discount_notes;
create policy vdn_insert on public.void_discount_notes for insert
  with check (public.can_access_location(location_id) and author_id = auth.uid());
-- authors can remove their own note; admins can remove any
drop policy if exists vdn_delete on public.void_discount_notes;
create policy vdn_delete on public.void_discount_notes for delete
  using (author_id = auth.uid() or public.is_org_admin());
