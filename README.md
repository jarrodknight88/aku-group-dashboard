# Aku Group Dashboard

Operations dashboard for Aku Group's restaurant locations — a three-level view
(Company roll-up → By Location → Location Report → Detail Drill), with KPI
target color-coding, exception flags, and settings.

Rebrand of a Claude Design prototype. Parent brand shown as **Aku Group**; venue
names (Teranga ATL, Teranga CLT, Afro District; R Thomas opening soon) are kept
from the source design and are data-driven, not hardcoded once the backend is wired.

## Stack

- **React 18 + Vite** front end, **React Router** for the level navigation.
- Brand: **Aku Blue `#184080`** only — tints/shades + neutral grays, no other accents.
- Backend (planned): **Supabase** (Postgres + Auth + RLS + pg_cron). See `supabase/`.

## What's built

All six screens from the handoff design, implemented pixel-for-pixel with
realistic demo data pending the Supabase wiring:

- **Company Glance** (Level 1) — headline strip with deltas, Money In (Daily
  Sales by Location, Revenue Mix, Revenue Streams), Money Saved, Money
  Protected (incl. Won/In-Progress/Lost chargebacks + Exception Flags tile),
  Top Sellers, and the color-coded Location Comparison table.
- **By Location** hub — a card per venue with status pill, Net Sales + delta,
  Covers + avg check, and target-health chips (Food · Liquor · Labor · Void ·
  Disc); R Thomas opening-soon card and + Add Location affordance.
- **Location Report** (Level 2, Teranga ATL) — full parity with Company,
  scoped to one venue: Money In / Saved / Protected, Top Sellers, and Top
  Employees (Servers / Bartenders / Hookah / Overall) with a working
  **Top by $ / Top by Qty** toggle driving all four cards.
- **Detail Drill** (Level 3) — top sellers with a working $/Qty toggle,
  Payment Methods detail table, exception preview, Monthly P&L Summary.
- **Exception Flags** — summary strip, Flags-by-Audit-Rule bars, filter bar,
  and the flagged-transaction table. Everything recomputes from `?loc=`;
  location chips hide in scoped views, so each manager's deep link (e.g.
  `/exceptions?loc=clt`) shows only their venue.
- **Settings** — three working tabs: KPI Targets (editable + Reset to
  Defaults, incl. Liquor < 24%), Period History (keeps 24, Clear All), and
  Expense Category Mapping (keyword rules with add/remove, live vendor-name
  tester with longest-keyword-wins, JSON export with copy).

Interactions that work: all navigation/back-paths, the $/Qty toggles, KPI
target editing + reset, mapping add/remove + tester, and location-scoped
exception deep links. Date picker, status filters, and export buttons are
visual pending data wiring.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # serve the build
```

Deep-linking works on Netlify via `public/_redirects` (SPA fallback).

## Routes

| Path | Screen |
|---|---|
| `/` | Company Glance (Level 1) |
| `/locations` | By Location hub |
| `/locations/:loc` | Location Report (Level 2; Teranga ATL) |
| `/detail-drill` | Detail Drill (Level 3) |
| `/exceptions` · `/exceptions?loc=atl` | Exception Flags (org-wide / location-scoped) |
| `/settings` | Settings (KPI Targets · Period History · Expense Mapping) |

## Backend reference — `supabase/`

The full Supabase build plan (schema, RLS role model, weekly-snapshot pg_cron
job, RPC catalog, and the Toast import spec) lives in `supabase/`, numbered
`01`–`11` in run order. Start at `supabase/00_architecture_README.md` and
`supabase/CLAUDE_CODE_PROJECT_BRIEF.md`. These are **reference only** — not yet
applied to a Supabase project or wired into the front end.
