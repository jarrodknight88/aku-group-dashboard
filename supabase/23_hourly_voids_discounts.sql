-- 23 — Hourly voids & discounts (single-day dashboard views chart these by
-- hour, like sales). Written by the Toast pull; history populates on the
-- next backfill re-run.
alter table public.daily_metrics
  add column if not exists voids_by_hour jsonb,
  add column if not exists discounts_by_hour jsonb;
