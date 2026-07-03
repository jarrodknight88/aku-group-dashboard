-- 25 — Vendor / category / alias seed, derived from the Afro District 2026
-- workbook (Vendor Map + Category Definition + Monthly Bills) and every raw
-- vendor spelling across all locations in the Invoice Intake sheet.

-- ---------- categories: the workbook's 5-group taxonomy ----------
insert into public.expense_categories (name, grp, sort_order) values ('Rent / Occupancy', 'Operations & Facility', 10)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Utilities', 'Operations & Facility', 20)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Security Services', 'Operations & Facility', 30)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Facility & Maintenance', 'Operations & Facility', 40)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('HVAC', 'Operations & Facility', 50)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Plumbing', 'Operations & Facility', 60)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Construction', 'Operations & Facility', 70)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Waste Management', 'Operations & Facility', 80)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Cleaning Supplies', 'Operations & Facility', 90)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Food Supplies', 'Inventory & COGS', 100)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Alcohol & Beverage', 'Inventory & COGS', 110)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Dry Goods', 'Inventory & COGS', 120)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Hookah Supplies', 'Inventory & COGS', 130)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Bar Supplies', 'Inventory & COGS', 140)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Payroll', 'Labor & Professional', 150)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Marketing', 'Labor & Professional', 160)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Tax', 'Labor & Professional', 170)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('POS Systems', 'Tech & Equipment', 180)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Seating Systems', 'Tech & Equipment', 190)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Equipment', 'Tech & Equipment', 200)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Office Supplies', 'Tech & Equipment', 210)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Transportation', 'Logistics & Misc', 220)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Loss / Waste', 'Logistics & Misc', 230)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;
insert into public.expense_categories (name, grp, sort_order) values ('Other', 'Logistics & Misc', 240)
  on conflict (name) do update set grp = excluded.grp, sort_order = excluded.sort_order;

-- retire the prototype starter categories: repoint their keywords, then delete
update public.expense_category_keywords set category_id = (select id from public.expense_categories where name = 'Food Supplies')
  where category_id = (select id from public.expense_categories where name = 'COGS – Food');
update public.expense_category_keywords set category_id = (select id from public.expense_categories where name = 'Alcohol & Beverage')
  where category_id = (select id from public.expense_categories where name = 'COGS – Liquor');
update public.expense_category_keywords set category_id = (select id from public.expense_categories where name = 'Rent / Occupancy')
  where category_id = (select id from public.expense_categories where name = 'Rent');
update public.expense_category_keywords set category_id = (select id from public.expense_categories where name = 'Facility & Maintenance')
  where category_id = (select id from public.expense_categories where name = 'Repairs & Maintenance');
update public.expense_category_keywords set category_id = (select id from public.expense_categories where name = 'Payroll')
  where category_id = (select id from public.expense_categories where name = 'Payroll Services');
update public.expense_category_keywords set category_id = (select id from public.expense_categories where name = 'Dry Goods')
  where category_id = (select id from public.expense_categories where name = 'Supplies');
delete from public.expense_categories where name in ('COGS – Food', 'COGS – Liquor', 'Rent', 'Repairs & Maintenance', 'Payroll Services', 'Supplies');
update public.expense_categories set grp = 'Logistics & Misc' where grp is null;

-- ---------- canonical vendors ----------
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Restaurant Depot', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('US Foods', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('King Ola Distributions', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Village Ice', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Zippy Ice', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Sysco', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Cheney Brothers', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Sam''s Club', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Walmart', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Kroger', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Publix', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Costco', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Aldi', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Harris Teeter', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Food Lion', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('H Mart', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('City Farmers Market', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Charlotte Market', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Grocery (generic)', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('El Progreso Supermarket', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Food Depot', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Golden Waffles', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Gordon Food Service', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Tropical Market', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('New Bismalah Supermarket', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Sanwa Produce Atlanta', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('SuperSource', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Starbucks', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Dunkin''', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Cedarland Rest & Grocery', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Chef Store', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Touba International', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Carolina Cooks', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Performance Food Group', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('7-Eleven', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Brave', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('BR Club', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Acme Studios', (select id from public.expense_categories where name = 'Food Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('ABC Spirits', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Empire Distributors', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Georgia Crown', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Diamond Distributors', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Republic National', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Savannah Distributing', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Total Wine', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Tower Beer, Wine & Spirits', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('United Distributors', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('United Carolina Beverages', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Slang', (select id from public.expense_categories where name = 'Alcohol & Beverage'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Blaze N Puff', (select id from public.expense_categories where name = 'Hookah Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Kurt Hookah Wholesale', (select id from public.expense_categories where name = 'Hookah Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('2030 Smoke Shop', (select id from public.expense_categories where name = 'Hookah Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Hookah (generic)', (select id from public.expense_categories where name = 'Hookah Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('New Carbon Co', (select id from public.expense_categories where name = 'Hookah Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('CVS', (select id from public.expense_categories where name = 'Dry Goods'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Dollar General', (select id from public.expense_categories where name = 'Dry Goods'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Dollar Tree', (select id from public.expense_categories where name = 'Dry Goods'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Family Dollar', (select id from public.expense_categories where name = 'Dry Goods'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Target', (select id from public.expense_categories where name = 'Dry Goods'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Ed''s Supply Co', (select id from public.expense_categories where name = 'Dry Goods'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Sonoco', (select id from public.expense_categories where name = 'Dry Goods'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Roberts Oxygen Company', (select id from public.expense_categories where name = 'Bar Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Property Rent', (select id from public.expense_categories where name = 'Rent / Occupancy'), true, null, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Standard Ops Associates LLC', (select id from public.expense_categories where name = 'Rent / Occupancy'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Presidential Parkway Atlanta', (select id from public.expense_categories where name = 'Rent / Occupancy'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Georgia Power', (select id from public.expense_categories where name = 'Utilities'), true, null, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Scana Energy Natural Gas', (select id from public.expense_categories where name = 'Utilities'), true, null, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('DeKalb County Water', (select id from public.expense_categories where name = 'Utilities'), true, null, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Watershed Management', (select id from public.expense_categories where name = 'Utilities'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Comcast Business', (select id from public.expense_categories where name = 'Utilities'), true, null, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Phone (generic)', (select id from public.expense_categories where name = 'Utilities'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Brookhaven Police Department', (select id from public.expense_categories where name = 'Security Services'), true, 2100, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Home Depot', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Lowe''s', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Ace Hardware', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Little Hardware Co', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Like New Hoods', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Pristine Hood Vent', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Harbor Freight', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Super Sod', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Mike Contractor', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Clairmont', (select id from public.expense_categories where name = 'Facility & Maintenance'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Extra Space Storage', (select id from public.expense_categories where name = 'Facility & Maintenance'), true, 165, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Apex Environmental Services', (select id from public.expense_categories where name = 'Waste Management'), true, 300, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Affordable Dumpster LLC', (select id from public.expense_categories where name = 'Waste Management'), true, 979, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('All in One HVAC LLC', (select id from public.expense_categories where name = 'HVAC'), true, 396, 'as_needed')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Plumbing Works', (select id from public.expense_categories where name = 'Plumbing'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Cintas', (select id from public.expense_categories where name = 'Cleaning Supplies'), true, 500, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Mr. Curtis Cleaning Crew', (select id from public.expense_categories where name = 'Cleaning Supplies'), true, 1400, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Payroll – Labor & Wages', (select id from public.expense_categories where name = 'Payroll'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Payroll Processing Fee', (select id from public.expense_categories where name = 'Payroll'), true, 32, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Marketing & Promotion', (select id from public.expense_categories where name = 'Marketing'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Custom Tee Shirts', (select id from public.expense_categories where name = 'Marketing'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('GA Sales Tax', (select id from public.expense_categories where name = 'Tax'), true, 26107.81, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Brookhaven Sales Tax', (select id from public.expense_categories where name = 'Tax'), true, 272.11, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Training Institute for Responsible Vendors', (select id from public.expense_categories where name = 'Tax'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Toast Inc. (POS)', (select id from public.expense_categories where name = 'POS Systems'), true, 895, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Toast Chargeback', (select id from public.expense_categories where name = 'Loss / Waste'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Software (generic)', (select id from public.expense_categories where name = 'POS Systems'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('OpenTable', (select id from public.expense_categories where name = 'Seating Systems'), true, 914, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Restaurant Equipment Merchandise', (select id from public.expense_categories where name = 'Equipment'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Best Buy', (select id from public.expense_categories where name = 'Equipment'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('BatteriesPlus', (select id from public.expense_categories where name = 'Equipment'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Battery Service and Supply', (select id from public.expense_categories where name = 'Equipment'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Micro Center', (select id from public.expense_categories where name = 'Equipment'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('A City Discount', (select id from public.expense_categories where name = 'Equipment'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('A1 Restaurant Furniture Inc', (select id from public.expense_categories where name = 'Equipment'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Office Depot', (select id from public.expense_categories where name = 'Office Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('OfficeMax', (select id from public.expense_categories where name = 'Office Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Staples', (select id from public.expense_categories where name = 'Office Supplies'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Gas Station (generic)', (select id from public.expense_categories where name = 'Transportation'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('QuikTrip', (select id from public.expense_categories where name = 'Transportation'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Shell', (select id from public.expense_categories where name = 'Transportation'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Exxon', (select id from public.expense_categories where name = 'Transportation'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Atlanta BP', (select id from public.expense_categories where name = 'Transportation'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Road Runner', (select id from public.expense_categories where name = 'Transportation'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Express Oil', (select id from public.expense_categories where name = 'Transportation'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('AutoZone', (select id from public.expense_categories where name = 'Transportation'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('U-Haul', (select id from public.expense_categories where name = 'Transportation'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('Van, Insurance and Fuel', (select id from public.expense_categories where name = 'Transportation'), true, 1546.99, 'monthly')
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('1% Voids, Comps & Discount', (select id from public.expense_categories where name = 'Loss / Waste'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();
insert into public.vendors (name, default_category_id, is_recurring, expected_amount, expected_frequency)
  values ('3% Loss, Theft, Damages', (select id from public.expense_categories where name = 'Loss / Waste'), false, null, null)
  on conflict (name) do update set default_category_id = excluded.default_category_id,
    is_recurring = excluded.is_recurring, expected_amount = excluded.expected_amount,
    expected_frequency = excluded.expected_frequency, updated_at = now();

-- ---------- aliases (normalized) ----------
insert into public.vendor_aliases (alias, vendor_id) select '1% voids comps & discount', id from public.vendors where name = '1% Voids, Comps & Discount' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select '1% voids, comps & discount', id from public.vendors where name = '1% Voids, Comps & Discount' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select '2030 smoke shop', id from public.vendors where name = '2030 Smoke Shop' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select '3% loss theft damages', id from public.vendors where name = '3% Loss, Theft, Damages' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select '3% loss, theft, damages', id from public.vendors where name = '3% Loss, Theft, Damages' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select '7 eleven', id from public.vendors where name = '7-Eleven' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select '7-eleven', id from public.vendors where name = '7-Eleven' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select '7eleven', id from public.vendors where name = '7-Eleven' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'a city discount', id from public.vendors where name = 'A City Discount' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'a1 restaurant furniture', id from public.vendors where name = 'A1 Restaurant Furniture Inc' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'a1 restaurant furniture inc', id from public.vendors where name = 'A1 Restaurant Furniture Inc' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'abc spirits', id from public.vendors where name = 'ABC Spirits' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'ace hardware', id from public.vendors where name = 'Ace Hardware' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'acme studios', id from public.vendors where name = 'Acme Studios' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'affordable dumpster', id from public.vendors where name = 'Affordable Dumpster LLC' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'affordable dumpster llc', id from public.vendors where name = 'Affordable Dumpster LLC' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'aldi', id from public.vendors where name = 'Aldi' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'all in one hvac', id from public.vendors where name = 'All in One HVAC LLC' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'all in one hvac llc', id from public.vendors where name = 'All in One HVAC LLC' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'apex', id from public.vendors where name = 'Apex Environmental Services' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'apex environmental', id from public.vendors where name = 'Apex Environmental Services' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'apex environmental services', id from public.vendors where name = 'Apex Environmental Services' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'atlanta bp', id from public.vendors where name = 'Atlanta BP' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'autozone', id from public.vendors where name = 'AutoZone' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'batteries plus', id from public.vendors where name = 'BatteriesPlus' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'batteriesplus', id from public.vendors where name = 'BatteriesPlus' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'battery service and supply', id from public.vendors where name = 'Battery Service and Supply' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'best buy', id from public.vendors where name = 'Best Buy' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'best guy', id from public.vendors where name = 'Best Buy' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'blaze n puff', id from public.vendors where name = 'Blaze N Puff' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'br club', id from public.vendors where name = 'BR Club' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'brave', id from public.vendors where name = 'Brave' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'broohaven sales tax', id from public.vendors where name = 'Brookhaven Sales Tax' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'brookhaven pd', id from public.vendors where name = 'Brookhaven Police Department' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'brookhaven police department', id from public.vendors where name = 'Brookhaven Police Department' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'brookhaven sales tax', id from public.vendors where name = 'Brookhaven Sales Tax' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'brookhaven tax', id from public.vendors where name = 'Brookhaven Sales Tax' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'carolina cooks', id from public.vendors where name = 'Carolina Cooks' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'cedarland rest & grocery', id from public.vendors where name = 'Cedarland Rest & Grocery' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'charlotte market', id from public.vendors where name = 'Charlotte Market' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'chef store', id from public.vendors where name = 'Chef Store' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'cheney bothers', id from public.vendors where name = 'Cheney Brothers' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'cheney brothers', id from public.vendors where name = 'Cheney Brothers' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'cintas', id from public.vendors where name = 'Cintas' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'citas', id from public.vendors where name = 'Cintas' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'city farmers market', id from public.vendors where name = 'City Farmers Market' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'clairmont', id from public.vendors where name = 'Clairmont' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'comcast', id from public.vendors where name = 'Comcast Business' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'comcast business', id from public.vendors where name = 'Comcast Business' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'costco', id from public.vendors where name = 'Costco' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'custom tee shirts', id from public.vendors where name = 'Custom Tee Shirts' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'custom tees', id from public.vendors where name = 'Custom Tee Shirts' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'cvs', id from public.vendors where name = 'CVS' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'cvs pharmacy', id from public.vendors where name = 'CVS' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dba golden waffle', id from public.vendors where name = 'Golden Waffles' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dba golden waffles', id from public.vendors where name = 'Golden Waffles' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dba goldsn waffles', id from public.vendors where name = 'Golden Waffles' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dekalb county water', id from public.vendors where name = 'DeKalb County Water' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dekalb water', id from public.vendors where name = 'DeKalb County Water' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'diamond', id from public.vendors where name = 'Diamond Distributors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'diamond distributors', id from public.vendors where name = 'Diamond Distributors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'diamond distributors inc', id from public.vendors where name = 'Diamond Distributors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dollar general', id from public.vendors where name = 'Dollar General' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dollar tree', id from public.vendors where name = 'Dollar Tree' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dunkin', id from public.vendors where name = 'Dunkin''' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dunkin donuts', id from public.vendors where name = 'Dunkin''' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'dunkin doughnut', id from public.vendors where name = 'Dunkin''' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'eds supply co', id from public.vendors where name = 'Ed''s Supply Co' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'el progreso', id from public.vendors where name = 'El Progreso Supermarket' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'el progreso super market', id from public.vendors where name = 'El Progreso Supermarket' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'el progreso supermarket', id from public.vendors where name = 'El Progreso Supermarket' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'el progresso', id from public.vendors where name = 'El Progreso Supermarket' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'empire distributor', id from public.vendors where name = 'Empire Distributors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'empire distributors', id from public.vendors where name = 'Empire Distributors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'empire distrubitors', id from public.vendors where name = 'Empire Distributors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'express oil', id from public.vendors where name = 'Express Oil' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'extra space', id from public.vendors where name = 'Extra Space Storage' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'extra space stage', id from public.vendors where name = 'Extra Space Storage' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'extra space storage', id from public.vendors where name = 'Extra Space Storage' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'exxon', id from public.vendors where name = 'Exxon' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'family dollar', id from public.vendors where name = 'Family Dollar' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'farmer market', id from public.vendors where name = 'City Farmers Market' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'farmers', id from public.vendors where name = 'City Farmers Market' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'farmers market', id from public.vendors where name = 'City Farmers Market' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'food depot', id from public.vendors where name = 'Food Depot' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'food depots', id from public.vendors where name = 'Food Depot' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'food lion', id from public.vendors where name = 'Food Lion' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'ga sales tax', id from public.vendors where name = 'GA Sales Tax' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'gas', id from public.vendors where name = 'Gas Station (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'gas station', id from public.vendors where name = 'Gas Station (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'gas station (generic)', id from public.vendors where name = 'Gas Station (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'gas stations', id from public.vendors where name = 'Gas Station (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'georgia crown', id from public.vendors where name = 'Georgia Crown' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'georgia power', id from public.vendors where name = 'Georgia Power' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'georgia sales tax', id from public.vendors where name = 'GA Sales Tax' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'golden waffle', id from public.vendors where name = 'Golden Waffles' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'golden waffles', id from public.vendors where name = 'Golden Waffles' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'goldon waffles', id from public.vendors where name = 'Golden Waffles' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'gordom', id from public.vendors where name = 'Gordon Food Service' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'gordon', id from public.vendors where name = 'Gordon Food Service' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'gordon food service', id from public.vendors where name = 'Gordon Food Service' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'grocery', id from public.vendors where name = 'Grocery (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'grocery (generic)', id from public.vendors where name = 'Grocery (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'h mart', id from public.vendors where name = 'H Mart' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'harbor freight', id from public.vendors where name = 'Harbor Freight' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'harris teeter', id from public.vendors where name = 'Harris Teeter' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'home depot', id from public.vendors where name = 'Home Depot' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'hookah', id from public.vendors where name = 'Hookah (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'hookah (generic)', id from public.vendors where name = 'Hookah (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'int tropical market', id from public.vendors where name = 'Tropical Market' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'king ola', id from public.vendors where name = 'King Ola Distributions' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'king ola distributions', id from public.vendors where name = 'King Ola Distributions' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'king ola distributors', id from public.vendors where name = 'King Ola Distributions' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'kroger', id from public.vendors where name = 'Kroger' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'kurt hookah wholesale', id from public.vendors where name = 'Kurt Hookah Wholesale' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'like new', id from public.vendors where name = 'Like New Hoods' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'like new hood', id from public.vendors where name = 'Like New Hoods' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'like new hoods', id from public.vendors where name = 'Like New Hoods' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'little hardware', id from public.vendors where name = 'Little Hardware Co' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'little hardware co', id from public.vendors where name = 'Little Hardware Co' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'lowes', id from public.vendors where name = 'Lowe''s' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'marketing & promotion', id from public.vendors where name = 'Marketing & Promotion' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'micro center', id from public.vendors where name = 'Micro Center' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'mike contractor', id from public.vendors where name = 'Mike Contractor' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'mr curtis cleaning', id from public.vendors where name = 'Mr. Curtis Cleaning Crew' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'mr curtis cleaning crew', id from public.vendors where name = 'Mr. Curtis Cleaning Crew' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'national republic', id from public.vendors where name = 'Republic National' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'new bismalah supermarket', id from public.vendors where name = 'New Bismalah Supermarket' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'new carbon co', id from public.vendors where name = 'New Carbon Co' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'nvntechs llc blaze n puff', id from public.vendors where name = 'Blaze N Puff' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'office depot', id from public.vendors where name = 'Office Depot' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'office max', id from public.vendors where name = 'OfficeMax' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'officemax', id from public.vendors where name = 'OfficeMax' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'opentable', id from public.vendors where name = 'OpenTable' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'payroll - labor & wages', id from public.vendors where name = 'Payroll – Labor & Wages' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'payroll labor & wages', id from public.vendors where name = 'Payroll – Labor & Wages' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'payroll processing fee', id from public.vendors where name = 'Payroll Processing Fee' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'payroll – labor & wages', id from public.vendors where name = 'Payroll – Labor & Wages' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'performance', id from public.vendors where name = 'Performance Food Group' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'performance food group', id from public.vendors where name = 'Performance Food Group' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'phone', id from public.vendors where name = 'Phone (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'phone (generic)', id from public.vendors where name = 'Phone (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'plumbing works', id from public.vendors where name = 'Plumbing Works' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'presidential parkway atlanta', id from public.vendors where name = 'Presidential Parkway Atlanta' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'pristine hood vent', id from public.vendors where name = 'Pristine Hood Vent' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'property rent', id from public.vendors where name = 'Property Rent' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'publix', id from public.vendors where name = 'Publix' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'qt', id from public.vendors where name = 'QuikTrip' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'qt gas', id from public.vendors where name = 'QuikTrip' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'quikserve', id from public.vendors where name = 'QuikTrip' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'quiktrip', id from public.vendors where name = 'QuikTrip' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'r e m', id from public.vendors where name = 'Restaurant Equipment Merchandise' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'rem', id from public.vendors where name = 'Restaurant Equipment Merchandise' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'republic national', id from public.vendors where name = 'Republic National' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'restaurant depot', id from public.vendors where name = 'Restaurant Depot' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'restaurant equipment', id from public.vendors where name = 'Restaurant Equipment Merchandise' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'restaurant equipment merchandise', id from public.vendors where name = 'Restaurant Equipment Merchandise' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'restaurant furniture', id from public.vendors where name = 'A1 Restaurant Furniture Inc' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'road runner', id from public.vendors where name = 'Road Runner' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'roberts oxygen', id from public.vendors where name = 'Roberts Oxygen Company' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'roberts oxygen company', id from public.vendors where name = 'Roberts Oxygen Company' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'sam s', id from public.vendors where name = 'Sam''s Club' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'same club', id from public.vendors where name = 'Sam''s Club' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'sams', id from public.vendors where name = 'Sam''s Club' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'sams club', id from public.vendors where name = 'Sam''s Club' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'sanwa produce', id from public.vendors where name = 'Sanwa Produce Atlanta' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'sanwa produce atlanta', id from public.vendors where name = 'Sanwa Produce Atlanta' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'savannah', id from public.vendors where name = 'Savannah Distributing' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'savannah distributing', id from public.vendors where name = 'Savannah Distributing' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'savannah distro', id from public.vendors where name = 'Savannah Distributing' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'scana', id from public.vendors where name = 'Scana Energy Natural Gas' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'scana energy', id from public.vendors where name = 'Scana Energy Natural Gas' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'scana energy natural gas', id from public.vendors where name = 'Scana Energy Natural Gas' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'shell', id from public.vendors where name = 'Shell' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'shell gas', id from public.vendors where name = 'Shell' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'slang', id from public.vendors where name = 'Slang' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'software', id from public.vendors where name = 'Software (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'software (generic)', id from public.vendors where name = 'Software (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'sonoco', id from public.vendors where name = 'Sonoco' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'standard ops associates llc', id from public.vendors where name = 'Standard Ops Associates LLC' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'staples', id from public.vendors where name = 'Staples' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'starbucks', id from public.vendors where name = 'Starbucks' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'super sod', id from public.vendors where name = 'Super Sod' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'supermarket', id from public.vendors where name = 'Grocery (generic)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'supersource', id from public.vendors where name = 'SuperSource' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'sysco', id from public.vendors where name = 'Sysco' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'target', id from public.vendors where name = 'Target' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'tee shirt', id from public.vendors where name = 'Custom Tee Shirts' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'the home depot', id from public.vendors where name = 'Home Depot' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'toast', id from public.vendors where name = 'Toast Inc. (POS)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'toast charge back', id from public.vendors where name = 'Toast Chargeback' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'toast chargeback', id from public.vendors where name = 'Toast Chargeback' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'toast inc', id from public.vendors where name = 'Toast Inc. (POS)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'toast inc (pos)', id from public.vendors where name = 'Toast Inc. (POS)' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'total wine', id from public.vendors where name = 'Total Wine' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'touba in market', id from public.vendors where name = 'Touba International' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'touba international', id from public.vendors where name = 'Touba International' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'tower', id from public.vendors where name = 'Tower Beer, Wine & Spirits' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'tower - beer, wine & spirits', id from public.vendors where name = 'Tower Beer, Wine & Spirits' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'tower beer wine', id from public.vendors where name = 'Tower Beer, Wine & Spirits' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'tower beer, wine & spirits', id from public.vendors where name = 'Tower Beer, Wine & Spirits' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'tower wine & spirits', id from public.vendors where name = 'Tower Beer, Wine & Spirits' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'towers', id from public.vendors where name = 'Tower Beer, Wine & Spirits' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'training institute for responsible vendors', id from public.vendors where name = 'Training Institute for Responsible Vendors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'training institute of responsible vendors', id from public.vendors where name = 'Training Institute for Responsible Vendors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'trop market', id from public.vendors where name = 'Tropical Market' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'tropical market', id from public.vendors where name = 'Tropical Market' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'u-haul', id from public.vendors where name = 'U-Haul' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'uhaul', id from public.vendors where name = 'U-Haul' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'united carolina becerages', id from public.vendors where name = 'United Carolina Beverages' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'united carolina beverages', id from public.vendors where name = 'United Carolina Beverages' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'united distributor', id from public.vendors where name = 'United Distributors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'united distributors', id from public.vendors where name = 'United Distributors' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'us foods', id from public.vendors where name = 'US Foods' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'van insurance and fuel', id from public.vendors where name = 'Van, Insurance and Fuel' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'van, insurance and fuel', id from public.vendors where name = 'Van, Insurance and Fuel' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'village ice', id from public.vendors where name = 'Village Ice' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'walmart', id from public.vendors where name = 'Walmart' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'watershed management', id from public.vendors where name = 'Watershed Management' on conflict (alias) do nothing;
insert into public.vendor_aliases (alias, vendor_id) select 'zippy ice', id from public.vendors where name = 'Zippy Ice' on conflict (alias) do nothing;
