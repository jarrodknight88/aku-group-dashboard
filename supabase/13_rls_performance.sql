-- 13_rls_performance.sql
-- Advisor-driven tuning:
--  * wrap auth.uid() in (select ...) so it's an initplan, not per-row
--  * split FOR ALL write policies into insert/update/delete so they don't
--    double-evaluate on SELECT alongside the read policies
--  * cover the created_by / cleared_by FKs with indexes

-- ---- initplan fixes ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using ( id = (select auth.uid()) or public.is_org_admin() );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using ( id = (select auth.uid()) or public.is_org_admin() )
  with check     ( id = (select auth.uid()) or public.is_org_admin() );

drop policy if exists user_locations_select on public.user_locations;
create policy user_locations_select on public.user_locations
  for select using ( user_id = (select auth.uid()) or public.is_org_admin() );

drop policy if exists exp_cat_select on public.expense_categories;
create policy exp_cat_select on public.expense_categories
  for select using ( (select auth.uid()) is not null );

drop policy if exists exp_kw_select on public.expense_category_keywords;
create policy exp_kw_select on public.expense_category_keywords
  for select using ( (select auth.uid()) is not null );

-- ---- split FOR ALL write policies ----
drop policy if exists locations_write on public.locations;
create policy locations_insert on public.locations for insert with check ( public.is_org_admin() );
create policy locations_update on public.locations for update using ( public.is_org_admin() ) with check ( public.is_org_admin() );
create policy locations_delete on public.locations for delete using ( public.is_org_admin() );

drop policy if exists user_locations_write on public.user_locations;
create policy user_locations_insert on public.user_locations for insert with check ( public.is_org_admin() );
create policy user_locations_update on public.user_locations for update using ( public.is_org_admin() ) with check ( public.is_org_admin() );
create policy user_locations_delete on public.user_locations for delete using ( public.is_org_admin() );

drop policy if exists kpi_write on public.kpi_targets;
create policy kpi_insert on public.kpi_targets for insert with check ( public.is_org_admin() );
create policy kpi_update on public.kpi_targets for update using ( public.is_org_admin() ) with check ( public.is_org_admin() );
create policy kpi_delete on public.kpi_targets for delete using ( public.is_org_admin() );

drop policy if exists exp_cat_write on public.expense_categories;
create policy exp_cat_insert on public.expense_categories for insert with check ( public.is_org_admin() );
create policy exp_cat_update on public.expense_categories for update using ( public.is_org_admin() ) with check ( public.is_org_admin() );
create policy exp_cat_delete on public.expense_categories for delete using ( public.is_org_admin() );

drop policy if exists exp_kw_write on public.expense_category_keywords;
create policy exp_kw_insert on public.expense_category_keywords for insert with check ( public.is_org_admin() );
create policy exp_kw_update on public.expense_category_keywords for update using ( public.is_org_admin() ) with check ( public.is_org_admin() );
create policy exp_kw_delete on public.expense_category_keywords for delete using ( public.is_org_admin() );

drop policy if exists daily_write on public.daily_metrics;
create policy daily_insert on public.daily_metrics for insert with check ( public.is_org_admin() );
create policy daily_update on public.daily_metrics for update using ( public.is_org_admin() ) with check ( public.is_org_admin() );
create policy daily_delete on public.daily_metrics for delete using ( public.is_org_admin() );

drop policy if exists snap_write on public.period_snapshots;
create policy snap_insert on public.period_snapshots for insert with check ( public.is_org_admin() );
create policy snap_update on public.period_snapshots for update using ( public.is_org_admin() ) with check ( public.is_org_admin() );
create policy snap_delete on public.period_snapshots for delete using ( public.is_org_admin() );

-- ---- FK covering indexes ----
create index if not exists idx_cb_created_by  on public.chargebacks(created_by);
create index if not exists idx_exc_created_by on public.exception_flags(created_by);
create index if not exists idx_exc_cleared_by on public.exception_flags(cleared_by);
