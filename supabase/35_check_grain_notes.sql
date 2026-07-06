-- 35 — Check-grain notes. The void/discount drill now lists one row per
-- CHECK (daily_vd_checks) instead of one row per (night · employee ·
-- reason), so notes attach to the specific check via check_guid (stable
-- across Toast re-imports). Legacy notes and nights without check detail
-- keep working through the old natural key (check_guid null).

alter table public.void_discount_notes add column if not exists check_guid text;
create index if not exists idx_vdn_guid on public.void_discount_notes(check_guid) where check_guid is not null;
