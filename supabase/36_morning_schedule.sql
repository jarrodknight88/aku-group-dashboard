-- 36: Pull the morning data chain earlier so everything is live before the
--     7am ET check-in. Locations close 2–3am ET; Toast's business day rolls
--     at 5am ET; the GitHub Actions Toast pull now runs at 10:30 UTC
--     (6:30am EDT / 5:30am EST). Downstream jobs follow it:
--       valet-sheet-sync    11:30 → 10:45 UTC (independent of Toast)
--       groupme-photo-match 12:00 → 11:15 UTC (needs daily_vd_checks from the
--                                              pull; 45 min buffer covers
--                                              Actions' scheduling jitter)
-- cron.schedule() with an existing jobname updates that job in place.

select cron.schedule('valet-sheet-sync', '45 10 * * *', $$select public.sync_valet_sheets()$$);
select cron.schedule('groupme-photo-match', '15 11 * * *', $$select public.match_groupme_photos()$$);
