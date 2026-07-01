-- 07_expense_mapping.sql
-- Keyword→category mapping. Case-insensitive; longest keyword wins.

create table if not exists public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text,            -- hex for chart/UI
  sort_order int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_category_keywords (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.expense_categories(id) on delete cascade,
  keyword     text not null unique,   -- store lowercase; one category per keyword
  created_at  timestamptz not null default now()
);
create index if not exists idx_keyword_category
  on public.expense_category_keywords(category_id);

-- Keep keywords lowercase regardless of how they're inserted.
create or replace function public.lower_keyword()
returns trigger language plpgsql as $$
begin new.keyword := lower(new.keyword); return new; end $$;
drop trigger if exists trg_lower_keyword on public.expense_category_keywords;
create trigger trg_lower_keyword
  before insert or update on public.expense_category_keywords
  for each row execute function public.lower_keyword();

-- Vendor tester: longest matching keyword wins.
create or replace function public.match_expense_category(p_vendor text)
returns table(category_id uuid, category_name text, matched_keyword text)
language sql stable security definer set search_path = public
as $$
  select c.id, c.name, k.keyword
  from public.expense_category_keywords k
  join public.expense_categories c on c.id = k.category_id
  where position(k.keyword in lower(p_vendor)) > 0
  order by length(k.keyword) desc
  limit 1;
$$;

-- Whole mapping as JSON (powers the "Export JSON" button).
create or replace function public.export_expense_mapping_json()
returns jsonb language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(c.name, payload), '{}'::jsonb)
  from public.expense_categories c
  cross join lateral (
    select jsonb_build_object(
      'color', c.color,
      'keywords', coalesce(
        (select jsonb_agg(k.keyword order by length(k.keyword) desc)
         from public.expense_category_keywords k where k.category_id = c.id),
        '[]'::jsonb)
    ) as payload
  ) p;
$$;

-- Categories + keyword rules from the dashboard prototype's Settings page.
insert into public.expense_categories (name, sort_order) values
  ('COGS – Food', 1),
  ('COGS – Liquor', 2),
  ('Utilities', 3),
  ('Rent', 4),
  ('Repairs & Maintenance', 5),
  ('Marketing', 6),
  ('Payroll Services', 7),
  ('Supplies', 8),
  ('Other', 9)
on conflict (name) do nothing;

insert into public.expense_category_keywords (category_id, keyword)
select c.id, k.kw
from (values
  ('sysco', 'COGS – Food'),
  ('us foods', 'COGS – Food'),
  ('restaurant depot', 'COGS – Food'),
  ('southern glazer', 'COGS – Liquor'),
  ('republic national', 'COGS – Liquor'),
  ('georgia power', 'Utilities'),
  ('comcast', 'Utilities'),
  ('realty', 'Rent'),
  ('google ads', 'Marketing'),
  ('ecolab', 'Repairs & Maintenance')
) as k(kw, cat)
join public.expense_categories c on c.name = k.cat
on conflict (keyword) do nothing;

alter table public.expense_categories        enable row level security;
alter table public.expense_category_keywords enable row level security;

-- Org reference data: any authenticated user reads; admins write.
drop policy if exists exp_cat_select on public.expense_categories;
create policy exp_cat_select on public.expense_categories
  for select using ( auth.uid() is not null );
drop policy if exists exp_cat_write on public.expense_categories;
create policy exp_cat_write on public.expense_categories
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );

drop policy if exists exp_kw_select on public.expense_category_keywords;
create policy exp_kw_select on public.expense_category_keywords
  for select using ( auth.uid() is not null );
drop policy if exists exp_kw_write on public.expense_category_keywords;
create policy exp_kw_write on public.expense_category_keywords
  for all using ( public.is_org_admin() ) with check ( public.is_org_admin() );
