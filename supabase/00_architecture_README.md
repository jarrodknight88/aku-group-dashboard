# Teranga Group Operations Dashboard — Backend Architecture

Supabase (Postgres + Auth + RLS + pg_cron). This document is the map; the
numbered `.sql` files are the territory. Run them in order; each is
independently verifiable.

---

## 1. Role model

| Role | Reads | Writes config (KPI targets, expense mapping) | Location scope |
|---|---|---|---|
| `owner` | Everything org-wide | Yes | All |
| `admin` | Everything org-wide | Yes | All |
| `general_manager` | Assigned locations | No | `user_locations` rows |
| `manager` | Assigned locations | No | `user_locations` rows |

- In RLS, **GM and Manager are enforced identically** (both scoped to their
  `user_locations` rows). They're kept as separate roles for labeling and for
  future divergence (e.g. letting GMs edit their own location's KPI overrides).
- **Owner and Admin are enforced identically.** If you want Owner read-only on
  settings, change the config-table write policies from `is_org_admin()` to a
  narrower `is_admin()` helper — noted inline in `06`/`07`.

Access is centralized in two `SECURITY DEFINER` functions (file `04`):
- `is_org_admin()` → true for owner/admin.
- `can_access_location(loc uuid)` → true if org-admin OR loc is in the caller's
  `user_locations`.

Every RLS policy is expressed in terms of those two. Single source of truth.

---

## 2. Tables (full DDL in the migrations)

| Table | Purpose |
|---|---|
| `profiles` | Extends `auth.users`; holds `role`. Auto-created on signup. |
| `locations` | One row per venue. `status`: active / coming_soon / inactive. |
| `user_locations` | One-to-many user→location mapping (join table). |
| `kpi_targets` | Org defaults (`location_id IS NULL`) + per-location overrides. |
| `expense_categories` | Editable category list (name, color, sort). |
| `expense_category_keywords` | Keyword→category rules; longest match wins. |
| `daily_metrics` | **Import landing.** Per location, per business day. Snapshot job aggregates this. |
| `period_snapshots` | Weekly auto-snapshots, per-scope (org + location), last 24 kept. |
| `chargebacks` | Per-transaction (Option A). Stage moves Won/In Progress/Lost; tiles sum by stage. |
| `exception_flags` | Theft/audit exceptions. `source`: manual / csv / rule (future). |

`daily_metrics` is the seam between "import" (your Toast/GitHub-Actions pipeline,
out of scope here) and "aggregate" (the snapshot job). The import lands rows
here; the snapshot job reads only this table. That keeps the job source-agnostic.

---

## 3. Weekly snapshot job — pg_cron vs edge function

The snapshot is **pure in-database aggregation**: read `daily_metrics`, write
`period_snapshots`. No external HTTP, no parsing, no third-party API.

| | pg_cron + plpgsql (recommended) | Edge function + scheduled invoke |
|---|---|---|
| Runtime | In Postgres | Deno/TS, separate process |
| Setup | One `cron.schedule()` call | Function deploy + schedule + service-role secret |
| Cold starts | None | Yes |
| External HTTP | No (needs `pg_net`) | Yes, native |
| Transactional w/ DB | Yes, same transaction | No |
| Debug/logging | SQL logs, harder | Better TS logging |
| Best for | DB-only aggregation | Anything calling out (Toast API, email, Slack) |

**Recommendation: pg_cron** for the snapshot (file `11`). It's in-DB,
transactional, no cold start, nothing to deploy. Use an **edge function** only
for the *import* side if you ever pull from Toast's API directly or push alerts
out — but your current plan (scheduled Toast emails → Python/GitHub Actions →
write to `daily_metrics`) keeps that outside Supabase entirely, which is fine.

**Scheduling note:** scheduled at Mondays 12:00 UTC (~8am ET) to clear your late
close (5am business-day rollover) and any Monday-morning import. Adjust the cron
expression in `11` if your import lands later.

---

## 4. Front-end API surface (supabase-js)

Most reads are plain RLS-protected selects; logic lives in a few RPCs.

**Snapshots**
```js
// latest 24 for a scope (RLS enforces access)
supabase.from('period_snapshots').select('*')
  .eq('scope','org').order('period_end',{ascending:false}).limit(24);
supabase.from('period_snapshots').select('*')
  .eq('scope','location').eq('location_id', id)
  .order('period_end',{ascending:false}).limit(24);
// Clear All (admin only)
supabase.rpc('clear_period_snapshots', { p_scope:'org', p_location_id:null });
```

**KPI targets**
```js
supabase.rpc('get_effective_targets', { p_location_id: id }); // override else org
supabase.from('kpi_targets').upsert({...});                   // admin write
supabase.rpc('reset_kpi_targets');                            // restore defaults
```

**Expense mapping**
```js
supabase.from('expense_categories').select('*, expense_category_keywords(*)');
supabase.rpc('match_expense_category', { p_vendor:'SYSCO ATLANTA' }); // tester
supabase.rpc('export_expense_mapping_json');                          // JSON export
// category/keyword CRUD via plain insert/update/delete (admin)
```

**Exceptions**
```js
supabase.from('exception_flags').select('*')
  .eq('status','open').order('occurred_at',{ascending:false}); // RLS-scoped
supabase.from('exception_flags').insert({ ...source:'manual' });
```

**Chargebacks**
```js
supabase.rpc('get_chargeback_totals', { p_location_id:id, p_start, p_end }); // stage tiles
supabase.from('chargebacks').select('*').eq('location_id', id);
supabase.from('chargebacks').insert({...});
supabase.from('chargebacks').update({ stage:'won', resolved_at }).eq('id', cbId);
```

---

## 5. Build order

| Step | File | Verify |
|---|---|---|
| 1 | `01_extensions_enums.sql` | `\dT` shows the enums |
| 2 | `02_profiles_auth.sql` | Create a user in Auth → a `profiles` row appears |
| 3 | `03_locations.sql` | 3 active + R Thomas coming_soon seeded |
| 4 | `04_helpers.sql` | `select is_org_admin();` runs |
| 5 | `05_rls_identity.sql` | Two test users: manager sees only their location |
| 6 | `06_kpi_targets.sql` | `select * from get_effective_targets(<loc>);` returns 5 rows |
| 7 | `07_expense_mapping.sql` | `select * from match_expense_category('SYSCO ATL');` |
| 8 | `08_daily_metrics.sql` | Insert a test day; manager sees only own |
| 9 | `09_snapshots.sql` | `select build_weekly_snapshot('2025-06-16','2025-06-22');` |
| 10 | `10_exceptions_chargebacks.sql` | `select * from get_chargeback_totals(null,null,null);` |
| 11 | `11_cron.sql` | `select * from cron.job;` shows weekly-snapshot |

Stand up 1–5 first and prove the access model with two real test logins before
touching the data tables. If RLS is right, everything above it is safe.

---

## Open items / things to tune later
- **Per-location KPI override writes** are currently admin-only. To let GMs edit
  their own location's overrides, add a policy on `kpi_targets` allowing
  `can_access_location(location_id)` when `location_id IS NOT NULL`.
- **Clearing an exception** is allowed by anyone who can access the location.
  If clearing should be a GM/admin-only control action, tighten the update
  policy on `exception_flags`.
- **Sales denominator** for void%/discount%/cost% is `net_sales`. If Toast
  reports those against gross, swap the denominator in `09`'s function.
- **Expense categories** are seeded with a starter set — replace with your
  actual 11 from the prototype.
