-- 11_cron.sql
-- Schedule the weekly snapshot with pg_cron (in-DB, transactional, no deploy).

create extension if not exists pg_cron;

-- Remove any prior definition so re-running is safe.
select cron.unschedule('weekly-snapshot')
where exists (select 1 from cron.job where jobname = 'weekly-snapshot');

-- Mondays 12:00 UTC (~8am ET): clears the 5am business-day rollover and any
-- Monday-morning import. With no args, build_weekly_snapshot() snapshots the
-- prior ISO week (Mon–Sun). Adjust the expression if your import lands later.
select cron.schedule(
  'weekly-snapshot',
  '0 12 * * 1',
  $$ select public.build_weekly_snapshot(); $$
);

-- VERIFY:  select jobname, schedule, command from cron.job;
-- BACKFILL a specific week on demand:
--   select public.build_weekly_snapshot('2025-06-16','2025-06-22');
-- INSPECT run history:
--   select * from cron.job_run_details order by start_time desc limit 10;
