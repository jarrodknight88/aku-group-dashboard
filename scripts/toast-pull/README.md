# Toast → daily_metrics pull

Implements `supabase/daily_metrics_import_mapping_spec.md`. Runs daily at
11:00 UTC via `.github/workflows/toast-pull.yml`, pulling **yesterday's
business date** for every mapped location and upserting the sales side of
`public.daily_metrics`. Cost columns (`food_cost`, `liquor_cost`, `expenses`)
are owned by the invoice writer and never touched here.

## Setup — GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**.
Never put these in the repo, the dashboard, or chat.

| Secret | Value |
|---|---|
| `TOAST_API_HOST` | `https://ws-api.toasttab.com` (production) |
| `TOAST_CLIENT_ID` | From Toast Web → Integrations → API access |
| `TOAST_CLIENT_SECRET` | Shown once at credential creation |
| `TOAST_LOCATION_MAP` | JSON mapping Toast restaurant GUID → our location code, e.g. `{"a1b2…":"ATL","c3d4…":"CLT","e5f6…":"AFRO"}` |
| `SUPABASE_URL` | `https://bvqubtromgldqnnhfeuz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API keys (service_role — secret) |

The location **codes** must match `public.locations.code` (`ATL`, `CLT`,
`AFRO`, `RTHOMAS`). GUIDs live only in the secret; adding R Thomas at reopen =
one JSON entry, no code change. A GUID mapping to a code with no `locations`
row fails loudly — by design.

## First-pull verification (spec §7)

Before trusting the numbers, run the manual workflow with **dry run** checked:
Actions → *Toast daily pull* → Run workflow → set a start/end date covering
one normal night and one late/heavy night.

Compare the printed aggregates against Toast Web's own reports for those
dates, per the checklist in spec §7 (net sales, covers = guests, post-midnight
checks on the prior business date, voids $, discounts $, labor $). The field
mapping lives in `aggregateOrders()` / `aggregateLabor()` in `pull.mjs`, in
one clearly marked ⚠ VERIFY block — if any number disagrees with Toast Web,
that's the only place to adjust.

Also confirm in Toast Web that each location's **business-day start time** is
~5:00 AM (spec §4) *before* the first real import.

## Repair / backfill

Re-running any window is idempotent (upsert on `location_id, business_date`):

- Actions → Run workflow → set `start_date` / `end_date`
- or locally: `node scripts/toast-pull/pull.mjs 2026-06-23 2026-06-29`

Any failed location/day exits nonzero and lists the days to re-pull — no
partial-day silent writes.
