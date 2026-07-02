# Toast → daily_metrics pull

Implements `supabase/daily_metrics_import_mapping_spec.md`. Runs daily at
11:00 UTC via `.github/workflows/toast-pull.yml`, pulling **yesterday's
business date** for every mapped location and upserting the sales side of
`public.daily_metrics`. Cost columns (`food_cost`, `liquor_cost`, `expenses`)
are owned by the invoice writer and never touched here.

## Setup — GitHub Actions secrets

Repo → Settings → Secrets and variables → Actions → **New repository secret**.
Never put these in the repo, the dashboard, or chat.

**Preferred: one `TOAST_ACCOUNTS` secret** — works for any number of Toast
credential sets. Locations that live under different Toast accounts (separate
client id/secret pairs) are just separate entries:

```json
[
  {
    "name": "main",
    "clientId": "…",
    "clientSecret": "…",
    "locations": { "<toast-guid>": "ATL", "<toast-guid>": "CLT" }
  },
  {
    "name": "afro-district",
    "clientId": "…",
    "clientSecret": "…",
    "locations": { "<toast-guid>": "AFRO" }
  }
]
```

`host` is optional per entry (defaults to `https://ws-api.toasttab.com`).
If everything is under a single credential set, the flat form also works:
`TOAST_API_HOST`, `TOAST_CLIENT_ID`, `TOAST_CLIENT_SECRET`,
`TOAST_LOCATION_MAP` (`{"<guid>":"ATL", …}`).

Always required:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | `https://bvqubtromgldqnnhfeuz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API keys (service_role — secret) |

The location **codes** must match `public.locations.code`. Locations are rows,
not code: to add or rename a venue, update the `locations` table and use its
code in the map. A GUID mapping to a code with no `locations` row fails
loudly — by design.

## Finding restaurant GUIDs — discover mode

If you're not sure which GUID belongs to which venue, run the workflow with
**discover** checked (optionally passing candidate GUIDs in the `guids`
input, space-separated). For each credential it authenticates, extracts any
GUIDs referenced inside the token itself, probes every candidate against the
Restaurants API, and prints the venue name each accessible GUID resolves
to — plus the business-day closeout hour (the spec §4 check). Nothing is
written; Supabase secrets aren't needed for this mode.

Locally: `node scripts/toast-pull/pull.mjs --discover <guid> <guid>`

## Calibration status (verified 2026-07-02 against Sales Summary export 6/26–6/27)

| Column | Status |
|---|---|
| net_sales | ✅ exact (Σ non-void selection prices) |
| gross_sales | ✅ exact (net + applied discounts) |
| covers | ✅ exact (guests on non-deleted orders with a live check) |
| voids_amount | ✅ exact |
| discounts_amount | ✅ exact per discount name (APPLIED processingState only) |
| labor_cost | ⏸ deferred — Toast has hours but no wages for this venue; owner plans Toast hours + external tipout/credit-tip sheet. Time entries already carry tips fields for that work. Reads $0 until then; re-pull history to self-heal once solved. |

Days with zero orders and zero time entries are skipped, not written as $0 rows.

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
