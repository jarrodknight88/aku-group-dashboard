-- 12_function_hardening.sql
-- Advisor-driven: SECURITY DEFINER functions were executable by anon via
-- /rest/v1/rpc/*, and lower_keyword had a mutable search_path. Lock EXECUTE
-- down to the roles that actually need each function.

-- Pin search_path on the keyword-normalizing trigger fn.
create or replace function public.lower_keyword()
returns trigger language plpgsql
set search_path = public
as $$
begin new.keyword := lower(new.keyword); return new; end $$;

-- Trigger functions: never REST-callable. Triggers still fire (owner executes).
revoke execute on function public.handle_new_user()        from public, anon, authenticated;
revoke execute on function public.protect_profile_role()   from public, anon, authenticated;
revoke execute on function public.lower_keyword()          from public, anon, authenticated;

-- Snapshot builder: cron (postgres) only. Nobody calls this over REST.
revoke execute on function public.build_weekly_snapshot(date, date) from public, anon, authenticated;

-- App-facing RPCs: signed-in users only (internal guards handle role/location).
revoke execute on function public.is_org_admin()                                  from public, anon;
revoke execute on function public.is_admin()                                      from public, anon;
revoke execute on function public.can_access_location(uuid)                       from public, anon;
revoke execute on function public.get_effective_targets(uuid)                     from public, anon;
revoke execute on function public.reset_kpi_targets()                             from public, anon;
revoke execute on function public.match_expense_category(text)                    from public, anon;
revoke execute on function public.export_expense_mapping_json()                   from public, anon;
revoke execute on function public.get_period_snapshots(snapshot_scope, uuid, int) from public, anon;
revoke execute on function public.clear_period_snapshots(snapshot_scope, uuid)    from public, anon;
revoke execute on function public.get_chargeback_totals(uuid, date, date)         from public, anon;

-- Future functions: don't hand EXECUTE to public/anon by default.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
