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
 *   TOAST_ACCOUNTS            JSON array — one entry per Toast credential set:
 *                             [{ "name": "teranga", "host": "https://ws-api.toasttab.com",
 *                                "clientId": "…", "clientSecret": "…",
 *                                "locations": { "<toast-restaurant-guid>": "<location code>" } }, …]
 *                             Locations on separate Toast accounts (different client id/secret)
 *                             are just separate entries. `host` is optional (defaults to prod).
 *   — or, for a single credential set, the legacy flat form —
 *   TOAST_API_HOST, TOAST_CLIENT_ID, TOAST_CLIENT_SECRET, TOAST_LOCATION_MAP
 *
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (bypasses RLS; sales columns only — invoice writer owns cost columns)
 */

import { createClient } from '@supabase/supabase-js'

const {
  TOAST_ACCOUNTS,
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

// Supabase is only needed when actually writing (not for dry runs or --discover).
if (!dryRun && !process.argv.includes('--discover')) {
  for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
    if (!v) fail(`missing env ${k}`)
  }
}

/**
 * Normalize config to a list of accounts:
 *   { name, host, clientId, clientSecret, locations: { guid → code } }
 * Codes resolve to location uuids at runtime.
 */
function loadAccounts() {
  if (TOAST_ACCOUNTS) {
    let accounts
    try {
      accounts = JSON.parse(TOAST_ACCOUNTS)
    } catch {
      fail('TOAST_ACCOUNTS is not valid JSON')
    }
    if (!Array.isArray(accounts) || accounts.length === 0) fail('TOAST_ACCOUNTS must be a non-empty array')
    return accounts.map((a, i) => {
      if (!a.clientId || !a.clientSecret) fail(`TOAST_ACCOUNTS[${i}]: missing clientId/clientSecret`)
      // --discover works before GUIDs are known; a real pull requires the map.
      if (!process.argv.includes('--discover') && (!a.locations || !Object.keys(a.locations).length)) {
        fail(`TOAST_ACCOUNTS[${i}]: missing locations map`)
      }
      return {
        name: a.name || `account-${i + 1}`,
        host: a.host || 'https://ws-api.toasttab.com',
        clientId: a.clientId,
        clientSecret: a.clientSecret,
        locations: a.locations || {},
      }
    })
  }
  // Legacy single-account form.
  for (const [k, v] of Object.entries({ TOAST_CLIENT_ID, TOAST_CLIENT_SECRET, TOAST_LOCATION_MAP })) {
    if (!v) fail(`missing env ${k} (or provide TOAST_ACCOUNTS)`)
  }
  let locations
  try {
    locations = JSON.parse(TOAST_LOCATION_MAP)
  } catch {
    fail('TOAST_LOCATION_MAP is not valid JSON')
  }
  return [{ name: 'default', host: TOAST_API_HOST, clientId: TOAST_CLIENT_ID, clientSecret: TOAST_CLIENT_SECRET, locations }]
}

const accounts = loadAccounts()

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const rawArgs = process.argv.slice(2)
const discoverMode = rawArgs.includes('--discover')
const candidateGuidArgs = rawArgs.filter((a) => UUID_RE.test(a))
const dateArgs = rawArgs.filter((a) => a !== '--discover' && !UUID_RE.test(a))

const [argStart, argEnd] = dateArgs
let dates
if (argStart) {
  dates = datesInRange(argStart, argEnd || argStart)
} else {
  const y = new Date()
  y.setUTCDate(y.getUTCDate() - 1)
  dates = [iso(y)] // yesterday's business date (job runs 11:00 UTC, after the 5am roll)
}

/* ---------- toast api (per account) ---------- */

async function toastAuth(account) {
  const res = await fetch(`${account.host}/authentication/v1/authentication/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      userAccessType: 'TOAST_MACHINE_CLIENT',
    }),
  })
  if (!res.ok) throw new Error(`Toast auth failed (${account.name}): ${res.status} ${await res.text()}`)
  const body = await res.json()
  const token = body?.token?.accessToken
  if (!token) throw new Error(`Toast auth (${account.name}): no accessToken in response`)
  return token
}

async function toastGet(account, token, path, restaurantGuid, params = {}) {
  const url = new URL(account.host + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers = { authorization: `Bearer ${token}` }
  if (restaurantGuid) headers['Toast-Restaurant-External-ID'] = restaurantGuid
  const res = await fetch(url, { headers })
  if (res.status === 429) {
    // basic rate-limit backoff, then retry once
    await new Promise((r) => setTimeout(r, 5000))
    return toastGet(account, token, path, restaurantGuid, params)
  }
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

/** Paginated orders for one business date. */
async function fetchOrders(account, token, restaurantGuid, businessDate) {
  const orders = []
  let page = 1
  for (;;) {
    const batch = await toastGet(account, token, '/orders/v2/ordersBulk', restaurantGuid, {
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

async function fetchTimeEntries(account, token, restaurantGuid, businessDate) {
  const entries = await toastGet(account, token, '/labor/v1/timeEntries', restaurantGuid, {
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

/* ---------- discover mode ---------- */

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  } catch {
    return null
  }
}

/**
 * The token declares what the credential can do. Surface anything that looks
 * like scope/permission claims so a 403 can be diagnosed as "scope missing"
 * vs "restaurant not attached" without guessing.
 */
function describeTokenClaims(payload) {
  if (!payload) return []
  const lines = []
  for (const [k, v] of Object.entries(payload)) {
    const key = k.toLowerCase()
    if (key.includes('scope') || key.includes('permission') || key.includes('access') || key === 'aud') {
      const val = Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : String(v)
      lines.push(`${k}: ${val}`)
    }
  }
  return lines
}

/** Pull every uuid-shaped string out of a decoded JWT payload. */
function uuidsInToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    const found = new Set()
    const walk = (v) => {
      if (typeof v === 'string' && UUID_RE.test(v)) found.add(v.toLowerCase())
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(payload)
    return [...found]
  } catch {
    return []
  }
}

/**
 * A GUID embedded in the token is often the MANAGEMENT GROUP, not a
 * restaurant (a restaurant probe on it 404s). This endpoint enumerates the
 * restaurants under a group — the definitive way to find restaurant GUIDs.
 */
async function probeAsGroup(account, token, guid) {
  // With and without the restaurant header — group endpoints vary on this.
  for (const header of [guid, null]) {
    try {
      const r = await toastGet(account, token, `/restaurants/v1/groups/${guid}/restaurants`, header)
      if (Array.isArray(r) && r.length) return { members: r }
    } catch (err) {
      if (header === null) return { why: err.message }
    }
  }
  return { why: 'empty response' }
}

/** Partner-style enumeration — some credentials can list their restaurants directly. */
async function probePartnerList(account, token) {
  try {
    const r = await toastGet(account, token, '/partners/v1/restaurants', null)
    return Array.isArray(r) && r.length ? { members: r } : { why: 'empty response' }
  } catch (err) {
    return { why: err.message }
  }
}

/**
 * Validate a candidate restaurant GUID against a credential.
 * Primary: Restaurants API (returns the venue name + business-day closeout hour —
 * the spec §4 check for free). Fallback if that scope wasn't granted: probe the
 * Orders API, which proves access without naming the venue.
 */
async function probeGuid(account, token, guid) {
  try {
    const r = await toastGet(account, token, `/restaurants/v1/restaurants/${guid}`, guid)
    const g = r?.general ?? r ?? {}
    return {
      ok: true,
      name: g.name || r?.name || '(name not in response)',
      locationName: g.locationName || '',
      closeoutHour: g.closeoutHour ?? r?.closeoutHour ?? 'n/a',
      timeZone: g.timeZone || r?.timeZone || '',
    }
  } catch (err) {
    if (!/→ 40[134]/.test(err.message)) return { ok: false, why: err.message }
    // Restaurants scope may not be granted — prove access via a 1-order probe.
    try {
      await toastGet(account, token, '/orders/v2/ordersBulk', guid, {
        businessDate: toToastDate(dates[0]),
        page: '1',
        pageSize: '1',
      })
      return { ok: true, name: '(accessible — restaurants scope not granted, no name available)' }
    } catch (err2) {
      // Report both probes so scope-vs-attachment is diagnosable from the log.
      return { ok: false, why: `restaurants probe: ${err.message} · orders probe: ${err2.message}` }
    }
  }
}

if (discoverMode) {
  console.log('DISCOVER — validating restaurant GUIDs per credential; nothing is written.\n')
  let anyFailure = false

  for (const account of accounts) {
    console.log(`── account: ${account.name}`)
    let token
    try {
      token = await toastAuth(account)
    } catch (err) {
      console.log(`   AUTH FAILED: ${err.message}`)
      anyFailure = true
      continue
    }
    console.log('   auth OK')

    const claimLines = describeTokenClaims(decodeJwtPayload(token))
    if (claimLines.length) {
      console.log('   token claims (what this credential was granted):')
      for (const l of claimLines) console.log(`     · ${l}`)
    } else {
      console.log('   token claims: none visible — scopes not embedded in this token format')
    }

    const tokenGuids = uuidsInToken(token)
    if (tokenGuids.length) {
      console.log(`   GUIDs referenced inside the credential's token: ${tokenGuids.join(', ')}`)
    }

    // Some credentials can enumerate their restaurants directly.
    const partner = await probePartnerList(account, token)
    if (partner.members) {
      console.log(`   ◈ partner listing found ${partner.members.length} restaurant(s):`)
      for (const m of partner.members) console.log(`     · ${JSON.stringify(m)}`)
    } else {
      console.log(`   partner listing: not available (${partner.why})`)
    }

    const candidates = [
      ...new Set([
        ...Object.keys(account.locations).filter((g) => UUID_RE.test(g)),
        ...candidateGuidArgs,
        ...tokenGuids,
        ...(partner.members ?? [])
          .map((m) => m.restaurantGuid || m.guid || m.id)
          .filter((g) => g && UUID_RE.test(g)),
      ]),
    ]
    if (!candidates.length) {
      console.log('   no candidate GUIDs to test — pass GUIDs as arguments or put them in the locations map')
      continue
    }

    for (const guid of candidates) {
      // A candidate might be the management group — enumerate its restaurants.
      const group = await probeAsGroup(account, token, guid)
      if (group.members) {
        console.log(`   ◈ ${guid} is a MANAGEMENT GROUP with ${group.members.length} restaurant(s):`)
        for (const m of group.members) {
          const rGuid = m.guid || m.restaurantGuid || m.id
          if (!rGuid) {
            console.log(`     · (unrecognized member shape) ${JSON.stringify(m)}`)
            continue
          }
          const res = await probeGuid(account, token, rGuid)
          console.log(
            res.ok
              ? `     ✓ ${rGuid} → ${res.name}${res.locationName ? ' · ' + res.locationName : ''}` +
                (res.closeoutHour !== undefined && res.closeoutHour !== 'n/a'
                  ? ` · business-day closeout hour: ${res.closeoutHour} · ${res.timeZone}`
                  : '')
              : `     ✗ ${rGuid} → in group but not accessible (${res.why})`,
          )
        }
        continue
      }
      console.log(`   group probe on ${guid}: ${group.why}`)

      const res = await probeGuid(account, token, guid)
      if (res.ok) {
        console.log(
          `   ✓ ${guid} → ${res.name}${res.locationName ? ' · ' + res.locationName : ''}` +
          (res.closeoutHour !== undefined && res.closeoutHour !== 'n/a'
            ? ` · business-day closeout hour: ${res.closeoutHour} · ${res.timeZone}`
            : ''),
        )
      } else {
        console.log(`   ✗ ${guid} → not accessible with this credential (${res.why})`)
      }
    }
  }

  process.exit(anyFailure ? 1 : 0)
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

const allCodes = accounts.flatMap((a) => Object.values(a.locations))
console.log(`Toast pull — dates: ${dates[0]}${dates.length > 1 ? '..' + dates.at(-1) : ''}` +
  ` · accounts: ${accounts.map((a) => a.name).join(', ')}` +
  ` · locations: ${allCodes.join(', ')}${dryRun ? ' · DRY RUN' : ''}`)

const codeToUuid = await resolveLocations()

const failures = []

for (const account of accounts) {
  let token
  try {
    token = await toastAuth(account) // one token per account, reused for the whole run
  } catch (err) {
    failures.push(err.message)
    continue
  }

  for (const [guid, code] of Object.entries(account.locations)) {
    const locationId = dryRun ? null : codeToUuid[code]
    if (!dryRun && !locationId) {
      // Spec §3: unmapped = hard failure, never a silent skip.
      failures.push(`${code}: no locations row with this code — add it before importing`)
      continue
    }

    for (const businessDate of dates) {
      try {
        const [orders, entries] = await Promise.all([
          fetchOrders(account, token, guid, businessDate),
          fetchTimeEntries(account, token, guid, businessDate),
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
}

if (failures.length) {
  console.error('\nFAILED days (re-run with a date range to repair):')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(dryRun ? '\nDry run complete — nothing written.' : '\nAll days landed.')
