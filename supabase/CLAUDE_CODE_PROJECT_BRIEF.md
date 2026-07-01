# CLAUDE CODE PROJECT BRIEF — Teranga Group Operations Dashboard

## What this project is
A multi-location restaurant operations dashboard for Teranga Group
(Teranga ATL, Teranga CLT, Afro District; R Thomas reopening soon — locations
must be data-driven, never hardcoded).

- **Front end:** single-page dashboard (built separately in Claude Design,
  currently running on demo data), hosted on **Netlify**.
- **Backend:** **Supabase** (Postgres + Auth + RLS + pg_cron) — holds daily
  metrics, 24-period snapshot history, KPI targets, expense mappings,
  chargebacks, exception flags.
- **Data source:** Toast POS via **Standard API access** (read-only), pulled
  daily by a **GitHub Actions** script. Cost-side data (food/liquor/expenses)
  comes from a separate invoice intake, NOT Toast.

## Files in this handoff
| File | What it is |
|---|---|
| `00_architecture_README.md` | Full architecture: role model, RLS design, cron decision, RPC catalog, build order |
| `01`–`11_*.sql` | Supabase migrations, numbered, run in order. Each has a VERIFY step |
| `daily_metrics_import_mapping_spec.md` | The contract for the Toast pull script: field mapping, business-day logic, idempotency, failure posture |

## Build order (do these in sequence)

### Phase 1 — Stand up the backend
1. Run migrations 01–05 in the Supabase project (SQL editor or CLI).
2. **Gate:** prove the access model before continuing. Create two test users
   (one owner, one manager assigned a single location); confirm the manager
   sees only their location. Bootstrap note: the FIRST owner must be set via
   SQL editor (`update profiles set role='owner' where id='<uid>'`) because
   the role-change trigger requires an existing admin.
3. Run migrations 06–11. Verify per the README's table (effective targets,
   keyword matcher, snapshot builder, chargeback totals, cron job registered).

### Phase 2 — Wire the dashboard to Supabase
1. Add supabase-js to the dashboard; auth via Supabase Auth.
2. Replace demo-data reads with the queries/RPCs cataloged in the README §4
   (snapshots, effective KPI targets, expense mappings, exceptions,
   chargeback stage totals).
3. Keep a demo-data fallback mode for local dev.
4. RLS does the permissioning — do NOT build a second permission layer in JS.
   A manager login should simply see less data from the same queries.
5. Deploy to Netlify.

### Phase 3 — Toast pull script (GitHub Actions)
Build exactly to `daily_metrics_import_mapping_spec.md`. Key rules:
- Pull by Toast **businessDate**, never timestamp windows (5am roll is Toast's job).
- Upsert on (location_id, business_date); idempotent re-runs; date-range arg
  for backfills.
- Toast GUID → location UUID via config map; unmapped GUID = loud failure.
- Sales-side columns only — invoice flow owns cost columns on the same rows.
- Secrets in GitHub Actions secrets only. Auth token cached per run (~1/day).
- Any location failure = nonzero exit; no partial silent writes.
- **Blocked on:** Toast Standard API credentials (user is obtaining; requires
  RMS Essentials+ and the 8.4 Manage Integrations permission on all locations).
  Everything before this phase proceeds without them. The spec's §7 checklist
  validates the first real pull against Toast Web's own reports.

### Phase 4 — "Ask the data" panel (after data flows)
- Chat panel in the dashboard: question → model writes SQL → runs on Supabase
  → plain-English answer + chart.
- MUST use a **read-only database role** (SELECT-only) scoped to
  daily_metrics, period_snapshots, chargebacks, exception_flags. Never
  profiles/auth tables.
- RLS still applies (queries run as the logged-in user).
- Anthropic API is available in the artifact/app environment for the model call.
- A business data dictionary will be provided later to ground the answers —
  design the panel so the dictionary is a swappable system-prompt block.

## Decisions already made (do not re-litigate)
- Roles: owner / admin / general_manager / manager. GM & manager are enforced
  identically in RLS (scoped via user_locations); owner & admin both write config.
- KPI targets: org defaults + per-location overrides (partial unique indexes).
- Org rollups recompute percentages from summed dollars — never average
  per-location percentages.
- Chargebacks are per-transaction rows with a stage (won/in_progress/lost);
  tiles sum by stage.
- Exceptions carry source (manual/csv/rule) + nullable rule_id for future
  rule-engine automation.
- Snapshots: weekly, pg_cron (Mon 12:00 UTC), keep 24 per scope, org + per-location.
- Dashboard date control is a range picker with presets; comparison = the
  immediately preceding period of equal length.
- Brand: Teranga Blue #184080 only; tints/shades + neutral grays. No other
  accent colors.

## Known environment facts
- Supabase project ref: vlsauggjojxtrkzjeqtd
- GitHub: jarrodknight88/jarrod-tools
- Hosting: Netlify (existing account/sites)
- Toast: Standard API access = read-only, self-generated in Toast Web
  (Integrations > Toast API access > Manage credentials) once RMS + 8.4
  permission confirmed.

## Open items (ask the user, don't guess)
1. Toast credentials + the exact scope names available at generation time.
2. Real expense category list (migration 07 ships a placeholder six).
3. Business-day start time config at each location (should be ~5:00 AM).
4. Whether covers (guest count) is reliably entered per check at these venues.
5. The invoice-side writer for cost columns (exists as Fillout→Sheets flow;
   Supabase write path to be designed when wiring Phase 3).
