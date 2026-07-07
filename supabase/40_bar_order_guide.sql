-- 40 — Bar Order Guide: departments, vendor delivery schedules, bar catalog.
--
-- Inventory departments share one engine: dishes/ingredients/order_guides
-- gain a `department` ('kitchen' | 'bar' | 'hookah'). Bar cadence is weekly
-- per distributor: Georgia Crown + Empire order Wed 3 PM -> deliver Thu;
-- Republic National order Thu 3 PM -> deliver Fri (vendor_schedules). A bar
-- guide for a delivery day covers 7 days and includes only the vendors that
-- deliver that day. Bar forecasts run fully live (8 weeks of Toast history;
-- no seed needed). House pours: El Capitan Silver (blanco) / Gold (repo),
-- CONFIRMED by Jarrod. 750ml bottles except Titos 1L; brand->vendor
-- assignments are ASSUMED pending invoice verification.

alter table public.dishes add column if not exists department text not null default 'kitchen';
alter table public.ingredients add column if not exists department text not null default 'kitchen';
alter table public.order_guides add column if not exists department text not null default 'kitchen';
alter table public.standing_order_rules add column if not exists department text not null default 'kitchen';

alter table public.dishes drop constraint if exists dishes_location_id_name_key;
alter table public.dishes add constraint dishes_loc_dept_name_key unique (location_id, department, name);
alter table public.ingredients drop constraint if exists ingredients_location_id_name_key;
alter table public.ingredients add constraint ingredients_loc_dept_name_key unique (location_id, department, name);
alter table public.order_guides drop constraint if exists order_guides_location_id_target_date_key;
alter table public.order_guides add constraint order_guides_loc_dept_date_key unique (location_id, department, target_date);

create table if not exists public.vendor_schedules (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations(id) on delete cascade,
  department   text not null default 'bar',
  vendor       text not null,
  order_dow    smallint not null,      -- Postgres DOW of the order cutoff day
  order_cutoff time not null,          -- local (ET) cutoff time
  delivery_dow smallint not null,
  note         text,
  unique (location_id, department, vendor)
);
alter table public.vendor_schedules enable row level security;
drop policy if exists vsch_sel on public.vendor_schedules;
create policy vsch_sel on public.vendor_schedules for select using (public.can_access_location(location_id));

-- canonicalization: also strip "<DAY> ONLY" suffixes and collapse whitespace
create or replace function public.canonical_dish_name(t text)
returns text language sql immutable as $fn$
  select lower(btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(t, ''), '^\s*HH\s+', '', 'i'),
        '\s*-\s*MIN\s*\d+\s*$', '', 'i'),
      '\s+(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s+ONLY\s*$', '', 'i'),
    '\s+', ' ', 'g')))
$fn$;

drop function if exists public.generate_order_guide(uuid, date);

create or replace function public.generate_order_guide(p_location_id uuid, p_target date, p_department text default 'kitchen')
returns uuid
language plpgsql security definer set search_path = public as $fn$
declare
  v_guide uuid;
  v_buffer numeric := 0.25;
  v_dow int := extract(dow from p_target)::int;
  v_end date;
begin
  if not public.can_access_location(p_location_id) then
    raise exception 'not authorized for this location';
  end if;

  -- coverage window: bar guides cover a week (weekly distributor cadence);
  -- kitchen Saturday covers Sunday (no Sunday deliveries)
  v_end := case
    when p_department = 'bar' then p_target + 6
    when v_dow = 6 then p_target + 1
    else p_target
  end;

  select id into v_guide from order_guides
   where location_id = p_location_id and department = p_department
     and target_date = p_target and status <> 'draft';
  if v_guide is not null then
    return v_guide;
  end if;

  delete from order_guides
   where location_id = p_location_id and department = p_department and target_date = p_target;
  insert into order_guides (location_id, department, target_date, covers_through, buffer_pct)
  values (p_location_id, p_department, p_target, v_end, v_buffer)
  returning id into v_guide;

  with days as (
    select extract(dow from d)::int as dow, count(*) as n_days
    from generate_series(p_target, v_end, interval '1 day') d
    group by 1
  ),
  live as (
    select d.id as dish_id, dd.dow, avg(q.day_qty) as avg_qty, count(*) as n
    from dishes d
    cross join (select dow from days) dd
    join lateral (
      select dmi.business_date, sum(dmi.quantity) as day_qty
      from daily_menu_items dmi
      where dmi.location_id = d.location_id
        and public.canonical_dish_name(dmi.item_name) = public.canonical_dish_name(d.name)
        and extract(dow from dmi.business_date)::int = dd.dow
        and dmi.business_date >= p_target - 60
        and dmi.business_date < p_target
      group by dmi.business_date
      order by dmi.business_date desc
      limit 6
    ) q on true
    where d.location_id = p_location_id and d.department = p_department
    group by d.id, dd.dow
  ),
  fc as (
    select d.id as dish_id,
           sum(dd.n_days * (case when l.n >= 3 then l.avg_qty else coalesce(f.avg_qty, 0) end)) as qty
    from dishes d
    join days dd on true
    left join dish_forecast f on f.dish_id = d.id and f.dow = dd.dow
    left join live l on l.dish_id = d.id and l.dow = dd.dow
    where d.location_id = p_location_id and d.department = p_department
    group by d.id
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
      and i.department = p_department
      -- bar guides only include vendors delivering on the target day
      and (p_department <> 'bar' or exists (
        select 1 from vendor_schedules vs
        where vs.location_id = p_location_id and vs.department = 'bar'
          and vs.vendor = i.vendor and vs.delivery_dow = v_dow
      ))
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

  insert into order_guide_lines (order_guide_id, ingredient_id, forecast_need, buffer_pct, suggested_packs, adjusted_packs, is_estimate, note)
  select v_guide, r.ingredient_id, null, 0, r.packs, r.packs, false, r.note
  from standing_order_rules r
  where r.location_id = p_location_id and r.department = p_department
    and exists (
      select 1 from generate_series(p_target, v_end, interval '1 day') d
      where extract(dow from d)::int = any(r.dows)
    );

  return v_guide;
end $fn$;

revoke all on function public.generate_order_guide(uuid, date, text) from public, anon;
grant execute on function public.generate_order_guide(uuid, date, text) to authenticated;

-- ===== ATL bar seed (drinks from live Toast top sellers; pours estimated) =====
do $seed$
declare v_loc uuid;
begin
  select id into v_loc from public.locations where upper(code) = 'ATL' limit 1;

  insert into public.vendor_schedules (location_id, department, vendor, order_dow, order_cutoff, delivery_dow, note)
  values
    (v_loc, 'bar', 'Georgia Crown', 3, '15:00', 4, 'Order Wed 3pm ET, delivers Thursday'),
    (v_loc, 'bar', 'Empire', 3, '15:00', 4, 'Order Wed 3pm ET, delivers Thursday'),
    (v_loc, 'bar', 'Republic National', 4, '15:00', 5, 'Order Thu 3pm ET, delivers Friday')
  on conflict (location_id, department, vendor) do nothing;

  insert into public.dishes (location_id, department, name, count_basis)
  select v_loc, 'bar', x.name, 'order' from (values
  ('Bacardi Silver'),
  ('Bottomless Mimosa'),
  ('Casamigos Blanco'),
  ('Casamigos Repo'),
  ('Champagne'),
  ('Corona'),
  ('Crown Apple'),
  ('Crown Regular'),
  ('Don Julio Anejo'),
  ('Don Julio Blanco'),
  ('Don Julio Repo'),
  ('Don Repo - Bottle'),
  ('Dusse'),
  ('Dusse - Bottle'),
  ('Dusse Shot'),
  ('Grey Goose'),
  ('Heineken'),
  ('Hendricks'),
  ('Hennessey - Bottle'),
  ('Hennesy'),
  ('Herradura Repo'),
  ('House Blanco'),
  ('House Blanco - Bottle'),
  ('House Blanco Shot'),
  ('House Repo'),
  ('House Repo - Bottle'),
  ('House Repo Shot'),
  ('Jack Daniels Tennessee Whiskey'),
  ('Jameson'),
  ('Kora Breeze'),
  ('Lit Mix - Bottle'),
  ('Lobos Joven'),
  ('Lobos Repo'),
  ('Lobos Repo - Bottle'),
  ('Long Island'),
  ('Mandingo Mist'),
  ('Margarita'),
  ('Margarita Mix - Bottle'),
  ('Mimosa Refill'),
  ('Modelo'),
  ('Nubian Lemon Drop'),
  ('Patron Repo'),
  ('Patron Silver'),
  ('Patron Silver - Bottle'),
  ('Remy VSOP'),
  ('Safari Margarita'),
  ('Sahara Dream'),
  ('Savana Rum Punch'),
  ('Teramana Repo - Bottle'),
  ('Teremana Blanco'),
  ('Teremana Repo'),
  ('Titos'),
  ('Titos - Bottle'),
  ('Triple Sec - Bottle'),
  ('Tropical Mimosa')
  ) as x(name)
  on conflict (location_id, department, name) do nothing;

  insert into public.ingredients (location_id, department, name, pack_label, pack_qty, pack_unit, vendor, note)
  select v_loc, 'bar', x.name, x.label, x.qty, x.unit, x.vendor, x.note from (values
  ('El Capitan Silver', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'CONFIRMED house blanco (Jarrod 7/7/26) - vendor ASSUMED'),
  ('El Capitan Gold', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'CONFIRMED house repo (Jarrod 7/7/26) - vendor ASSUMED'),
  ('Patron Silver', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Patron Reposado', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Dusse VSOP', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Hennessy VS', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Jack Daniels', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Jameson', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Bacardi Silver', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Remy Martin VSOP', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Lobos 1707 Reposado', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Lobos 1707 Joven', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Herradura Reposado', 'Bottle - 750ml', 25.4, 'oz', 'Georgia Crown', 'ASSUMED vendor + 750ml'),
  ('Don Julio Reposado', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Don Julio Blanco', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Don Julio Anejo', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Casamigos Reposado', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Casamigos Blanco', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Teremana Reposado', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Teremana Blanco', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Crown Royal', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Crown Royal Apple', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Titos', 'Bottle - 1L', 33.8, 'oz', 'Republic National', 'CONFIRMED 1L (Jarrod 7/7/26) - vendor ASSUMED'),
  ('Grey Goose', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Hendricks Gin', 'Bottle - 750ml', 25.4, 'oz', 'Republic National', 'ASSUMED vendor + 750ml'),
  ('Corona', 'Case - 24 ct', 24, 'each', 'Empire', 'ASSUMED vendor + case pack'),
  ('Modelo', 'Case - 24 ct', 24, 'each', 'Empire', 'ASSUMED vendor + case pack'),
  ('Heineken', 'Case - 24 ct', 24, 'each', 'Empire', 'ASSUMED vendor + case pack'),
  ('Prosecco (mimosa)', 'Case - 12 x 750ml', 304.8, 'oz', 'Empire', 'ASSUMED vendor + case pack'),
  ('Margarita mix', 'Bottle - 1L', 33.8, 'oz', 'Empire', 'ASSUMED vendor - may belong on US Foods order'),
  ('Triple sec', 'Bottle - 750ml', 25.4, 'oz', 'Empire', 'ASSUMED vendor'),
  ('Lemon drop mix', 'Bottle - 1L', 33.8, 'oz', 'Empire', 'ASSUMED vendor'),
  ('LIT mix', 'Bottle - 1L', 33.8, 'oz', 'Empire', 'ASSUMED vendor')
  ) as x(name, label, qty, unit, vendor, note)
  on conflict (location_id, department, name) do nothing;

  insert into public.recipe_map (dish_id, ingredient_id, qty_per_unit, unit, is_estimate, note)
  select d.id, i.id, x.qty, x.unit, x.est, x.note
  from (values
  ('House Repo Shot', 'El Capitan Gold', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('House Repo', 'El Capitan Gold', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('House Repo - Bottle', 'El Capitan Gold', 25.4, 'oz', false, 'Bottle service - exact depletion'),
  ('House Blanco Shot', 'El Capitan Silver', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('House Blanco', 'El Capitan Silver', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('House Blanco - Bottle', 'El Capitan Silver', 25.4, 'oz', false, 'Bottle service - exact depletion'),
  ('Margarita', 'El Capitan Silver', 2.0, 'oz', true, 'ESTIMATE 2 oz house marg base'),
  ('Margarita', 'Triple sec', 0.75, 'oz', true, 'ESTIMATE standard pour'),
  ('Margarita', 'Margarita mix', 3, 'oz', true, 'ESTIMATE standard pour'),
  ('Safari Margarita', 'El Capitan Silver', 2.0, 'oz', true, 'ESTIMATE - flavored marg, same base'),
  ('Safari Margarita', 'Margarita mix', 3, 'oz', true, 'ESTIMATE standard pour'),
  ('Don Julio Repo', 'Don Julio Reposado', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Don Repo - Bottle', 'Don Julio Reposado', 25.4, 'oz', false, 'Bottle service - exact depletion'),
  ('Don Julio Blanco', 'Don Julio Blanco', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Don Julio Anejo', 'Don Julio Anejo', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Teremana Repo', 'Teremana Reposado', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Teramana Repo - Bottle', 'Teremana Reposado', 25.4, 'oz', false, 'Bottle service - exact depletion'),
  ('Teremana Blanco', 'Teremana Blanco', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Lobos Repo', 'Lobos 1707 Reposado', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Lobos Repo - Bottle', 'Lobos 1707 Reposado', 25.4, 'oz', false, 'Bottle service - exact depletion'),
  ('Lobos Joven', 'Lobos 1707 Joven', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Titos', 'Titos', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Titos - Bottle', 'Titos', 33.8, 'oz', false, 'Bottle service - exact depletion'),
  ('Hennesy', 'Hennessy VS', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Hennessey - Bottle', 'Hennessy VS', 25.4, 'oz', false, 'Bottle service - exact depletion'),
  ('Dusse', 'Dusse VSOP', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Dusse Shot', 'Dusse VSOP', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Dusse - Bottle', 'Dusse VSOP', 25.4, 'oz', false, 'Bottle service - exact depletion'),
  ('Patron Silver', 'Patron Silver', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Patron Silver - Bottle', 'Patron Silver', 25.4, 'oz', false, 'Bottle service - exact depletion'),
  ('Patron Repo', 'Patron Reposado', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Casamigos Repo', 'Casamigos Reposado', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Casamigos Blanco', 'Casamigos Blanco', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Jameson', 'Jameson', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Jack Daniels Tennessee Whiskey', 'Jack Daniels', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Crown Regular', 'Crown Royal', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Crown Apple', 'Crown Royal Apple', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Herradura Repo', 'Herradura Reposado', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Hendricks', 'Hendricks Gin', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Grey Goose', 'Grey Goose', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Bacardi Silver', 'Bacardi Silver', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Remy VSOP', 'Remy Martin VSOP', 1.5, 'oz', true, 'ESTIMATE 1.5 oz shot'),
  ('Nubian Lemon Drop', 'Titos', 2.0, 'oz', true, 'ESTIMATE vodka base - VERIFY spec'),
  ('Nubian Lemon Drop', 'Lemon drop mix', 2, 'oz', true, 'ESTIMATE standard pour'),
  ('Long Island', 'Titos', 0.5, 'oz', true, 'ESTIMATE LIT split - VERIFY spec'),
  ('Long Island', 'Bacardi Silver', 0.5, 'oz', true, 'ESTIMATE LIT split - VERIFY spec'),
  ('Long Island', 'Hendricks Gin', 0.5, 'oz', true, 'ESTIMATE LIT split - VERIFY spec'),
  ('Long Island', 'El Capitan Silver', 0.5, 'oz', true, 'ESTIMATE LIT split - VERIFY spec'),
  ('Long Island', 'Triple sec', 0.5, 'oz', true, 'ESTIMATE LIT split - VERIFY spec'),
  ('Long Island', 'LIT mix', 2, 'oz', true, 'ESTIMATE standard pour'),
  ('Savana Rum Punch', 'Bacardi Silver', 2.0, 'oz', true, 'ESTIMATE rum base - VERIFY spec'),
  ('Kora Breeze', 'Grey Goose', 2.0, 'oz', true, 'ESTIMATE vodka base - VERIFY spec'),
  ('Mandingo Mist', 'Grey Goose', 2.0, 'oz', true, 'ESTIMATE vodka base - VERIFY spec'),
  ('Sahara Dream', 'El Capitan Silver', 2.0, 'oz', true, 'ESTIMATE tequila base - VERIFY spec'),
  ('Bottomless Mimosa', 'Prosecco (mimosa)', 10, 'oz', true, 'ESTIMATE ~2 glasses per seat'),
  ('Mimosa Refill', 'Prosecco (mimosa)', 5, 'oz', true, 'ESTIMATE 5 oz pour'),
  ('Tropical Mimosa', 'Prosecco (mimosa)', 5, 'oz', true, 'ESTIMATE 5 oz pour'),
  ('Champagne', 'Prosecco (mimosa)', 5, 'oz', true, 'ESTIMATE glass pour'),
  ('Corona', 'Corona', 1, 'each', false, 'One bottle per sale - exact'),
  ('Modelo', 'Modelo', 1, 'each', false, 'One bottle per sale - exact'),
  ('Heineken', 'Heineken', 1, 'each', false, 'One bottle per sale - exact'),
  ('Margarita Mix - Bottle', 'Margarita mix', 33.8, 'oz', false, 'Sold as bottle - exact'),
  ('Triple Sec - Bottle', 'Triple sec', 25.4, 'oz', false, 'Sold as bottle - exact'),
  ('Lit Mix - Bottle', 'LIT mix', 33.8, 'oz', false, 'Sold as bottle - exact')
  ) as x(dish, ing, qty, unit, est, note)
  join public.dishes d on d.location_id = v_loc and d.department = 'bar' and d.name = x.dish
  join public.ingredients i on i.location_id = v_loc and i.department = 'bar' and i.name = x.ing
  on conflict (dish_id, ingredient_id) do nothing;
end $seed$;
