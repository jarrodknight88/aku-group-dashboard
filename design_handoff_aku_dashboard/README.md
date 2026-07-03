# Handoff: Teranga Ops Dashboard — Design Updates

## Target repository
**`jarrodknight88/aku-group-dashboard`** (main branch)
React 18 + Vite + react-router-dom 6 + Supabase (`@supabase/supabase-js`). Netlify deploy.

Existing pages map 1:1 to the design files in this bundle:

| Design reference (this bundle) | Repo file |
|---|---|
| `Company Glance v2.dc.html` | `src/pages/CompanyGlance.jsx` |
| `By Location.dc.html` | `src/pages/ByLocation.jsx` |
| `Location Report.dc.html` | `src/pages/LocationReport.jsx` |
| `Detail Drill.dc.html` | `src/pages/DetailDrill.jsx` |
| `Exception Detail.dc.html` | `src/pages/ExceptionDetail.jsx` |
| `Settings.dc.html` | `src/pages/Settings.jsx` |
| `Payroll.dc.html` | `src/pages/Payroll.jsx` — **NEW page**: add route `/payroll` + nav item between By Location and Settings |
| `Void Discount Detail.dc.html` | `src/pages/VoidDiscountDetail.jsx` — **NEW page**: route `/void-discount` with `?tab=&loc=` params |

Shared repo modules to keep using: `src/theme.js` (tokens), `src/components/cards.jsx`, `src/components/SectionHeader.jsx`, `src/components/AppHeader.jsx`, `src/components/RangePicker.jsx`, `src/lib/format.js`, `src/data/*` (incl. `topEmployees.js`), `src/state/RangeContext.jsx`, `src/auth/AuthContext.jsx`.

## About the design files
The `.dc.html` files here are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy. (`support.js` is only the prototype runtime so the files open in a browser.) The task is to **recreate the deltas below inside the existing React codebase**, following its established component patterns, tokens, and data hooks — not to port the HTML.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, and copy in the references are final. Where the repo already matches the reference, leave it alone.

---

# WHAT'S NEW — implement these deltas

The repo was built from an earlier version of this design. The following changes were made in the prototype since, and are the point of this handoff. Diff each against the existing implementation before writing code; some may be partially present.

## 1. Chart hover tooltips (Company + Location Report)
Every chart element gets a cursor-following tooltip on hover:
- **Daily Sales by Location** (Company): each bar → `"ATL · Mon · $18.2K"` (location · day · value).
- **Daily Sales** (Location): each bar → `"Mon · $18.2K net sales"`; best day appends `" — best day"`.
- **Voids by Day / Discounts by Day** (both pages): per bar → `"Fri · $460 voided — peak"` / `"Fri · $2,300 discounted — peak"` (append `— peak` on the max bar only).
- **Revenue Streams** stacked bars (both pages): per segment → `"ATL · Food · 58% ($82.5K)"`.
- **Category Performance** rows: whole row → `"Food · $181K · 57% of revenue"`.
- **Revenue Mix / Payment Mix legend rows**: `"Teranga ATL · $142,300 · 45%"`.

Tooltip style: fixed-position, follows cursor at offset (+14px x, −34px y); background `#102C58`, white text, padding `6px 10px`, radius `7px`, font 12px/600, `box-shadow: 0 4px 12px rgba(16,44,88,0.3)`, `pointer-events: none`, `white-space: nowrap`. One shared implementation (e.g. a `useTooltip` hook or small `<HoverTip>` component + `data-tip` attributes with event delegation at the page root) — don't hand-wire per chart.

## 2. Donut charts → per-segment hover (Company Revenue Mix, Location Payment Mix)
Replace conic-gradient donuts with **SVG ring segments** so each slice is its own hover target:
- SVG `viewBox="0 0 120 120"`, rotated −90°; per segment a `<circle cx=60 cy=60 r=50 stroke-width=20 fill=none>` with `stroke-dasharray="<len> 314.2"` and cumulative negative `stroke-dashoffset` (circumference = 314.16).
- Revenue Mix segments: ATL 45% `#184080` / CLT 31% `#4A7BC8` / Afro District 24% `#A9C2E4`; tooltips like `"Teranga ATL · $142,300 · 45%"`.
- Payment Mix segments: Card 71% `#184080`, Amex 12% `#4A7BC8`, Cash 11% `#7FA3D6`, Gift Card 4% `#A9C2E4`, Comp/Other 2% `#D6E0EF`; tooltips like `"Card (Visa/MC) · $101,033 · 71%"`.
- Center label (Revenue Mix only): absolutely-centered overlay, `pointer-events: none`, Newsreader 14px/600 `$317K` + 9px `#9AA1AC` `net`. **Must fit inside the donut hole — this fixes a reported text-overlap bug in the current build.** Hole inner radius = r − strokeWidth/2 (40/60 of the box); keep the label block ≤ ~66% of the donut diameter.

## 3. X-axis labels on Voids/Discounts by Day (both pages)
Under the 7 bars: `Mon Tue Wed Thu Fri Sat Sun` (10px, `#9AA1AC`, centered per column, same flex/gap as the bars), then a centered caption `Day of week` (10px, `#B6BCC6`, 4px top margin).

## 4. Bottom Sellers band (Company + Location Report)
New section directly **after Top Sellers**, before Location Comparison (Company) / before Top Employees (Location):
- Section header: Newsreader 18px/600 `Bottom Sellers` + muted note `· org-wide · lowest movers first` (Company) or `· Teranga ATL · lowest movers first` (Location); hairline; segmented toggle **Bottom by $ / Bottom by Qty** (same control as Top Sellers, active pill `#184080`).
- Three cards (no Category Performance here): **Bottom Food, Bottom Liquor, Bottom Hookah Flavor** — 5 rows each, rank numerals in Newsreader but colored `#9AA1AC` (muted, vs `#184080` on Top lists), lowest value ranked 1.
- Sample org-wide values: Garden Salad $310 · Fried Yuca $380 · Okra Stew $450 · Veggie Samosa $520 · Cassava Fries $590 / Amaretto Sour $180 · Campari Spritz $240 · Malibu Colada $290 · Jameson Neat $340 · Bacardi Mojito $410 / Paan $95 · Vanilla $140 · Cherry $185 · Coconut $230 · Peach $280. (ATL-scoped values in the Location reference file.) Wire to real ProductMix data ascending.

## 5. Top Employees — section-level toggle (Location Report)
The **Top by $ / Top by Qty** toggle moves from the Overall card up to the Top Employees **section header**, and drives all four cards at once:
- **Servers / Bartenders / Hookah** cards re-rank and switch units: `$21,480` ↔ `512 items` / `517 drinks` / `142 hookahs`.
- **Overall** card (navy `#184080` bg) shows three role-tagged leaders — **Most Food Sold / Most Bottles Sold / Most Drinks-Cocktails** — each `name · role` + value, switching with the same toggle ($ ↔ `486 items` / `42 bottles` / `517 drinks`).
- Repo's `src/data/topEmployees.js` should carry both `dollar` and `qty` rankings per group.

## 6. Verify present (earlier changes; implement if missing)
- **Liquor Cost % target** in Settings: editable threshold, default `< 24%`, included in Reset to Defaults, and liquor cells color-code against it wherever shown.
- **Exception page location scoping**: `?loc=<code>` filters table + summary tiles + rule breakdown + title; the location filter chips are **hidden entirely when scoped** (manager view — managers only ever see their own location); back link goes to that location's report. Org view keeps the chips.
- **Money Protected on Location Report** mirrors Company's 2×3 grid: Void % / Voids by Day / Chargebacks by Stage over Discount % / Discounts by Day / Exception Flags tile (tile links to the scoped exception page).

## 7. Exception review flow — click-in + approve/deny (ExceptionDetail)
Every row in the exception table is clickable (cursor pointer, `#F8FAFC` hover) and opens a **detail modal** (660px card, dark backdrop):
- Header: rule name (Newsreader 20/600), severity pill, colored status text; ✕ close.
- 3-column field grid: Date/Time, Location, Check #, Server, Flagged Amount (bold), Check Total, Card.
- Rule-specific guidance note in a `#F4F6F8` box (copy per rule is in the reference file's `RULE_NOTES`).
- Footer actions: **✕ Deny** (white bg, `#F0C4BE` border, `#C0392B` text) and **✓ Approve** (solid `#1A7F4B`). Acting updates the row's status and closes the modal.

**Status model** (replaces the old open/cleared pair): `open` (● red) · `held` (⏳ navy `#184080`, shows release date) · `released` (✓ green, shows date) · `cleared/approved` (✓ green; for tips displays "✓ Releases <date>") · `denied` (✕ red). Summary tiles: **$ at Risk = open + held**; **Cleared tile counts approved + denied + released**. Persist review actions per transaction (exceptions table: `status`, `reviewed_by`, `reviewed_at`).

## 8. Large-tip auto-hold rule ($500 / 14 days)
Business rule, evaluated automatically at data-import time:
- Any **single-transaction tip > $500** auto-creates an exception: rule "Tip over $500 — auto-hold", severity High, status `held`.
- The tip is **held 14 days** from the transaction date (chargeback window) before it can be paid out.
- In the modal, held tips show a **hold timeline strip** (`#E8EEF6` box): Flagged <date> → 14-day hold ends <date> → Payout <run label>.
- Approve on a held tip reads **"Approve & Release <date>"** — it schedules release at hold end (not immediate payout). Deny keeps the tip withheld pending investigation.
- Threshold ($500) and hold length (14 days) should be config constants (future Settings surface), not hardcoded.
- Suggested data model: `tip_holds` (transaction ref, server, amount, flagged_at, release_at, status held/released/denied, released_run_id). A release job attaches released holds to the next payroll run.

## 9. Payroll page (NEW — `Payroll.dc.html`)
New top-level screen implementing the group's payroll process.

**Core check math:** `check = (total hours × rate) + tips owed`. **Overtime hours are paid at the regular rate — no 1.5×**; the export sends all hours as regular earnings (OT shown in its own read-only column). Hours + rates come from the Toast payroll export; tips owed + tip-out come from the nightly reconciliation Google Sheet (tips owed is already **net of tip-out**; tip-out is a reference-only column). Rows are matched Toast-name ↔ sheet-name: unmatched rows get a red **● Review** pill and their tips are excluded from the check until resolved.

**Two views** driven by the location filter:
- **All locations = company dashboard**: per-location rollup table (employees, hours, wages, tips, salaries, total, status ✓ Ready / ● N needs review, "Open run →") with a company-total row; **Previous Payrolls** table with the current period pinned (CURRENT badge, "In progress") above past runs (period, checks dated, employees, wages, tips, salaries, total, ✓ Exported pill + batch ID, ⤓ View).
- **Single location = run view**: hourly employee table (hours, of-which-OT, rate, hourly pay, tips owed, tip-out ref, match status, check total, totals row); **salaried employees** table with a working add-row (name, location select, role, $ per period → + Add; salaried are manual, not in Toast); that location's **Previous Payrolls** (its share of each exported batch, each with ⤓ View).

**Held/released tip notation on the payroll sheet** (ties to section 8):
- A held tip is **excluded** from the server's tips owed; the tips cell shows a navy sub-note: `− $640.00 held · rel Oct 4`.
- A released hold is **added** to the next run's check; the tips cell shows a green sub-note: `+ $780.00 released Sep 29`.
- The Tips summary tile subtitle shows total held; a blue chip `⏳ $640.00 in large tips held` links to the exception page.
- Math: `payable tips = sheet tips (net of tip-out) + released holds`; held amounts excluded.

**ADP export:** button opens a preview modal (works in both views, and for any archived batch via ⤓ View). Batch CSV columns: `Co Code` (per location: TGA / TGC / AFD), `Batch ID`, `File #`, `Employee`, `Reg Hours`, `Reg Rate`, `Reg Earnings`, `Code` (T = tips), `Tips Amt`, `Salary`. Salaried rows carry zero hours and the salary column. On real export, store the generated CSV per batch so previous runs show **exactly what was exported** (org-wide or location-scoped). Suggested tables: `payroll_runs`, `payroll_lines`, plus `tip_holds` above. Column template must be confirmed against the group's actual ADP product before wiring.

## 10. Void & Discount drill-down (NEW — `Void Discount Detail.dc.html`)
New page reached by clicking the **Void %** or **Discount %** tiles in Money Protected on Company (`?tab=void` / `?tab=discount`) and on Location Report (adds `&loc=atl`); the tiles get a `Details →` affordance and become links. Scoping matches the exception page: `?loc=` filters everything, back link goes to that location's report; no loc = org-wide.

- **Tabs**: Voids ⬌ Discounts (also settable via `?tab=`). **Global By $ / By Qty toggle** drives every module on the page.
- **Summary strip**: Total Voided/Discounted (navy tile; $ or count per toggle) · % of Sales vs target (green/red, same thresholds: void 1%, discount 3%) · Peak Day · Employees Over Target (red count vs the *personal* target below).
- **Voids by Reason / Discounts by Type**: ranked horizontal bars in the blue ramp, values switching $ ↔ qty. Void reasons come from Toast's void-reason field; discount types from the configured discount buttons (Birthday 20%, Industry 15%, Manager comp, Happy Hour, Employee meal 50%, Loyalty).
- **Most Voided / Most Discounted Items**: top-5 ranked list, re-ranks on toggle.
- **By Employee table**: Employee · Role · Location · $ · Items/Checks · **% of Own Sales** (voided/discounted dollars ÷ that employee's net sales) · Status pill. Rows over the personal target (void > 1%, discount > 3% of own sales) get red-tinted % cell and "● Over target"; within shows "✓ Within". Sorts by the active toggle metric.
- Data sources: Toast VoidDetails (reasons, items, employees) + discount detail from SalesSummary/ProductMix; employee net sales from the payroll/sales export for the % calc.

## 11. Enterprise UX pass (site-wide) — the .dc.html files win
The reference files include a site-wide refinement NEWER than sections 1–6; wherever a reference file and this README differ, **the file wins**.
- Joined KPI stat rows (1px-gap grid in one bordered container, 10px small-caps labels, 26–28px Newsreader figures) replace floating KPI cards on Company, Location Report, Exceptions.
- No emoji glyphs anywhere; statuses are 6px dots + text.
- Breadcrumb trails replace "← Back" links on drill pages; every page title is 26px Newsreader with a metadata line: period · scope · "Last synced …" + data source.
- Responsive: auto-fit grids throughout; wide tables scroll horizontally inside their cards (min-width on the table); headers/toolbars wrap. Voids & Discounts renders its employee table as stacked cards below 720px (resize-listener pattern) — reuse for other tables on mobile.
- Compact header (Company = reference): brand left, nav right, date control REMOVED from the header.
- Date-range picker lives in the page title row (Company = reference implementation): trigger shows preset + range + "Compared to:" line; panel = preset rail (This Week, Last Week, This Month, Last Month, Last 7/30/90 Days, Custom Range) + two month-anchored calendars with ‹ › nav + live "Compared to: … preceding period of equal length" footer + Cancel/Apply; custom range = two day-clicks; single-day ranges format as "Jul 11, 2025"; the committed window drives every delta ("vs prior period").
- Nav dropdowns (Company = reference): By Location hover menu (All locations / Teranga ATL / Teranga CLT / Afro District / "R Thomas · coming soon"; location items deep-link to that location's report; the tab itself still goes to the hub). Settings hover menu (Config / Account / Log out, log out in red).
- Settings: new **Account** tab (`?tab=account` deep link) with Profile + Password cards and a top-right **Sign out**; access model — location managers see only Account (+ Log out) and their own location's data; owners also see the config tabs.
- Roll the compact header + picker + dropdowns to ALL pages — only Company has them in the references so far.

---

# Reference spec (unchanged system — for context)

## Design tokens
- **Primary:** Teranga Blue `#184080`; deep navy `#102C58` (gradients, tooltips, P&L footer).
- **Blue ramp (charts):** `#4A7BC8` → `#7FA3D6` → `#9DB6DC` → `#A9C2E4` → `#C4D6EC` → `#D6E0EF` → `#E8EEF6`.
- **Ground** `#EEF0F3`; cards `#FFFFFF`; borders `#E4E7EC` (cards), `#DFE3E8` (section hairlines), `#EEF0F3`/`#F4F6F8` (row dividers/fills); input border `#D6DBE2`.
- **Text:** `#1A2230` primary; `#3A4150`/`#5A626E`/`#6B7280` secondary; `#9AA1AC` muted; `#B6BCC6` faint.
- **Status green:** text `#1A7F4B`, dot `#22A55F`, bg `#E6F4EC`, border `#C8E6D4`. **Status red:** text `#C0392B`, dot `#E04A38`, bg `#FBEAE8`, border `#F0C4BE`. Used ONLY for target status, deltas, severity, chargeback stages.
- **Type:** Hanken Grotesk (400–800) for UI; Newsreader (opsz, 400–600) for headline figures, section titles, rank numerals. Tabular numerals (`font-variant-numeric: tabular-nums`) on all data.
- **Radii:** 13px cards, 9–10px inner tiles/pills, 8px inputs, 7px tooltips/toggles. Section header pattern: serif title + 1px hairline flex-fill + optional right-aligned control.
- **KPI targets (defaults):** Void < 1%, Discount < 3%, Food < 30%, Labor < 28%, Liquor < 24% (editable). Green within / red out; tinted cell backgrounds for out-of-target table cells.

## Screens (all in this bundle, open in any browser)
- **Company Glance** — headline strip (Net Sales, Covers, Avg Check, Valet + delta pills vs comparison period); Money In (Daily Sales by Location, Revenue Mix donut, Revenue Streams); Money Saved (Food/Labor/Liquor/Total Expenses tiles); Money Protected (2×3: Void%, Voids by Day, Chargebacks Won/In-Progress/Lost, Discount%, Discounts by Day, Exception Flags tile); Top Sellers (+toggle); **Bottom Sellers (+toggle, NEW)**; Location Comparison table with target-tinted cells.
- **By Location** — hub with one card per location (KPI chips ordered Food · Liquor · Labor · Void · Disc), linking into Location Report. Locations are config-driven; R Thomas shows as "coming soon".
- **Location Report** — same structure as Company scoped to one venue: headline strip; Money In (Daily Sales, Payment Mix donut, Revenue Streams); Money Saved (4 tiles, no daily chart); Money Protected (mirror); Top Sellers; **Bottom Sellers (NEW)**; **Top Employees (Servers/Bartenders/Hookah/Overall + section toggle, UPDATED)**.
- **Detail Drill** — Top Food/Liquor/Hookah with working $/Qty toggle; Payment Methods table (txns, volume, avg tx, tips, share); Void/Exception preview card → scoped exception page; Monthly P&L (revenue lines → net sales → costs → Net Operating Income + margin footer).
- **Exception Detail** — summary strip (Total, $ at Risk = open + held, Open, Cleared); Flags by Audit Rule bars; filter bar; clickable transaction rows → review modal with approve/deny (see section 7); large-tip holds with release dates (section 8). Audit rules are placeholders — final rules TBD by owner.
- **Payroll** — company payroll dashboard + per-location run views, salaried add, held/released tip notation, ADP export preview (full spec in section 9).
- **Void & Discount Detail** — tabbed drill-down with reason/type breakdowns and by-employee accountability (full spec in section 10).
- **Settings** — three tabs: KPI Targets (editable + Reset to Defaults), Period History (24 auto-snapshots, Clear All; backed by Supabase `period_snapshots`), Expense Category Mapping (keyword→category, longest-match-wins, vendor tester, category list, JSON export).

## Interactions & state
- Global: date-range picker with presets + "Compared to:" line (immediately preceding period of equal length); every delta measures against it. Nav: Company / By Location / Settings + back links. Level flow: Company → By Location → Location Report → Detail Drill / Exceptions.
- Toggles are single-state switches re-ranking lists ($ ↔ Qty). Tooltip state is transient hover state (see delta #1).
- Access model: owners see org-wide; location managers see only their location (Supabase Auth + RLS; exception page scoping is the visible half of this).

## Assets
No image assets. Fonts via Google Fonts (Hanken Grotesk, Newsreader). All charts are DOM/SVG — no chart library required; keep it that way for parity.

## Files in this bundle
`Company Glance v2.dc.html`, `By Location.dc.html`, `Location Report.dc.html`, `Detail Drill.dc.html`, `Exception Detail.dc.html`, `Settings.dc.html`, `Payroll.dc.html`, `Void Discount Detail.dc.html`, `support.js` (prototype runtime only).

---

# Suggested Claude Code prompt

> In `jarrodknight88/aku-group-dashboard`, apply the design updates in `design_handoff_aku_dashboard/README.md` — sections "WHAT'S NEW" 1–11, with section 11 (enterprise UX pass) taking precedence and the `.dc.html` reference files as the visual source of truth wherever they differ from the README. IMPORTANT: this repo has hand-made changes newer than these references — treat the existing business logic in the codebase, especially the payroll calculation logic (hours × rate + tips, straight-time overtime, Toast ↔ tips-sheet matching), as authoritative and do NOT rewrite or contradict it; diff each section against the current code first and implement only what's missing or purely visual. For the $500 large-tip auto-hold (sections 8–9): implement it as an additive layer on the existing payroll logic — exclude held tips from tips owed with the navy "− $… held · rel <date>" cell note, add released holds to a later run's check with the green "+ $… released <date>" note, and wire the exception status flow (held → Approve & Release <date> / Deny) — but BEFORE implementing, ask clarifying questions about any gray areas, e.g.: does the $500 threshold apply to a single transaction's tip only; card tips only or cash too; which payroll run a released tip lands on; who can approve a release; what Deny does to the money; and where the $500 / 14-day values should be configurable. Work within the existing React patterns (tokens from `src/theme.js`, shared components, existing data hooks); build the shared tooltip, the date-range picker, and the nav dropdowns ONCE each and reuse them on every page; roll the compact header + picker + dropdowns site-wide. Don't restyle anything the references don't change.
