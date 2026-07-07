-- 39 — Order guide: Saturday covers Sunday + vendor separation demo.
--
-- No deliveries on Sunday and Depot runs should be the exception, so the
-- Saturday guide (ordered Friday) forecasts SATURDAY + SUNDAY demand
-- combined. order_guides.covers_through records the span; the Sunday view
-- becomes a top-up-only Depot list.
--
-- Vendor separation (POC): the page groups lines by ingredients.vendor.
-- Seafood moves to Sysco purely to demonstrate the split — Jarrod maps the
-- real vendor assignments later by editing ingredients.vendor.

alter table public.order_guides add column if not exists covers_through date;
update public.order_guides set covers_through = target_date where covers_through is null;

-- illustrative Sysco assignment (ATL seafood)
update public.ingredients
   set vendor = 'Sysco'
 where name in ('Shrimp 21/25 (raw)', 'Salmon fillet (raw)', 'Red snapper (whole)', 'Calamari (raw)', 'Crab cakes (prepared)')
   and location_id in (select id from public.locations where upper(code) = 'ATL');

create or replace function public.generate_order_guide(p_location_id uuid, p_target date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_guide uuid;
  v_buffer numeric := 0.25;
  -- Saturday guides cover Sunday too (no Sunday deliveries; minimize Depot)
  v_end date := case when extract(dow from p_target)::int = 6 then p_target + 1 else p_target end;
begin
  if not public.can_access_location(p_location_id) then
    raise exception 'not authorized for this location';
  end if;

  select id into v_guide from order_guides
   where location_id = p_location_id and target_date = p_target and status <> 'draft';
  if v_guide is not null then
    return v_guide;
  end if;

  delete from order_guides where location_id = p_location_id and target_date = p_target;
  insert into order_guides (location_id, target_date, covers_through, buffer_pct)
  values (p_location_id, p_target, v_end, v_buffer)
  returning id into v_guide;

  with days as (
    select extract(dow from d)::int as dow
    from generate_series(p_target, v_end, interval '1 day') d
  ),
  live as (
    -- rolling same-DOW average from the Toast pull, per covered DOW
    select d.id as dish_id, dd.dow, avg(q.day_qty) as avg_qty, count(*) as n
    from dishes d
    cross join (select distinct dow from days) dd
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
    where d.location_id = p_location_id
    group by d.id, dd.dow
  ),
  fc as (
    -- summed across every covered day (Sat guide = Sat + Sun demand)
    select d.id as dish_id,
           sum(case when l.n >= 3 then l.avg_qty else coalesce(f.avg_qty, 0) end) as qty
    from dishes d
    join days dd on true
    left join dish_forecast f on f.dish_id = d.id and f.dow = dd.dow
    left join live l on l.dish_id = d.id and l.dow = dd.dow
    where d.location_id = p_location_id
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

  -- standing consumables fire if any covered day matches their DOWs
  insert into order_guide_lines (order_guide_id, ingredient_id, forecast_need, buffer_pct, suggested_packs, adjusted_packs, is_estimate, note)
  select v_guide, r.ingredient_id, null, 0, r.packs, r.packs, false, r.note
  from standing_order_rules r
  where r.location_id = p_location_id
    and exists (
      select 1 from generate_series(p_target, v_end, interval '1 day') d
      where extract(dow from d)::int = any(r.dows)
    );

  return v_guide;
end $$;

revoke all on function public.generate_order_guide(uuid, date) from public, anon;
grant execute on function public.generate_order_guide(uuid, date) to authenticated;
