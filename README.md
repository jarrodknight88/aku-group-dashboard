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

## What's built in this slice

The **Location Report** (Level 2, Teranga ATL) is implemented pixel-for-pixel
from the handoff design at `src/pages/LocationReport.jsx`:

- Headline strip (Net Sales · Covers · Avg Check · Valet) with deltas.
- **Money In** — Daily Sales, Payment Mix, Revenue Streams.
- **Money Saved** — Food % · Labor % (vs target) · Liquor % · Total Expenses.
- **Money Protected** — Void % / Discount % vs target, Voids/Discounts by day,
  Chargebacks by Stage (Won / In Progress / Lost), Exception Flags tile
  (deep-links to `?loc=atl` for the per-manager scoped view).
- **Top Sellers** — Top Food / Liquor / Hookah + Category Performance.
- **Top Employees** — Servers / Bartenders / Hookah / Overall, with a working
  **Top by $ / Top by Qty** toggle driving all four cards.

The other levels (Company Glance, By Location hub, Detail Drill, Exception
Detail, Settings) are **routed stubs** so the whole flow is navigable. Data is
realistic demo data pending the Supabase wiring.

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
| `/` | Company Glance (stub) |
| `/locations` | By Location hub (stub, cards link to reports) |
| `/locations/:loc` | **Location Report** (built; Teranga ATL) |
| `/detail-drill` | Detail Drill (stub) |
| `/exceptions?loc=atl` | Exception Flags, location-scoped (stub) |
| `/settings` | Settings (stub) |

## Backend reference — `supabase/`

The full Supabase build plan (schema, RLS role model, weekly-snapshot pg_cron
job, RPC catalog, and the Toast import spec) lives in `supabase/`, numbered
`01`–`11` in run order. Start at `supabase/00_architecture_README.md` and
`supabase/CLAUDE_CODE_PROJECT_BRIEF.md`. These are **reference only** — not yet
applied to a Supabase project or wired into the front end.
