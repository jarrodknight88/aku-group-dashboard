#!/usr/bin/env node
/**
 * Toast → Supabase daily_metrics pull.
 * Implements supabase/daily_metrics_import_mapping_spec.md.
 *
 * Usage:
 *   node scripts/toast-pull/pull.mjs                     # yesterday's business date
 *   node scripts/toast-pull/pull.mjs 2026-06-29          # one specific date
 *   node scripts/toast-pull/pull.mjs 2026-06-23 2026-06-29   # inclusive range (repair/backfill)
 *   DRY_RUN=1 node scripts/toast-pull/pull.mjs ...       # aggregate + print, write nothing
 *
 * Env (GitHub Actions secrets):
 *   TOAST_API_HOST            e.g. https://ws-api.toasttab.com
 *   TOAST_CLIENT_ID
 *   TOAST_CLIENT_SECRET
 *   TOAST_LOCATION_MAP        JSON: { "<toast-restaurant-guid>": "<location code e.g. ATL>", ... }
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (bypasses RLS; sales columns only — invoice writer owns cost columns)
 */

import { createClient } from '@supabase/supabase-js'

const {
  TOAST_API_HOST = 'https://ws-api.toasttab.com',
  TOAST_CLIENT_ID,
  TOAST_CLIENT_SECRET,
  TOAST_LOCATION_MAP,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  DRY_RUN,
} = process.env

const dryRun = DRY_RUN === '1' || DRY_RUN === 'true'

function fail(msg) {
  console.error(`FATAL: ${msg}`)
  process.exit(1)
}

for (const [k, v] of Object.entries({ TOAST_CLIENT_ID, TOAST_CLIENT_SECRET, TOAST_LOCATION_MAP })) {
  if (!v) fail(`missing env ${k}`)
}
if (!dryRun) {
  for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
    if (!v) fail(`missing env ${k}`)
  }
}

/** Toast GUID → our location code (ATL/CLT/AFRO/...). Codes resolve to uuids at runtime. */
let locationMap
try {
  locationMap = JSON.parse(TOAST_LOCATION_MAP)
} catch {
  fail('TOAST_LOCATION_MAP is not valid JSON')
}

/* ---------- dates ---------- */

const iso = (d) => d.toISOString().slice(0, 10)
const toToastDate = (isoDate) => isoDate.replaceAll('-', '') // yyyyMMdd

function datesInRange(startIso, endIso) {
  const out = []
  const d = new Date(startIso + 'T00:00:00Z')
  const end = new Date(endIso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime()) || d > end) {
    fail(`bad date range ${startIso}..${endIso}`)
  }
  while (d <= end) {
    out.push(iso(d))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

const [argStart, argEnd] = process.argv.slice(2)
let dates
if (argStart) {
  dates = datesInRange(argStart, argEnd || argStart)
} else {
  const y = new Date()
  y.setUTCDate(y.getUTCDate() - 1)
  dates = [iso(y)] // yesterday's business date (job runs 11:00 UTC, after the 5am roll)
}

/* ---------- toast api ---------- */

let toastToken = null

async function toastAuth() {
  const res = await fetch(`${TOAST_API_HOST}/authentication/v1/authentication/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: TOAST_CLIENT_ID,
      clientSecret: TOAST_CLIENT_SECRET,
      userAccessType: 'TOAST_MACHINE_CLIENT',
    }),
  })
  if (!res.ok) fail(`Toast auth failed: ${res.status} ${await res.text()}`)
  const body = await res.json()
  toastToken = body?.token?.accessToken
  if (!toastToken) fail('Toast auth: no accessToken in response')
}

async function toastGet(path, restaurantGuid, params = {}) {
  const url = new URL(TOAST_API_HOST + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${toastToken}`,
      'Toast-Restaurant-External-ID': restaurantGuid,
    },
  })
  if (res.status === 429) {
    // basic rate-limit backoff, then retry once
    await new Promise((r) => setTimeout(r, 5000))
    return toastGet(path, restaurantGuid, params)
  }
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

/** Paginated orders for one business date. */
async function fetchOrders(restaurantGuid, businessDate) {
  const orders = []
  let page = 1
  for (;;) {
    const batch = await toastGet('/orders/v2/ordersBulk', restaurantGuid, {
      businessDate: toToastDate(businessDate),
      page: String(page),
      pageSize: '100',
    })
    if (!Array.isArray(batch) || batch.length === 0) break
    orders.push(...batch)
    if (batch.length < 100) break
    page += 1
  }
  return orders
}

async function fetchTimeEntries(restaurantGuid, businessDate) {
  const entries = await toastGet('/labor/v1/timeEntries', restaurantGuid, {
    businessDate: toToastDate(businessDate),
  })
  return Array.isArray(entries) ? entries : []
}

/* ---------- aggregation (⚠ VERIFY block — confirm against Toast Web on sample pulls) ---------- */

const cents = (n) => Math.round((Number(n) || 0) * 100)

/**
 * Aggregate one business day's orders.
 * Field mapping is the part the spec marks ⚠ VERIFY — confirm each against
 * Toast Web's Sales Summary / Void / Discount reports for the sample dates,
 * then adjust here in ONE place.
 */
function aggregateOrders(orders) {
  let netC = 0
  let grossC = 0
  let covers = 0
  let voidsC = 0
  let discountsC = 0

  for (const order of orders) {
    if (order.voided) {
      // Fully voided order: contributes to voids, not to sales.
      for (const check of order.checks ?? []) {
        for (const sel of check.selections ?? []) voidsC += cents(sel.price)
      }
      continue
    }
    // ⚠ VERIFY covers: numberOfGuests per order (host-stand dependent).
    covers += Number(order.numberOfGuests) || 0

    for (const check of order.checks ?? []) {
      if (check.voided) {
        for (const sel of check.selections ?? []) voidsC += cents(sel.price)
        continue
      }
      // ⚠ VERIFY net_sales: check.amount = post-discount, pre-tax.
      netC += cents(check.amount)

      for (const disc of check.appliedDiscounts ?? []) {
        discountsC += cents(disc.discountAmount)
      }
      for (const sel of check.selections ?? []) {
        if (sel.voided) {
          voidsC += cents(sel.price)
          continue
        }
        // ⚠ VERIFY gross_sales: pre-discount pre-tax = sum of non-void selection prices.
        grossC += cents(sel.price)
        for (const d of sel.appliedDiscounts ?? []) discountsC += cents(d.discountAmount)
      }
    }
  }

  return {
    net_sales: netC / 100,
    gross_sales: grossC / 100,
    covers,
    voids_amount: voidsC / 100,
    discounts_amount: discountsC / 100,
    order_count: orders.length,
  }
}

/**
 * Straight-time labor: hours × wage, no OT premium (per spec §1).
 * ⚠ VERIFY field names (regularHours/overtimeHours/hourlyWage) on first pull.
 */
function aggregateLabor(entries) {
  let laborC = 0
  for (const e of entries) {
    const hours = (Number(e.regularHours) || 0) + (Number(e.overtimeHours) || 0)
    laborC += Math.round(hours * (Number(e.hourlyWage) || 0) * 100)
  }
  return { labor_cost: laborC / 100, entry_count: entries.length }
}

/* ---------- supabase ---------- */

const supabase = dryRun ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

/** Resolve location code → uuid from the locations table (no hardcoded uuids). */
async function resolveLocations() {
  if (dryRun) return {}
  const { data, error } = await supabase.from('locations').select('id, code')
  if (error) fail(`locations lookup failed: ${error.message}`)
  return Object.fromEntries(data.map((l) => [l.code, l.id]))
}

/**
 * Upsert the sales side of one (location, business_date) row.
 * Cost columns (food_cost, liquor_cost, expenses) are OWNED BY THE INVOICE
 * WRITER — on conflict we update only the columns listed here.
 */
async function upsertDay(locationId, businessDate, sales, labor) {
  const row = {
    location_id: locationId,
    business_date: businessDate,
    net_sales: sales.net_sales,
    gross_sales: sales.gross_sales,
    covers: sales.covers,
    voids_amount: sales.voids_amount,
    discounts_amount: sales.discounts_amount,
    labor_cost: labor.labor_cost,
    source: 'toast_api_v1',
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('daily_metrics')
    .upsert(row, { onConflict: 'location_id,business_date' })
  if (error) throw new Error(`upsert failed: ${error.message}`)
}

/* ---------- main ---------- */

console.log(`Toast pull — dates: ${dates[0]}${dates.length > 1 ? '..' + dates.at(-1) : ''}` +
  ` · locations: ${Object.values(locationMap).join(', ')}${dryRun ? ' · DRY RUN' : ''}`)

await toastAuth()
const codeToUuid = await resolveLocations()

const failures = []

for (const [guid, code] of Object.entries(locationMap)) {
  const locationId = dryRun ? null : codeToUuid[code]
  if (!dryRun && !locationId) {
    // Spec §3: unmapped = hard failure, never a silent skip.
    failures.push(`${code}: no locations row with this code — add it before importing`)
    continue
  }

  for (const businessDate of dates) {
    try {
      const [orders, entries] = await Promise.all([
        fetchOrders(guid, businessDate),
        fetchTimeEntries(guid, businessDate),
      ])
      const sales = aggregateOrders(orders)
      const labor = aggregateLabor(entries)

      console.log(
        `${code} ${businessDate}: net $${sales.net_sales.toFixed(2)} · gross $${sales.gross_sales.toFixed(2)}` +
        ` · covers ${sales.covers} · voids $${sales.voids_amount.toFixed(2)}` +
        ` · disc $${sales.discounts_amount.toFixed(2)} · labor $${labor.labor_cost.toFixed(2)}` +
        ` (${sales.order_count} orders, ${labor.entry_count} time entries)`
      )

      if (!dryRun) await upsertDay(locationId, businessDate, sales, labor)
    } catch (err) {
      // Spec §6: no partial-day silent writes — log loud, fail the run.
      failures.push(`${code} ${businessDate}: ${err.message}`)
    }
  }
}

if (failures.length) {
  console.error('\nFAILED days (re-run with a date range to repair):')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(dryRun ? '\nDry run complete — nothing written.' : '\nAll days landed.')
