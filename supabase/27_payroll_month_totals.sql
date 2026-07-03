-- 27 — Real payroll for the Financials P&L.
-- Payroll stops being an invoice line: the P&L pulls it from the Payroll
-- system instead — wages come from daily_metrics.labor_cost (Toast hours ×
-- dashboard rates, already visible to location users), and this function
-- adds the admin-only parts: tips paid out (daily_tips) per month and the
-- active salaried total (biweekly salary × 26 / 12 ≈ monthly). Non-admins
-- get an empty set — their P&L shows wages-only payroll.

create or replace function public.payroll_month_totals(p_year int, p_location uuid default null)
returns table (month date, tips numeric, salaried_monthly numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_admin() then
    return;
  end if;
  return query
  select
    date_trunc('month', t.business_date)::date as month,
    round(sum(t.amount)::numeric, 2) as tips,
    (select round(coalesce(sum(s.salary), 0) * 26 / 12, 2)
     from public.salaried_employees s
     where s.active and (p_location is null or s.location_id = p_location)) as salaried_monthly
  from public.daily_tips t
  where extract(year from t.business_date) = p_year
    and (p_location is null or t.location_id = p_location)
  group by 1
  order by 1;
end $$;

-- The "Payroll – Labor & Wages" recurring bill is superseded by the live
-- payroll pull; remove it so it can't be double-entered. The processing fee
-- stays a bill but moves to Other so it keeps counting as a normal expense.
delete from public.recurring_bill_payments
  where bill_id in (select id from public.recurring_bills where name = 'Payroll – Labor & Wages');
delete from public.recurring_bills where name = 'Payroll – Labor & Wages';
update public.recurring_bills
  set category_id = (select id from public.expense_categories where name = 'Other')
  where name = 'Payroll Processing Fee';
