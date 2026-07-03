# Tips sheet → dashboard intake

The nightly reconciliation Google Sheet (one tab per day, `MM.dd.yy`) is the
source of truth for tips owed. Its Apps Script — the same project that builds
the weekly gratuity report — pushes each night's per-employee totals into the
dashboard with `tips-push.gs`, so no Google credentials ever live in this repo
or in GitHub Actions.

## Data flow

```
Reconciliation sheet (per-day tabs)
  └─ Apps Script trigger (daily ~6am) → pushYesterdayTipsToDashboard()
       └─ POST /rest/v1/rpc/ingest_daily_tips  (anon key + shared token)
            └─ public.daily_tips  (one row per employee per night, replaced wholesale)

Toast pull (GitHub Action, 11:00 UTC)
  └─ /labor/v1/timeEntries + jobs/employees
       └─ public.daily_labor  (hours · rate · wages per employee per job per day)
```

The Payroll page builds a run by joining the two over the pay period:
`check = (Σ hours × rate) + Σ tips`, matching `daily_tips.employee_name` to
`daily_labor.employee_name` (normalized), with `employee_aliases` covering
nicknames. Names on the sheet with no Toast match surface as **● Review**.

## Amount semantics (mirrors the weekly gratuity script)

- Rows **above** the tipout section → column K (earned tips) — what the
  tipped employee is owed, net of tip-out.
- Rows **at/below** the tipout section (Barback / Hookah Master / Service
  Bar / Host) → column C — the tipout that support employee receives.
- The same name in both sections is summed. Junk rows and numeric names are
  skipped, identical to the report.

## Setup per location

1. Open the location's tips Apps Script project and add `tips-push.gs`.
2. Project Settings → Script properties:
   - `DASH_SUPABASE_URL` — `https://bvqubtromgldqnnhfeuz.supabase.co`
   - `DASH_SUPABASE_KEY` — the dashboard's publishable (anon) key
   - `DASH_TIPS_TOKEN` — run in the Supabase SQL editor:
     `select value from app_secrets where key = 'tips_ingest_token';`
   - `DASH_LOCATION_CODE` — the venue's `locations.code` (e.g. `atl`)
3. Triggers → time-driven, daily 6–7am → `pushYesterdayTipsToDashboard`.
4. Backfill history from the script editor:
   `pushTipsRangeToDashboard('2026-05-01', '2026-07-02')`.

To rotate the token:
`update app_secrets set value = encode(gen_random_bytes(24),'hex') where key = 'tips_ingest_token';`
then update the script property.

## Security

The RPC validates the shared token server-side (`app_secrets` is RLS-locked
with no policies, so only the definer function and service role read it),
resolves the location by code, and replaces exactly one location-day of
`daily_tips`. The anon key alone can do nothing without the token, and the
token can only write tips rows.
