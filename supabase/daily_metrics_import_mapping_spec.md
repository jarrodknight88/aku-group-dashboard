# daily_metrics Import Mapping Spec
### Toast API → Supabase `daily_metrics` — the contract the pull script writes against

**Status:** Draft v1 — endpoint/field names to be confirmed against real API responses
(the "eight sample pulls"). Everything marked ⚠️ VERIFY is a placeholder until then.

---

## 1. The target row

One row per **location per business day**. Unique on `(location_id, business_date)`.
The pull script **upserts** — re-running a day overwrites it, never duplicates it.

| Column | Type | Source | Notes |
|---|---|---|---|
| `location_id` | uuid | Config map (see §3) | Toast restaurant GUID → our locations table |
| `business_date` | date | Toast businessDate | Toast's own business-date field, NOT calendar date of the timestamp (see §4) |
| `net_sales` | numeric | Orders API | Post-discount, pre-tax. ⚠️ VERIFY which Toast amount field = this definition |
| `gross_sales` | numeric | Orders API | Pre-discount, pre-tax |
| `covers` | int | Orders API | Guest count, not check count. ⚠️ VERIFY Toast exposes numberOfGuests per check |
| `food_cost` | numeric | Invoice sheet (NOT Toast) | See §5 — cost side comes from invoices |
| `labor_cost` | numeric | Labor API | Sum of (hours × wage) per time entry for the business day. Straight time |
| `liquor_cost` | numeric | Invoice sheet (NOT Toast) | Same as food_cost — invoice-driven |
| `voids_amount` | numeric | Orders API | Dollar value of voided items/checks for the business day |
| `discounts_amount` | numeric | Orders API | Dollar value of applied discounts/comps |
| `expenses` | numeric | Invoice sheet | Total non-COGS expenses mapped to that day (see §5 timing note) |
| `source` | text | Script constant | e.g. `toast_api_v1` — lets us tell API-era rows from any backfilled CSV rows |

---

## 2. Toast endpoints (to confirm at credential time)

Standard API access is read-only and organized by data area. The scopes we expect
to need when generating credentials:

| Data area | Feeds | Grain needed |
|---|---|---|
| **Orders** | net_sales, gross_sales, covers, voids, discounts | Per-check, per business date |
| **Labor** | labor_cost | Per time entry (in/out, wage, job) |
| **Restaurants / Config** | location GUIDs, revenue centers, dayparts (later) | Static |

⚠️ VERIFY at credential-generation: the exact scope names shown in the Toast Web
credential screen, and that Orders + Labor are available under Standard access for
all four locations. Check every scope that maps to the rows above — scopes are
read-only, so over-checking costs nothing; a missing scope means regenerating later.

**Grain decision this resolves:** if the Orders API returns individual checks with
business dates (expected), we aggregate to daily ourselves — which means **custom
date ranges in the dashboard work perfectly**, no week-boundary snapping. This was
the open question from the range-picker design; the API path answers it favorably.

---

## 3. Location mapping

Toast identifies restaurants by GUID. The script carries a small config map:

```
TOAST_LOCATION_MAP = {
  "<toast-guid-ATL>":     "<supabase-uuid Teranga ATL>",
  "<toast-guid-CLT>":     "<supabase-uuid Teranga CLT>",
  "<toast-guid-AFRO>":    "<supabase-uuid Afro District>",
  "<toast-guid-RTHOMAS>": "<supabase-uuid R Thomas>",   # add at reopen
}
```

Rules:
- A Toast GUID **not in the map** = hard failure with a loud log line, not a silent
  skip. (Catches R Thomas coming online before we've mapped it.)
- Adding a location = one map entry + one `locations` row. No code changes.

---

## 4. Business-day logic — the 5am roll

The single most important correctness rule, encoded once:

- **Use Toast's `businessDate` field on the order/check, never the calendar date
  of the order timestamp.** Toast already rolls late-night sales into the prior
  business day according to each location's configured business-day start time.
- ⚠️ VERIFY per location: the business-day start time configured in Toast matches
  the operating reality (late venues should be ~5:00 AM). If a location is set to
  midnight, a 1:30 AM Saturday check lands on Saturday instead of Friday night and
  every weekend number splits wrong. Check this in Toast Web for all four locations
  **before** the first real import — fixing it after means re-pulling history.
- The pull script requests data **by business date**, not by timestamp window,
  so Toast does the roll for us.

---

## 5. The cost-side join (invoices, not Toast)

`food_cost`, `liquor_cost`, and `expenses` do **not** come from the Toast API —
they come from the invoice intake (Fillout → sheets/Supabase). Two consequences:

**Different cadence.** Sales land daily and automatically; invoices land when
they're entered. A `daily_metrics` row may be written with sales populated and
costs still $0, then updated when invoices post. The upsert handles this: the
invoice-side writer updates only the cost columns on existing rows.

**Timing convention (decide once):** an invoice's cost belongs to the **invoice
date** (simple, deterministic — recommended to start) rather than spread across
days of the covered period (truer but complex). Weekly food% in snapshots
smooths most of the daily lumpiness either way. We can revisit if daily food%
proves too noisy to be useful.

**Denominator rule (already fixed in schema):** food% / labor% / liquor% are
computed downstream as `cost ÷ net_sales`, never stored on this table. Dollars
in, percentages derived — the org rollup recomputes from summed dollars.

---

## 6. Pull script behavior (GitHub Actions)

**Schedule:** daily, 11:00 UTC (~7am ET) — after the 5am close has rolled and
Toast has settled the prior business day. Pulls **yesterday's business date** for
all mapped locations.

**Auth:** POST client ID/secret → token; cache and reuse for the whole run
(tokens live ~1 day; Toast asks for ≤1–2 token requests/day).

**Per location, per run:**
1. Pull orders for the business date → aggregate: net/gross sales, covers,
   voids $, discounts $.
2. Pull labor time entries for the business date → sum hours × wage.
3. Upsert the `daily_metrics` row (cost columns untouched — invoice writer owns those).

**Idempotency & repair:** the script takes an optional date range argument, so
re-pulling any historical window is the same command. Voids/refunds posted late
are handled by re-pulling the affected days (worth a weekly "re-pull last 7 days"
safety pass — decide after observing how often Toast restates).

**Failure posture:** any location failing = nonzero exit + GitHub Actions failure
notification. **No partial-day silent writes** — a day either lands complete for
a location or is logged as missing and retried next run. Silent gaps corrupt
week-over-week deltas invisibly; loud failures get fixed.

**Secrets:** client ID/secret live in GitHub Actions secrets only. Never in the
repo, never in the dashboard, never in chat.

---

## 7. Verification checklist for the first real pull

The "eight sample pulls" — with API access, this is: **Orders + Labor, for two
locations, for two known business dates** (one normal night, one late/heavy night).

Confirm against Toast Web's own reports for those same dates:
- [ ] Net sales matches Toast's Sales Summary for the business date (± rounding)
- [ ] Covers matches guest count (not check count)
- [ ] A post-midnight check landed on the **prior** business date
- [ ] Voids $ and discounts $ match the Void/Discount reports
- [ ] Labor $ matches time entries × wage at straight time
- [ ] Both location GUIDs resolved through the map
- [ ] Re-running the same pull produced identical rows (idempotent), not duplicates

When all seven check out, the pipeline is trustworthy and the dashboard swaps
demo data for live.

---

## Open items (resolve at credential time)
1. Exact scope names to check when generating credentials (Orders, Labor, Config).
2. Toast field name that equals our net_sales definition (post-discount pre-tax).
3. Whether guest count is reliably populated per check at your venues (host-stand
   dependent) — if not, covers may need a fallback definition (e.g., entrée count).
4. Business-day start time config at each of the four locations.
5. Invoice→day timing convention sign-off (invoice date, per §5).
