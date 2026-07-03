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
- **Exception Detail** — summary strip (Total, $ at Risk, Open, Cleared); Flags by Audit Rule bars; filter bar; transaction table (date/time, location, check #, server, rule, amount, severity pill, status). Audit rules are placeholders — final rules TBD by owner.
- **Settings** — three tabs: KPI Targets (editable + Reset to Defaults), Period History (24 auto-snapshots, Clear All; backed by Supabase `period_snapshots`), Expense Category Mapping (keyword→category, longest-match-wins, vendor tester, category list, JSON export).

## Interactions & state
- Global: date-range picker with presets + "Compared to:" line (immediately preceding period of equal length); every delta measures against it. Nav: Company / By Location / Settings + back links. Level flow: Company → By Location → Location Report → Detail Drill / Exceptions.
- Toggles are single-state switches re-ranking lists ($ ↔ Qty). Tooltip state is transient hover state (see delta #1).
- Access model: owners see org-wide; location managers see only their location (Supabase Auth + RLS; exception page scoping is the visible half of this).

## Assets
No image assets. Fonts via Google Fonts (Hanken Grotesk, Newsreader). All charts are DOM/SVG — no chart library required; keep it that way for parity.

## Files in this bundle
`Company Glance v2.dc.html`, `By Location.dc.html`, `Location Report.dc.html`, `Detail Drill.dc.html`, `Exception Detail.dc.html`, `Settings.dc.html`, `support.js` (prototype runtime only).

---

# Suggested Claude Code prompt

> In `jarrodknight88/aku-group-dashboard`, implement the design updates described in `design_handoff_aku_dashboard/README.md` (section "WHAT'S NEW"). The `.dc.html` files in that folder are the visual source of truth — open them in a browser to compare. Work within the existing React patterns: tokens from `src/theme.js`, shared cards/sections from `src/components`, data through `src/data/useDashboardData.js`. Implement the shared tooltip once and reuse it across `CompanyGlance.jsx` and `LocationReport.jsx`. Check section 6 ("Verify present") against the current code and only add what's missing. Don't restyle anything the references don't change.
