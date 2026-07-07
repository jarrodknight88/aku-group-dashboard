-- 38 — Kitchen Order Guide POC (spec: POC_Order_Guide_Handoff.md, Jul 6 2026).
--
-- Demand-forecast ordering for ATL: forecast dish sales for a target date,
-- convert to ingredient needs via the recipe map, buffer, round to vendor
-- packs. Forecast source: rolling same-day-of-week average from
-- daily_menu_items (the nightly Toast pull) when >=3 observations exist,
-- else the seeded June averages. All portions/packs are estimates until the
-- chef burns down is_estimate / is_verified.
--
-- v2 stubs (inventory_counts, deliveries) created now so nothing reworks.

create table if not exists public.dishes (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null,
  count_basis text not null default 'order' check (count_basis in ('order', 'piece')),
  unique (location_id, name)
);

create table if not exists public.dish_forecast (
  dish_id uuid not null references public.dishes(id) on delete cascade,
  dow     smallint not null check (dow between 0 and 6),  -- 0 = Sunday (Postgres DOW)
  avg_qty numeric(10,2) not null default 0,
  primary key (dish_id, dow)
);

create table if not exists public.ingredients (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null,
  pack_label  text not null,
  pack_qty    numeric(10,2) not null,
  pack_unit   text not null,             -- lb | oz | each
  vendor      text,
  buffer_pct  numeric(5,2),              -- per-ingredient override; null = guide default
  is_verified boolean not null default false,
  note        text,
  unique (location_id, name)
);

create table if not exists public.recipe_map (
  dish_id       uuid not null references public.dishes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  qty_per_unit  numeric(10,4) not null,
  unit          text not null,           -- lb | oz | each (per dish unit: order or piece)
  is_estimate   boolean not null default true,
  note          text,
  primary key (dish_id, ingredient_id)
);

create table if not exists public.standing_order_rules (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  dows          smallint[] not null,     -- Postgres DOW values this rule fires on
  packs         int not null,
  note          text
);

create table if not exists public.order_guides (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations(id) on delete cascade,
  target_date  date not null,
  generated_at timestamptz not null default now(),
  buffer_pct   numeric(5,2) not null default 0.25,
  status       text not null default 'draft' check (status in ('draft', 'confirmed', 'ordered')),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id),
  unique (location_id, target_date)
);

create table if not exists public.order_guide_lines (
  id             uuid primary key default gen_random_uuid(),
  order_guide_id uuid not null references public.order_guides(id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients(id),
  forecast_need  numeric(12,2),          -- in the ingredient's pack_unit; null = standing rule
  buffer_pct     numeric(5,2) not null default 0.25,
  suggested_packs int not null default 0,
  adjusted_packs  int not null default 0, -- suggested vs adjusted delta = tuning signal
  is_estimate    boolean not null default true,
  note           text
);
create index if not exists idx_ogl_guide on public.order_guide_lines(order_guide_id);

-- v2 stubs
create table if not exists public.inventory_counts (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  qty           numeric(12,2) not null,
  counted_at    timestamptz not null default now(),
  counted_by    uuid references public.profiles(id)
);
create table if not exists public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  packs         int not null,
  delivered_on  date not null,
  source        text
);

-- RLS: same pattern as the rest of the dashboard — location scoped, and the
-- guide flow is open to every role with access (managers + admins).
do $rls$
declare t text;
begin
  foreach t in array array['dishes','ingredients','standing_order_rules','order_guides','inventory_counts','deliveries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_sel on public.%I', t, t);
    execute format('create policy %I_sel on public.%I for select using (public.can_access_location(location_id))', t, t);
  end loop;
end $rls$;

drop policy if exists og_write on public.order_guides;
create policy og_write on public.order_guides for all
  using (public.can_access_location(location_id))
  with check (public.can_access_location(location_id));

alter table public.dish_forecast enable row level security;
drop policy if exists df_sel on public.dish_forecast;
create policy df_sel on public.dish_forecast for select
  using (exists (select 1 from public.dishes d where d.id = dish_id and public.can_access_location(d.location_id)));

alter table public.recipe_map enable row level security;
drop policy if exists rm_sel on public.recipe_map;
create policy rm_sel on public.recipe_map for select
  using (exists (select 1 from public.dishes d where d.id = dish_id and public.can_access_location(d.location_id)));

alter table public.order_guide_lines enable row level security;
drop policy if exists ogl_all on public.order_guide_lines;
create policy ogl_all on public.order_guide_lines for all
  using (exists (select 1 from public.order_guides g where g.id = order_guide_id and public.can_access_location(g.location_id)))
  with check (exists (select 1 from public.order_guides g where g.id = order_guide_id and public.can_access_location(g.location_id)));

-- Toast item names -> canonical dish names (spec consolidation rules):
-- strip leading "HH ", strip trailing " - MIN n", case-fold.
create or replace function public.canonical_dish_name(t text)
returns text language sql immutable as $$
  select lower(btrim(regexp_replace(regexp_replace(coalesce(t, ''), '^\s*HH\s+', '', 'i'), '\s*-\s*MIN\s*\d+\s*$', '', 'i')))
$$;

-- Order-guide generation. Rebuilds the draft for (location, target date);
-- a confirmed guide is frozen and returned as-is.
create or replace function public.generate_order_guide(p_location_id uuid, p_target date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_guide uuid;
  v_buffer numeric := 0.25;
  v_dow int := extract(dow from p_target)::int;
begin
  if not public.can_access_location(p_location_id) then
    raise exception 'not authorized for this location';
  end if;

  select id into v_guide from order_guides
   where location_id = p_location_id and target_date = p_target and status <> 'draft';
  if v_guide is not null then
    return v_guide; -- confirmed/ordered guides are frozen
  end if;

  delete from order_guides where location_id = p_location_id and target_date = p_target;
  insert into order_guides (location_id, target_date, buffer_pct)
  values (p_location_id, p_target, v_buffer)
  returning id into v_guide;

  with live as (
    -- rolling same-DOW average from the Toast pull (last 6 occurrences,
    -- looking back 60 days); needs >=3 observations to outrank the seed
    select d.id as dish_id, avg(q.day_qty) as avg_qty, count(*) as n
    from dishes d
    join lateral (
      select dmi.business_date, sum(dmi.quantity) as day_qty
      from daily_menu_items dmi
      where dmi.location_id = d.location_id
        and public.canonical_dish_name(dmi.item_name) = public.canonical_dish_name(d.name)
        and extract(dow from dmi.business_date)::int = v_dow
        and dmi.business_date >= p_target - 60
        and dmi.business_date < p_target
      group by dmi.business_date
      order by dmi.business_date desc
      limit 6
    ) q on true
    where d.location_id = p_location_id
    group by d.id
  ),
  fc as (
    select d.id as dish_id,
           case when l.n >= 3 then l.avg_qty else coalesce(f.avg_qty, 0) end as qty
    from dishes d
    left join dish_forecast f on f.dish_id = d.id and f.dow = v_dow
    left join live l on l.dish_id = d.id
    where d.location_id = p_location_id
  ),
  needs as (
    select r.ingredient_id,
           sum(fc.qty * r.qty_per_unit *
               case
                 when r.unit = i.pack_unit then 1
                 when r.unit = 'oz' and i.pack_unit = 'lb' then 1.0 / 16
                 when r.unit = 'lb' and i.pack_unit = 'oz' then 16
                 else 1
               end) as need,
           bool_or(r.is_estimate) as any_estimate
    from recipe_map r
    join fc on fc.dish_id = r.dish_id
    join ingredients i on i.id = r.ingredient_id
    where fc.qty > 0
    group by r.ingredient_id
  )
  insert into order_guide_lines (order_guide_id, ingredient_id, forecast_need, buffer_pct, suggested_packs, adjusted_packs, is_estimate)
  select v_guide, n.ingredient_id, round(n.need, 2),
         coalesce(i.buffer_pct, v_buffer),
         ceil(n.need * (1 + coalesce(i.buffer_pct, v_buffer)) / i.pack_qty)::int,
         ceil(n.need * (1 + coalesce(i.buffer_pct, v_buffer)) / i.pack_qty)::int,
         n.any_estimate
  from needs n
  join ingredients i on i.id = n.ingredient_id
  where n.need > 0;

  -- standing consumables (fry oil etc.)
  insert into order_guide_lines (order_guide_id, ingredient_id, forecast_need, buffer_pct, suggested_packs, adjusted_packs, is_estimate, note)
  select v_guide, r.ingredient_id, null, 0, r.packs, r.packs, false, r.note
  from standing_order_rules r
  where r.location_id = p_location_id and v_dow = any(r.dows);

  return v_guide;
end $$;

revoke all on function public.generate_order_guide(uuid, date) from public, anon;
grant execute on function public.generate_order_guide(uuid, date) to authenticated;

-- ===== ATL seed (June 1-22 2026 Toast data + Claude-estimated recipes) =====
do $seed$
declare
  v_loc uuid;
begin
  select id into v_loc from public.locations where upper(code) = 'ATL' limit 1;
  if v_loc is null then
    raise exception 'ATL location not found';
  end if;

  insert into public.dishes (location_id, name, count_basis)
  select v_loc, x.name, x.basis from (values
  ('Wings', 'piece'),
  ('Lamb Chop', 'piece'),
  ('Wings and Fries', 'order'),
  ('French Fries', 'order'),
  ('Shrimp Basket', 'order'),
  ('Jollof Rice', 'order'),
  ('Garlic Mashed Potatoes', 'order'),
  ('Cajun Jollof Pasta', 'order'),
  ('Lamb Chop Meal', 'order'),
  ('Crab Cake', 'order'),
  ('Beef Suya', 'order'),
  ('Salmon Bites', 'order'),
  ('Calamari', 'order'),
  ('Mixed Vegetables', 'order'),
  ('Fusion Tacos', 'order'),
  ('Salmon', 'order'),
  ('Chicken & Waffles', 'order'),
  ('Red Snapper', 'order'),
  ('Seafood Fusion Yassa', 'order'),
  ('Fried Calamari', 'order'),
  ('Lamb Dibi Skewers', 'order'),
  ('Fried Plantains', 'order'),
  ('Eggs Any Style', 'order'),
  ('Garlic Shrimp', 'order'),
  ('Chicken Dibi skewers', 'order'),
  ('Garlic crab & Shrimp with corn and potatoes', 'order'),
  ('Garlic Crab', 'order'),
  ('Broccoli', 'order'),
  ('Side Salad', 'order'),
  ('White Rice', 'order'),
  ('Lobster', 'order'),
  ('Lobster Bites', 'order'),
  ('Beef Burger', 'order'),
  ('Extra Shrimp', 'order')
  ) as x(name, basis)
  on conflict (location_id, name) do nothing;

  insert into public.dish_forecast (dish_id, dow, avg_qty)
  select d.id, x.dow, x.qty
  from (values
  ('Wings', 0, 932.7),
  ('Wings', 1, 592.2),
  ('Wings', 2, 619.7),
  ('Wings', 3, 910.3),
  ('Wings', 4, 968.7),
  ('Wings', 5, 1789.0),
  ('Wings', 6, 1405.3),
  ('Lamb Chop', 0, 565.3),
  ('Lamb Chop', 1, 199.2),
  ('Lamb Chop', 2, 173.7),
  ('Lamb Chop', 3, 260.7),
  ('Lamb Chop', 4, 354.3),
  ('Lamb Chop', 5, 475.7),
  ('Lamb Chop', 6, 515.0),
  ('Wings and Fries', 0, 60.7),
  ('Wings and Fries', 1, 21.5),
  ('Wings and Fries', 2, 25.3),
  ('Wings and Fries', 3, 32.7),
  ('Wings and Fries', 4, 36.3),
  ('Wings and Fries', 5, 89.0),
  ('Wings and Fries', 6, 133.3),
  ('French Fries', 0, 56.0),
  ('French Fries', 1, 24.5),
  ('French Fries', 2, 33.7),
  ('French Fries', 3, 41.7),
  ('French Fries', 4, 49.7),
  ('French Fries', 5, 93.7),
  ('French Fries', 6, 90.3),
  ('Shrimp Basket', 0, 39.0),
  ('Shrimp Basket', 1, 22.0),
  ('Shrimp Basket', 2, 13.7),
  ('Shrimp Basket', 3, 23.7),
  ('Shrimp Basket', 4, 38.7),
  ('Shrimp Basket', 5, 63.0),
  ('Shrimp Basket', 6, 64.0),
  ('Jollof Rice', 0, 41.0),
  ('Jollof Rice', 1, 17.2),
  ('Jollof Rice', 2, 15.0),
  ('Jollof Rice', 3, 21.7),
  ('Jollof Rice', 4, 25.3),
  ('Jollof Rice', 5, 32.3),
  ('Jollof Rice', 6, 37.0),
  ('Garlic Mashed Potatoes', 0, 51.0),
  ('Garlic Mashed Potatoes', 1, 10.5),
  ('Garlic Mashed Potatoes', 2, 10.7),
  ('Garlic Mashed Potatoes', 3, 14.0),
  ('Garlic Mashed Potatoes', 4, 15.0),
  ('Garlic Mashed Potatoes', 5, 16.0),
  ('Garlic Mashed Potatoes', 6, 33.7),
  ('Cajun Jollof Pasta', 0, 33.0),
  ('Cajun Jollof Pasta', 1, 12.8),
  ('Cajun Jollof Pasta', 2, 10.7),
  ('Cajun Jollof Pasta', 3, 14.0),
  ('Cajun Jollof Pasta', 4, 15.7),
  ('Cajun Jollof Pasta', 5, 23.3),
  ('Cajun Jollof Pasta', 6, 33.0),
  ('Lamb Chop Meal', 0, 25.0),
  ('Lamb Chop Meal', 1, 7.0),
  ('Lamb Chop Meal', 2, 5.7),
  ('Lamb Chop Meal', 3, 10.3),
  ('Lamb Chop Meal', 4, 10.0),
  ('Lamb Chop Meal', 5, 20.0),
  ('Lamb Chop Meal', 6, 36.3),
  ('Crab Cake', 0, 28.3),
  ('Crab Cake', 1, 6.0),
  ('Crab Cake', 2, 7.7),
  ('Crab Cake', 3, 7.3),
  ('Crab Cake', 4, 13.3),
  ('Crab Cake', 5, 17.3),
  ('Crab Cake', 6, 28.7),
  ('Beef Suya', 0, 25.3),
  ('Beef Suya', 1, 11.8),
  ('Beef Suya', 2, 7.7),
  ('Beef Suya', 3, 6.7),
  ('Beef Suya', 4, 8.3),
  ('Beef Suya', 5, 15.7),
  ('Beef Suya', 6, 22.7),
  ('Salmon Bites', 0, 7.0),
  ('Salmon Bites', 1, 10.2),
  ('Salmon Bites', 2, 9.0),
  ('Salmon Bites', 3, 12.7),
  ('Salmon Bites', 4, 14.0),
  ('Salmon Bites', 5, 26.7),
  ('Salmon Bites', 6, 12.7),
  ('Calamari', 0, 7.0),
  ('Calamari', 1, 8.8),
  ('Calamari', 2, 6.3),
  ('Calamari', 3, 10.3),
  ('Calamari', 4, 12.0),
  ('Calamari', 5, 13.0),
  ('Calamari', 6, 16.0),
  ('Mixed Vegetables', 0, 14.0),
  ('Mixed Vegetables', 1, 7.5),
  ('Mixed Vegetables', 2, 3.7),
  ('Mixed Vegetables', 3, 5.7),
  ('Mixed Vegetables', 4, 6.0),
  ('Mixed Vegetables', 5, 12.0),
  ('Mixed Vegetables', 6, 18.3),
  ('Fusion Tacos', 0, 0.0),
  ('Fusion Tacos', 1, 0.0),
  ('Fusion Tacos', 2, 62.3),
  ('Fusion Tacos', 3, 0.0),
  ('Fusion Tacos', 4, 0.0),
  ('Fusion Tacos', 5, 0.0),
  ('Fusion Tacos', 6, 0.0),
  ('Salmon', 0, 12.3),
  ('Salmon', 1, 2.2),
  ('Salmon', 2, 4.7),
  ('Salmon', 3, 5.7),
  ('Salmon', 4, 6.0),
  ('Salmon', 5, 10.0),
  ('Salmon', 6, 14.7),
  ('Chicken & Waffles', 0, 19.3),
  ('Chicken & Waffles', 1, 0.0),
  ('Chicken & Waffles', 2, 0.0),
  ('Chicken & Waffles', 3, 0.0),
  ('Chicken & Waffles', 4, 0.0),
  ('Chicken & Waffles', 5, 0.0),
  ('Chicken & Waffles', 6, 24.3),
  ('Red Snapper', 0, 9.0),
  ('Red Snapper', 1, 2.5),
  ('Red Snapper', 2, 2.3),
  ('Red Snapper', 3, 3.0),
  ('Red Snapper', 4, 3.7),
  ('Red Snapper', 5, 8.3),
  ('Red Snapper', 6, 13.3),
  ('Seafood Fusion Yassa', 0, 14.3),
  ('Seafood Fusion Yassa', 1, 3.8),
  ('Seafood Fusion Yassa', 2, 2.3),
  ('Seafood Fusion Yassa', 3, 2.0),
  ('Seafood Fusion Yassa', 4, 3.7),
  ('Seafood Fusion Yassa', 5, 6.3),
  ('Seafood Fusion Yassa', 6, 8.7),
  ('Fried Calamari', 0, 5.3),
  ('Fried Calamari', 1, 2.5),
  ('Fried Calamari', 2, 3.3),
  ('Fried Calamari', 3, 6.3),
  ('Fried Calamari', 4, 5.3),
  ('Fried Calamari', 5, 5.0),
  ('Fried Calamari', 6, 13.7),
  ('Lamb Dibi Skewers', 0, 6.0),
  ('Lamb Dibi Skewers', 1, 2.5),
  ('Lamb Dibi Skewers', 2, 4.7),
  ('Lamb Dibi Skewers', 3, 6.0),
  ('Lamb Dibi Skewers', 4, 4.0),
  ('Lamb Dibi Skewers', 5, 6.7),
  ('Lamb Dibi Skewers', 6, 9.0),
  ('Fried Plantains', 0, 2.3),
  ('Fried Plantains', 1, 4.5),
  ('Fried Plantains', 2, 2.7),
  ('Fried Plantains', 3, 4.7),
  ('Fried Plantains', 4, 7.7),
  ('Fried Plantains', 5, 6.7),
  ('Fried Plantains', 6, 8.7),
  ('Eggs Any Style', 0, 23.0),
  ('Eggs Any Style', 1, 0.0),
  ('Eggs Any Style', 2, 0.0),
  ('Eggs Any Style', 3, 0.0),
  ('Eggs Any Style', 4, 0.0),
  ('Eggs Any Style', 5, 0.0),
  ('Eggs Any Style', 6, 14.3),
  ('Garlic Shrimp', 0, 18.7),
  ('Garlic Shrimp', 1, 0.0),
  ('Garlic Shrimp', 2, 0.0),
  ('Garlic Shrimp', 3, 0.0),
  ('Garlic Shrimp', 4, 0.0),
  ('Garlic Shrimp', 5, 0.0),
  ('Garlic Shrimp', 6, 18.3),
  ('Chicken Dibi skewers', 0, 8.7),
  ('Chicken Dibi skewers', 1, 3.2),
  ('Chicken Dibi skewers', 2, 2.7),
  ('Chicken Dibi skewers', 3, 3.3),
  ('Chicken Dibi skewers', 4, 4.3),
  ('Chicken Dibi skewers', 5, 6.0),
  ('Chicken Dibi skewers', 6, 6.3),
  ('Garlic crab & Shrimp with corn and potatoes', 0, 14.3),
  ('Garlic crab & Shrimp with corn and potatoes', 1, 0.0),
  ('Garlic crab & Shrimp with corn and potatoes', 2, 0.0),
  ('Garlic crab & Shrimp with corn and potatoes', 3, 0.0),
  ('Garlic crab & Shrimp with corn and potatoes', 4, 0.0),
  ('Garlic crab & Shrimp with corn and potatoes', 5, 0.0),
  ('Garlic crab & Shrimp with corn and potatoes', 6, 20.7),
  ('Garlic Crab', 0, 14.7),
  ('Garlic Crab', 1, 0.0),
  ('Garlic Crab', 2, 0.0),
  ('Garlic Crab', 3, 0.0),
  ('Garlic Crab', 4, 0.0),
  ('Garlic Crab', 5, 0.0),
  ('Garlic Crab', 6, 10.7),
  ('Broccoli', 0, 8.0),
  ('Broccoli', 1, 2.2),
  ('Broccoli', 2, 2.3),
  ('Broccoli', 3, 1.7),
  ('Broccoli', 4, 2.7),
  ('Broccoli', 5, 3.0),
  ('Broccoli', 6, 3.7),
  ('Side Salad', 0, 7.7),
  ('Side Salad', 1, 0.8),
  ('Side Salad', 2, 2.3),
  ('Side Salad', 3, 3.0),
  ('Side Salad', 4, 3.3),
  ('Side Salad', 5, 2.0),
  ('Side Salad', 6, 2.7),
  ('White Rice', 0, 4.3),
  ('White Rice', 1, 0.2),
  ('White Rice', 2, 2.0),
  ('White Rice', 3, 3.0),
  ('White Rice', 4, 2.0),
  ('White Rice', 5, 4.7),
  ('White Rice', 6, 4.0),
  ('Lobster', 0, 2.7),
  ('Lobster', 1, 0.2),
  ('Lobster', 2, 2.3),
  ('Lobster', 3, 2.7),
  ('Lobster', 4, 2.3),
  ('Lobster', 5, 3.7),
  ('Lobster', 6, 4.0),
  ('Lobster Bites', 0, 4.7),
  ('Lobster Bites', 1, 0.0),
  ('Lobster Bites', 2, 0.0),
  ('Lobster Bites', 3, 0.0),
  ('Lobster Bites', 4, 0.0),
  ('Lobster Bites', 5, 0.0),
  ('Lobster Bites', 6, 13.3),
  ('Beef Burger', 0, 4.0),
  ('Beef Burger', 1, 1.2),
  ('Beef Burger', 2, 1.7),
  ('Beef Burger', 3, 0.7),
  ('Beef Burger', 4, 1.7),
  ('Beef Burger', 5, 5.0),
  ('Beef Burger', 6, 3.3),
  ('Extra Shrimp', 0, 4.7),
  ('Extra Shrimp', 1, 1.5),
  ('Extra Shrimp', 2, 0.3),
  ('Extra Shrimp', 3, 1.0),
  ('Extra Shrimp', 4, 2.0),
  ('Extra Shrimp', 5, 3.0),
  ('Extra Shrimp', 6, 4.0)
  ) as x(name, dow, qty)
  join public.dishes d on d.location_id = v_loc and d.name = x.name
  on conflict (dish_id, dow) do update set avg_qty = excluded.avg_qty;

  insert into public.ingredients (location_id, name, pack_label, pack_qty, pack_unit, vendor, note)
  select v_loc, x.name, x.label, x.qty, x.unit, x.vendor, x.note from (values
  ('Chicken wings (raw)', 'Case - 40 lb', 40.0, 'lb', 'US Foods', 'ASSUMED pack size - verify against order guide'),
  ('Lamb chops (raw)', 'Case - 20 lb', 20.0, 'lb', 'US Foods', 'ASSUMED - verify'),
  ('French fries (frozen)', 'Case - 6x5 lb (30 lb)', 30.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Shrimp 21/25 (raw)', 'Case - 5x2 lb (10 lb)', 10.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Rice (dry)', 'Bag - 25 lb', 25.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Pasta (dry)', 'Case - 20 lb', 20.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Salmon fillet (raw)', 'Case - 10 lb', 10.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Crab cakes (prepared)', 'Case - 24 ct', 24.0, 'each', 'US Foods', 'ASSUMED'),
  ('Beef sirloin (raw)', 'Case - 10 lb', 10.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Potatoes (fresh)', 'Bag - 50 lb', 50.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Plantains (fresh)', 'Case - 50 ct', 50.0, 'each', 'US Foods', 'ASSUMED'),
  ('Eggs', 'Case - 15 dz (180 ct)', 180.0, 'each', 'US Foods', 'ASSUMED'),
  ('Calamari (raw)', 'Case - 10 lb', 10.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Red snapper (whole)', 'Case - 10 lb', 10.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Tortillas', 'Case - 144 ct', 144.0, 'each', 'US Foods', 'ASSUMED'),
  ('Waffle mix', 'Bag - 25 lb', 25.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Wing sauce', 'Case - 4x1 gal (512 oz)', 512.0, 'oz', 'US Foods', 'ASSUMED'),
  ('Flour / breading', 'Bag - 25 lb', 25.0, 'lb', 'US Foods', 'ASSUMED'),
  ('Fry oil', 'Jug - 35 lb', 35.0, 'lb', 'US Foods', 'Consumable - order ~2/week baseline'),
  ('Butter', 'Case - 36x1 lb', 576.0, 'oz', 'US Foods', 'ASSUMED'),
  ('Tomato paste', 'Case - 6x #10 can', 660, 'oz', 'US Foods', 'ASSUMED'),
  ('Heavy cream', 'Case - 12x1 qt (384 oz)', 384.0, 'oz', 'US Foods', 'ASSUMED'),
  ('Cajun seasoning', 'Container - 24 oz', 24.0, 'oz', 'US Foods', 'ASSUMED'),
  ('Suya spice rub', 'House-made or bulk - 5 lb (80 oz)', 80.0, 'oz', 'Verify', 'House blend? Verify source'),
  ('Garlic butter', 'House-made - track butter', 16.0, 'oz', 'Verify', 'Roll into butter usage'),
  ('Cocktail sauce', 'Case - 4x0.5 gal (256 oz)', 256.0, 'oz', 'US Foods', 'ASSUMED'),
  ('Vegetable medley (frozen)', 'Case - 12x2 lb (24 lb)', 24.0, 'lb', 'US Foods', 'ASSUMED')
  ) as x(name, label, qty, unit, vendor, note)
  on conflict (location_id, name) do nothing;

  insert into public.recipe_map (dish_id, ingredient_id, qty_per_unit, unit, is_estimate, note)
  select d.id, i.id, x.qty, x.unit, x.est, x.note
  from (values
  ('Wings', 'Chicken wings (raw)', 0.22, 'lb', true, 'per wing | ESTIMATE ~3.5 oz per jumbo wing'),
  ('Wings', 'Flour / breading', 0.02, 'lb', true, 'per wing | ESTIMATE'),
  ('Wings', 'Wing sauce', 0.5, 'oz', true, 'per wing | ESTIMATE'),
  ('Lamb Chop', 'Lamb chops (raw)', 0.25, 'lb', true, 'per chop | ESTIMATE ~4 oz per chop'),
  ('Lamb Chop', 'Suya spice rub', 0.2, 'oz', true, 'per chop | ESTIMATE'),
  ('Wings and Fries', 'Chicken wings (raw)', 2.2, 'lb', false, 'CONFIRMED per order | CONFIRMED 10 wings per combo (Jarrod 7/6/26)'),
  ('Wings and Fries', 'Wing sauce', 5.0, 'oz', true, 'per order | ESTIMATE scaled to 10 wings'),
  ('Wings and Fries', 'French fries (frozen)', 0.38, 'lb', true, 'per order | ESTIMATE ~6 oz'),
  ('French Fries', 'French fries (frozen)', 0.38, 'lb', true, 'per order | ESTIMATE ~6 oz side'),
  ('Shrimp Basket', 'Shrimp 21/25 (raw)', 0.38, 'lb', true, 'per order | ESTIMATE ~6 oz'),
  ('Shrimp Basket', 'French fries (frozen)', 0.25, 'lb', true, 'per order | ESTIMATE ~4 oz'),
  ('Shrimp Basket', 'Cocktail sauce', 1.0, 'oz', true, 'per order | ESTIMATE'),
  ('Jollof Rice', 'Rice (dry)', 0.16, 'lb', true, 'per order | ESTIMATE ~2.5 oz dry = 6 oz cooked'),
  ('Jollof Rice', 'Tomato paste', 0.5, 'oz', true, 'per order | ESTIMATE'),
  ('Garlic Mashed Potatoes', 'Potatoes (fresh)', 0.38, 'lb', true, 'per order | ESTIMATE ~6 oz'),
  ('Garlic Mashed Potatoes', 'Butter', 0.5, 'oz', true, 'per order | ESTIMATE'),
  ('Cajun Jollof Pasta', 'Pasta (dry)', 0.25, 'lb', true, 'per order | ESTIMATE ~4 oz dry'),
  ('Cajun Jollof Pasta', 'Shrimp 21/25 (raw)', 0.19, 'lb', true, 'per order | ESTIMATE ~3 oz - VERIFY protein mix'),
  ('Cajun Jollof Pasta', 'Heavy cream', 3.0, 'oz', true, 'per order | ESTIMATE'),
  ('Cajun Jollof Pasta', 'Cajun seasoning', 0.2, 'oz', true, 'per order | ESTIMATE'),
  ('Lamb Chop Meal', 'Lamb chops (raw)', 1.0, 'lb', false, 'CONFIRMED per order | CONFIRMED 4 chops per meal (Jarrod 7/6/26)'),
  ('Lamb Chop Meal', 'Rice (dry)', 0.16, 'lb', true, 'per order | ASSUMED jollof default side - side mix still to verify'),
  ('Crab Cake', 'Crab cakes (prepared)', 1.0, 'each', true, 'per order | ESTIMATE 1x 4oz cake - VERIFY count'),
  ('Beef Suya', 'Beef sirloin (raw)', 0.38, 'lb', true, 'per order | ESTIMATE ~6 oz'),
  ('Beef Suya', 'Suya spice rub', 0.3, 'oz', true, 'per order | ESTIMATE'),
  ('Salmon Bites', 'Salmon fillet (raw)', 0.31, 'lb', true, 'per order | ESTIMATE ~5 oz'),
  ('Salmon Bites', 'Flour / breading', 0.03, 'lb', true, 'per order | ESTIMATE'),
  ('Calamari', 'Calamari (raw)', 0.31, 'lb', true, 'per order | ESTIMATE ~5 oz - covers Fried Calamari too'),
  ('Fried Calamari', 'Calamari (raw)', 0.31, 'lb', true, 'mirrors Calamari row | ESTIMATE ~5 oz - covers Fried Calamari too'),
  ('Calamari', 'Flour / breading', 0.06, 'lb', true, 'per order | ESTIMATE'),
  ('Fried Calamari', 'Flour / breading', 0.06, 'lb', true, 'mirrors Calamari row | ESTIMATE'),
  ('Fusion Tacos', 'Tortillas', 2.0, 'each', true, 'per order | 2 tacos per order per menu'),
  ('Fusion Tacos', 'Beef sirloin (raw)', 0.25, 'lb', true, 'per order | ESTIMATE ~4 oz - VERIFY protein'),
  ('Salmon', 'Salmon fillet (raw)', 0.44, 'lb', true, 'per order | ESTIMATE ~7 oz entree fillet'),
  ('Chicken & Waffles', 'Chicken wings (raw)', 0.66, 'lb', true, 'per order | ASSUMED 3 wings - VERIFY'),
  ('Chicken & Waffles', 'Waffle mix', 0.25, 'lb', true, 'per order | ESTIMATE'),
  ('Red Snapper', 'Red snapper (whole)', 1.25, 'lb', true, 'per order | ESTIMATE whole fish - VERIFY size'),
  ('Mixed Vegetables', 'Vegetable medley (frozen)', 0.25, 'lb', true, 'per order | ESTIMATE ~4 oz'),
  ('Fried Plantains', 'Plantains (fresh)', 1.0, 'each', true, 'per order | ESTIMATE'),
  ('Eggs Any Style', 'Eggs', 2.0, 'each', true, 'per order | ESTIMATE'),
  ('Garlic Shrimp', 'Shrimp 21/25 (raw)', 0.38, 'lb', true, 'per order | ESTIMATE ~6 oz'),
  ('Garlic Shrimp', 'Garlic butter', 1.0, 'oz', true, 'per order | ESTIMATE')
  ) as x(dish, ing, qty, unit, est, note)
  join public.dishes d on d.location_id = v_loc and d.name = x.dish
  join public.ingredients i on i.location_id = v_loc and i.name = x.ing
  on conflict (dish_id, ingredient_id) do nothing;

  -- Fry oil: 3 double fryers (6 vats), changed ~twice a week. ASSUMED 6 jugs
  -- per change on Mon + Thu until the kitchen corrects it.
  insert into public.standing_order_rules (location_id, ingredient_id, dows, packs, note)
  select v_loc, i.id, array[1,4]::smallint[], 6,
         'Fryer oil baseline — 3 double fryers, ASSUMED 6 jugs per change Mon & Thu'
  from public.ingredients i
  where i.location_id = v_loc and i.name = 'Fry oil'
    and not exists (select 1 from public.standing_order_rules r where r.location_id = v_loc and r.ingredient_id = i.id);
end $seed$;
