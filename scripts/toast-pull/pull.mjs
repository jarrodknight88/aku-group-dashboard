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
import { TIP_HOLD_THRESHOLD, TIP_HOLD_DAYS, TIP_HOLD_RULE } from '../../src/config.js'

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

/**
 * Wages don't ride on time entries at this venue (calibration: 47/47 entries
 * wage-less) — they live on the employee's job assignment. Build a lookup:
 * employee+job → wage, with job default wage as fallback. Fetched once per
 * location per run.
 */
/** guid → name map from a config-style list endpoint. */
async function fetchGuidNames(account, token, restaurantGuid, path, label) {
  try {
    const list = await toastGet(account, token, path, restaurantGuid)
    const map = new Map()
    for (const it of Array.isArray(list) ? list : []) {
      if (it.guid) map.set(it.guid, it.name || it.label || '')
    }
    return { map, note: null }
  } catch (err) {
    return { map: new Map(), note: `${label} lookup unavailable: ${err.message.slice(0, 120)}` }
  }
}

async function fetchWageIndex(account, token, restaurantGuid) {
  const idx = { empJob: new Map(), job: new Map(), jobTitle: new Map(), empJobs: new Map(), names: new Map(), notes: [] }
  try {
    const jobs = await toastGet(account, token, '/labor/v1/jobs', restaurantGuid)
    for (const j of jobs ?? []) {
      const w = Number(j.defaultWage ?? j.wage) || 0
      if (j.guid && w > 0) idx.job.set(j.guid, w)
      if (j.guid) idx.jobTitle.set(j.guid, j.title || j.name || '')
    }
  } catch (err) {
    idx.notes.push(`jobs lookup unavailable: ${err.message.slice(0, 140)}`)
  }
  try {
    const employees = await toastGet(account, token, '/labor/v1/employees', restaurantGuid)
    for (const emp of employees ?? []) {
      if (emp.guid) {
        const name =
          [emp.firstName, emp.lastName].filter(Boolean).join(' ') || emp.chosenName || emp.externalEmployeeId || ''
        if (name) idx.names.set(emp.guid, name)
      }
      const refs = emp.jobReferences ?? emp.jobs ?? []
      if (emp.guid && refs.length) idx.empJobs.set(emp.guid, refs.map((r) => r.guid).filter(Boolean))
      for (const jr of refs) {
        const w = Number(jr.wage ?? jr.hourlyWage ?? jr.defaultWage) || 0
        if (emp.guid && jr.guid && w > 0) idx.empJob.set(`${emp.guid}:${jr.guid}`, w)
      }
      // Some tenants carry wage overrides in a separate array.
      for (const wo of emp.wageOverrides ?? []) {
        const w = Number(wo.wage) || 0
        if (emp.guid && wo.jobReference?.guid && w > 0) idx.empJob.set(`${emp.guid}:${wo.jobReference.guid}`, w)
      }
    }
  } catch (err) {
    idx.notes.push(`employees lookup unavailable: ${err.message.slice(0, 140)}`)
  }
  return idx
}

/**
 * Employee → job title for one business day, from the day's clock-ins (an
 * employee's role can differ by shift); falls back to the first job on their
 * profile for staff who ring orders without clocking in that day.
 */
function dayJobTitles(entries, wageIdx) {
  const titles = new Map()
  for (const e of entries) {
    const emp = e.employeeReference?.guid ?? e.employee?.guid
    const job = e.jobReference?.guid ?? e.job?.guid
    if (emp && job && !titles.has(emp)) {
      const t = wageIdx.jobTitle.get(job)
      if (t) titles.set(emp, t)
    }
  }
  return {
    get: (empGuid) =>
      titles.get(empGuid) ?? wageIdx.jobTitle.get((wageIdx.empJobs.get(empGuid) ?? [])[0]) ?? null,
  }
}

/* ---------- aggregation (⚠ VERIFY block — confirm against Toast Web on sample pulls) ---------- */

const cents = (n) => Math.round((Number(n) || 0) * 100)

/**
 * Aggregate one business day's orders.
 * CALIBRATED against Toast Web's Sales Summary export for 2026-06-26/27:
 *  - net_sales   = Σ non-void selection.price → matched Toast Net Sales to
 *                  the penny both days. (check.amount overshoots ~$356/day —
 *                  do not use it.)
 *  - voids       = Σ voided selection prices → matched Void summary exactly.
 *  - gross_sales = net + discounts (Toast's own definition: Net sales summary
 *                  shows Gross − Discounts = Net).
 *  - covers      = guests on orders that still have a live check (raw
 *                  numberOfGuests overcounted ~1.5% vs Toast Total Guests).
 * Discounts still run ~15% high vs the Sales discounts line — the dry-run
 * prints a per-discount-name breakdown by level to pin the double-count.
 */
function paymentLabel(p, altPayments) {
  const t = (p.type || '').toUpperCase()
  if (t === 'CASH') return 'Cash'
  if (t === 'CREDIT') {
    const c = (p.cardType || '').toUpperCase()
    if (c === 'VISA') return 'Visa'
    if (c === 'MASTERCARD') return 'Mastercard'
    if (c === 'AMEX') return 'Amex'
    if (c === 'DISCOVER') return 'Discover'
    return 'Credit (other)'
  }
  if (t === 'GIFTCARD') return 'Gift Card'
  if (t === 'HOUSE_ACCOUNT') return 'House Account'
  if (t === 'OTHER') return altPayments?.get(p.otherPayment?.guid) || 'Other'
  return t || 'Unknown'
}

// Venue-local hour (0-23) of an ISO timestamp; both ATL and CLT are Eastern.
const hourFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' })
function hourOf(iso) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Number(hourFmt.format(new Date(t))) % 24
}

function aggregateOrders(orders, lookups = {}) {
  let netC = 0
  let covers = 0
  let voidsC = 0
  let discountsC = 0
  const discountDebug = { check: {}, item: {} }
  const addDebug = (level, d, c) => {
    const name = d.name || d.discount?.name || 'unnamed'
    discountDebug[level][name] = (discountDebug[level][name] || 0) + c
  }
  // Hourly net sales / voids / discounts (24 slots, venue local) —
  // single-day dashboard ranges chart these instead of by-day bars.
  const salesByHourC = new Array(24).fill(0)
  const voidsByHourC = new Array(24).fill(0)
  const discountsByHourC = new Array(24).fill(0)
  // Void/discount detail: per (server, reason) and per item, in cents.
  const vdEmp = new Map() // kind‧serverGuid‧reason -> { amountC, qty }
  const vdItem = new Map() // kind‧itemName -> { amountC, qty }
  const addVd = (kind, serverGuid, reason, itemName, amountC, qty) => {
    if (!(amountC > 0)) return
    const e = bumpVd(vdEmp, `${kind}\u0001${serverGuid ?? ''}\u0001${reason}`)
    e.amountC += amountC
    e.qty += qty
    if (itemName) {
      const i = bumpVd(vdItem, `${kind}\u0001${itemName}`)
      i.amountC += amountC
      i.qty += qty
    }
  }
  const bumpVd = (map, key) => {
    if (!map.has(key)) map.set(key, { amountC: 0, qty: 0 })
    return map.get(key)
  }
  // Check-level void/discount events: the Toast check number, who rang it,
  // the reason, and a snapshot of EVERYTHING on the ticket — the drill-down
  // shows what else was rung in, and the check # is the GroupMe-photo join
  // key. One row per (check, kind) with any activity.
  const vdChecks = []
  const snapItems = (check) => {
    const rn = (ref) => (ref ? ref.name || lookups.voidReasons?.get(ref.guid) || null : null)
    return (check.selections ?? []).map((sel) => {
      const disc = (sel.appliedDiscounts ?? []).find((d) => !d.processingState || d.processingState === 'APPLIED')
      return {
        name: sel.displayName || 'Unknown item',
        qty: Number(sel.quantity) || 0,
        price: cents(sel.price) / 100,
        voided: !!sel.voided,
        discounted: !!disc,
        // per-line labels for the drill-down ticket view
        reason: sel.voided ? rn(sel.voidReason) || rn(check?.voidReason) || null : null,
        discount: disc ? disc.name || disc.discount?.name || null : null,
      }
    })
  }
  const pushVdCheck = (kind, order, check, amountC, qty, reason, voidAll = false) => {
    if (!(amountC > 0)) return
    const items = snapItems(check)
    if (voidAll)
      for (const it of items) {
        it.voided = true
        it.reason = it.reason || reason || null
      }
    vdChecks.push({
      kind,
      check_guid: check.guid || null,
      check_number: check.displayNumber != null ? String(check.displayNumber) : null,
      employee_guid: order.server?.guid ?? null,
      reason: reason || (kind === 'void' ? 'No reason recorded' : 'unnamed'),
      amountC,
      qty,
      opened_at: order.openedDate || order.paidDate || null,
      items,
    })
  }
  // Toast keeps removed discounts in the response with processingState VOID/
  // PENDING; the Sales Summary counts only applied ones. (Calibration: the
  // item-level overcount of exactly $303.28 disappeared with this filter.)
  const isApplied = (d) => !d.processingState || d.processingState === 'APPLIED'

  // Breakdown dimensions (⚠ VERIFY against Sales category / Payments summary
  // exports before the historical backfill).
  const cats = new Map() // category name -> { netC, qty }
  const items = new Map() // item key -> { name, category, qty, netC }
  const pays = new Map() // label -> { count, amountC, tipsC }
  const servers = new Map() // employee guid -> { netC, orders }
  const serverCats = new Map() // employee guid + category (\u0001-joined) -> { netC, qty }
  const largeTips = [] // §8 — single-transaction tips over the auto-hold threshold
  const bump = (map, key, init) => {
    if (!map.has(key)) map.set(key, { ...init })
    return map.get(key)
  }

  for (const order of orders) {
    const orderHour = hourOf(order.openedDate || order.paidDate)
    const orderServer = order.server?.guid
    // Toast sends voidReason as a bare reference ({guid}) — the display name
    // lives in restaurant config, resolved via lookups (calibration: 670/670
    // backfilled void rows had no inline name). Wholesale voids may carry the
    // reason on the check or order instead of each selection.
    const reasonName = (ref) => (ref ? ref.name || lookups.voidReasons?.get(ref.guid) || null : null)
    const voidReasonOf = (sel, check) =>
      reasonName(sel.voidReason) || reasonName(check?.voidReason) || reasonName(order.voidReason) || 'No reason recorded'
    const addVoidC = (c) => {
      voidsC += c
      if (orderHour != null) voidsByHourC[orderHour] += c
    }
    const addDiscountC = (c) => {
      discountsC += c
      if (orderHour != null) discountsByHourC[orderHour] += c
    }

    if (order.voided) {
      // Fully voided order: contributes to voids, not to sales.
      for (const check of order.checks ?? []) {
        let chkC = 0
        let chkQ = 0
        let chkReason = null
        for (const sel of check.selections ?? []) {
          addVoidC(cents(sel.price))
          addVd('void', orderServer, voidReasonOf(sel, check), sel.displayName, cents(sel.price), Number(sel.quantity) || 0)
          chkC += cents(sel.price)
          chkQ += Number(sel.quantity) || 0
          if (!chkReason) chkReason = voidReasonOf(sel, check)
        }
        pushVdCheck('void', order, check, chkC, chkQ, chkReason, true)
      }
      continue
    }

    const checks = order.checks ?? []
    const hasLiveCheck = checks.some((c) => !c.voided && !c.deleted)
    if (hasLiveCheck && !order.deleted) covers += Number(order.numberOfGuests) || 0

    const serverGuid = order.server?.guid
    let orderNetC = 0

    for (const check of checks) {
      if (check.voided) {
        let chkC = 0
        let chkQ = 0
        let chkReason = null
        for (const sel of check.selections ?? []) {
          addVoidC(cents(sel.price))
          addVd('void', orderServer, voidReasonOf(sel, check), sel.displayName, cents(sel.price), Number(sel.quantity) || 0)
          chkC += cents(sel.price)
          chkQ += Number(sel.quantity) || 0
          if (!chkReason) chkReason = voidReasonOf(sel, check)
        }
        pushVdCheck('void', order, check, chkC, chkQ, chkReason, true)
        continue
      }
      // per-check accumulators feeding the check-level snapshot rows
      let chkVoidC = 0
      let chkVoidQ = 0
      let chkVoidReason = null
      let chkDiscC = 0
      let chkDiscQ = 0
      let chkDiscName = null
      for (const disc of check.appliedDiscounts ?? []) {
        if (!isApplied(disc)) continue
        const c = cents(disc.discountAmount)
        addDiscountC(c)
        addDebug('check', disc, c)
        addVd('discount', orderServer, disc.name || disc.discount?.name || 'unnamed', null, c, 1)
        chkDiscC += c
        chkDiscQ += 1
        if (!chkDiscName) chkDiscName = disc.name || disc.discount?.name || 'unnamed'
      }
      for (const p of check.payments ?? []) {
        // Calibration: cash/Discover/OpenTable matched the Payments summary
        // exactly while Visa/MC/Amex counts ran high — the extras are failed
        // card attempts Toast keeps in the list. Count only settled payments.
        // (API amount = Toast's "Total" − tips, i.e. tax+gratuity inclusive.)
        const status = (p.paymentStatus || '').toUpperCase()
        if (['VOIDED', 'VOIDED_AT_RISK', 'PROCESSING_VOID', 'DENIED', 'ERROR', 'CANCELLED'].includes(status)) continue
        const pay = bump(pays, paymentLabel(p, lookups.altPayments), { count: 0, amountC: 0, tipsC: 0 })
        pay.count += 1
        pay.amountC += cents(p.amount)
        pay.tipsC += cents(p.tipAmount)
        // §8 — large-tip auto-hold: a single settled CARD payment tipping over
        // the threshold gets flagged and held through the chargeback window.
        // Cash/gift-card tips carry no chargeback risk, so they never hold.
        if ((p.type || '').toUpperCase() === 'CREDIT' && cents(p.tipAmount) > TIP_HOLD_THRESHOLD * 100) {
          largeTips.push({
            check: check.displayNumber ? `#${check.displayNumber}` : null,
            serverGuid,
            tipC: cents(p.tipAmount),
            paidAt: p.paidDate || order.openedDate || null,
          })
        }
      }
      for (const sel of check.selections ?? []) {
        if (sel.voided) {
          addVoidC(cents(sel.price))
          addVd('void', orderServer, voidReasonOf(sel, check), sel.displayName, cents(sel.price), Number(sel.quantity) || 0)
          chkVoidC += cents(sel.price)
          chkVoidQ += Number(sel.quantity) || 0
          if (!chkVoidReason) chkVoidReason = voidReasonOf(sel, check)
          continue
        }
        const priceC = cents(sel.price)
        netC += priceC
        orderNetC += priceC
        if (orderHour != null) salesByHourC[orderHour] += priceC

        const catName = lookups.categoryNames?.get(sel.salesCategory?.guid) || 'Uncategorized'
        const qty = Number(sel.quantity) || 0
        const cat = bump(cats, catName, { netC: 0, qty: 0 })
        cat.netC += priceC
        cat.qty += qty

        // Hookah performance is tracked by FLAVOR, which rides on the
        // modifier, not the item ("House Hookah" + modifier "Double Apple").
        // For hookah-category selections with modifiers, the modifiers become
        // the menu-item rows — parent price apportioned across them — so
        // Top/Bottom Sellers rank flavors instead of one generic hookah line.
        const hookahMods = /hookah/i.test(catName) ? (sel.modifiers ?? []).filter((m) => !m.voided && m.displayName) : []
        if (hookahMods.length) {
          const shareC = Math.round(priceC / hookahMods.length)
          for (const m of hookahMods) {
            const modItem = bump(items, `hkmod:${m.displayName}`, { name: m.displayName, category: catName, qty: 0, netC: 0 })
            modItem.qty += Number(m.quantity) || qty || 1
            modItem.netC += shareC + cents(m.price)
          }
        } else {
          const itemKey = sel.item?.guid || `name:${sel.displayName || 'unknown'}`
          const item = bump(items, itemKey, { name: sel.displayName || 'Unknown item', category: catName, qty: 0, netC: 0 })
          item.qty += qty
          item.netC += priceC
        }

        if (serverGuid) {
          const sc = bump(serverCats, `${serverGuid}\u0001${catName}`, { netC: 0, qty: 0 })
          sc.netC += priceC
          sc.qty += qty
        }

        for (const d of sel.appliedDiscounts ?? []) {
          if (!isApplied(d)) continue
          const c = cents(d.discountAmount)
          addDiscountC(c)
          addDebug('item', d, c)
          addVd('discount', orderServer, d.name || d.discount?.name || 'unnamed', sel.displayName, c, 1)
          chkDiscC += c
          chkDiscQ += 1
          if (!chkDiscName) chkDiscName = d.name || d.discount?.name || 'unnamed'
        }
      }
      pushVdCheck('void', order, check, chkVoidC, chkVoidQ, chkVoidReason)
      pushVdCheck('discount', order, check, chkDiscC, chkDiscQ, chkDiscName)
    }

    if (serverGuid && orderNetC > 0) {
      const s = bump(servers, serverGuid, { netC: 0, orders: 0 })
      s.netC += orderNetC
      s.orders += 1
    }
  }

  return {
    net_sales: netC / 100,
    gross_sales: (netC + discountsC) / 100,
    covers,
    voids_amount: voidsC / 100,
    discounts_amount: discountsC / 100,
    order_count: orders.length,
    discountDebug,
    cats,
    items,
    pays,
    servers,
    serverCats,
    largeTips,
    sales_by_hour: salesByHourC.map((c) => c / 100),
    voids_by_hour: voidsByHourC.map((c) => c / 100),
    discounts_by_hour: discountsByHourC.map((c) => c / 100),
    vdEmp,
    vdItem,
    vdChecks,
  }
}

/**
 * Straight-time labor: hours × wage, no OT premium (per spec §1).
 * First pull showed regularHours/overtimeHours mostly unpopulated ($0 days
 * with 47 clocked entries), so hours fall back to clock-out − clock-in.
 * Entries with no wage (e.g. salaried) contribute $0 — verify the total
 * against Toast Web's Labor summary; salaried cost may need the invoice side.
 */
function aggregateLabor(entries, wageIdx) {
  let laborC = 0
  const src = { entry: 0, employeeJob: 0, jobDefault: 0, none: 0 }
  let sampleKeys = null
  for (const e of entries) {
    let hours = (Number(e.regularHours) || 0) + (Number(e.overtimeHours) || 0)
    if (!hours && e.inDate && e.outDate) {
      const ms = new Date(e.outDate) - new Date(e.inDate)
      if (ms > 0) hours = ms / 3_600_000
    }
    if (!hours) continue

    let wage = Number(e.hourlyWage) || 0
    if (wage > 0) src.entry += 1
    if (!wage && wageIdx) {
      const empGuid = e.employeeReference?.guid ?? e.employee?.guid
      const jobGuid = e.jobReference?.guid ?? e.job?.guid
      wage = (empGuid && jobGuid && wageIdx.empJob.get(`${empGuid}:${jobGuid}`)) || 0
      if (wage > 0) src.employeeJob += 1
      if (!wage && jobGuid) {
        wage = wageIdx.job.get(jobGuid) || 0
        if (wage > 0) src.jobDefault += 1
      }
    }
    if (!wage) {
      src.none += 1
      if (!sampleKeys) sampleKeys = Object.keys(e).join(', ')
    }
    laborC += Math.round(hours * wage * 100)
  }
  return { labor_cost: laborC / 100, entry_count: entries.length, wage_sources: src, sample_entry_keys: sampleKeys }
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
    sales_by_hour: sales.sales_by_hour,
    voids_by_hour: sales.voids_by_hour,
    discounts_by_hour: sales.discounts_by_hour,
    source: 'toast_api_v1',
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('daily_metrics')
    .upsert(row, { onConflict: 'location_id,business_date' })
  if (error) throw new Error(`upsert failed: ${error.message}`)
}

/**
 * Breakdown tables get full-day replacement (delete + insert) so a re-pull
 * never leaves stale dimension members behind.
 */
/**
 * Per-employee-per-job daily labor rows (payroll intake, handoff §9). Same
 * hour/wage resolution as aggregateLabor — entry wage, then employee-job
 * assignment, then job default — but kept per employee so the payroll page
 * can build checks. Rate stores the weighted average when entries differ.
 */
function laborBreakdown(entries, wageIdx) {
  const byEmpJob = new Map()
  for (const e of entries) {
    let hours = (Number(e.regularHours) || 0) + (Number(e.overtimeHours) || 0)
    if (!hours && e.inDate && e.outDate) {
      const ms = new Date(e.outDate) - new Date(e.inDate)
      if (ms > 0) hours = ms / 3_600_000
    }
    if (!hours) continue
    const empGuid = e.employeeReference?.guid ?? e.employee?.guid
    if (!empGuid) continue
    const jobGuid = e.jobReference?.guid ?? e.job?.guid
    let wage = Number(e.hourlyWage) || 0
    if (!wage && jobGuid) wage = wageIdx.empJob.get(`${empGuid}:${jobGuid}`) || wageIdx.job.get(jobGuid) || 0
    const jobTitle = (jobGuid && wageIdx.jobTitle.get(jobGuid)) || ''
    const key = `${empGuid}\u0001${jobTitle}`
    const row = byEmpJob.get(key) ?? { employee_guid: empGuid, job_title: jobTitle, hours: 0, wagesC: 0 }
    row.hours += hours
    row.wagesC += Math.round(hours * wage * 100)
    byEmpJob.set(key, row)
  }
  return [...byEmpJob.values()].map((r) => ({
    employee_guid: r.employee_guid,
    employee_name: wageIdx.names.get(r.employee_guid) || null,
    job_title: r.job_title,
    hours: Math.round(r.hours * 100) / 100,
    rate: r.hours > 0 ? Math.round(r.wagesC / r.hours) / 100 : 0,
    wages: r.wagesC / 100,
  }))
}

const addDaysIso = (dateIso, n) => {
  const d = new Date(dateIso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * §8 — large-tip auto-hold, evaluated at import time. Each qualifying tip
 * creates a held exception flag plus a tip_holds row that releases after the
 * chargeback window. Insert-only, keyed by check number within the business
 * date, so re-pulls never clobber a manager's review decision on an existing
 * flag (a checkless payment can double-insert on re-pull; Toast always sends
 * display numbers in practice).
 */
async function writeTipHolds(locationId, businessDate, largeTips, employeeNames) {
  if (!largeTips.length) return
  const releaseAt = addDaysIso(businessDate, TIP_HOLD_DAYS)
  const { data: existing, error: exErr } = await supabase
    .from('tip_holds')
    .select('check_number')
    .eq('location_id', locationId)
    .eq('release_at', releaseAt)
  if (exErr) throw new Error(`tip_holds read failed: ${exErr.message}`)
  const seen = new Set((existing ?? []).map((r) => r.check_number))
  for (const t of largeTips) {
    if (t.check && seen.has(t.check)) continue
    if (t.check) seen.add(t.check)
    const occurredAt =
      t.paidAt && !Number.isNaN(Date.parse(t.paidAt))
        ? new Date(t.paidAt).toISOString()
        : `${businessDate}T23:00:00Z`
    const serverName = employeeNames?.get(t.serverGuid) || null
    const { data: flag, error } = await supabase
      .from('exception_flags')
      .insert({
        location_id: locationId,
        occurred_at: occurredAt,
        check_number: t.check,
        server_name: serverName,
        rule_tripped: TIP_HOLD_RULE,
        amount: t.tipC / 100,
        severity: 'high',
        status: 'held',
        source: 'rule',
      })
      .select('id')
      .single()
    if (error) throw new Error(`exception_flags insert failed: ${error.message}`)
    const { error: thErr } = await supabase.from('tip_holds').insert({
      location_id: locationId,
      exception_id: flag.id,
      check_number: t.check,
      server_name: serverName,
      amount: t.tipC / 100,
      flagged_at: occurredAt,
      release_at: releaseAt,
      status: 'held',
    })
    if (thErr) throw new Error(`tip_holds insert failed: ${thErr.message}`)
  }
}

async function replaceDayRows(table, locationId, businessDate, rows) {
  const del = await supabase.from(table).delete().eq('location_id', locationId).eq('business_date', businessDate)
  if (del.error) throw new Error(`${table} delete failed: ${del.error.message}`)
  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 400))
    if (error) throw new Error(`${table} insert failed: ${error.message}`)
  }
}

function breakdownRows(sales, locationId, businessDate, employeeNames, jobTitles) {
  const base = { location_id: locationId, business_date: businessDate }
  return {
    daily_sales_categories: [...sales.cats].map(([category, v]) => ({
      ...base, category, net_sales: v.netC / 100, item_count: v.qty,
    })),
    daily_menu_items: [...sales.items].map(([item_key, v]) => ({
      ...base, item_key, item_name: v.name, category: v.category, quantity: v.qty, net_sales: v.netC / 100,
    })),
    daily_payments: [...sales.pays].map(([payment_type, v]) => ({
      ...base, payment_type, pay_count: v.count, amount: v.amountC / 100, tips: v.tipsC / 100,
    })),
    daily_server_sales: [...sales.servers].map(([employee_guid, v]) => ({
      ...base, employee_guid, employee_name: employeeNames?.get(employee_guid) || null,
      net_sales: v.netC / 100, order_count: v.orders,
    })),
    daily_server_categories: [...sales.serverCats].map(([key, v]) => {
      const sep = key.indexOf('\u0001')
      const employee_guid = key.slice(0, sep)
      const category = key.slice(sep + 1)
      return {
        ...base, employee_guid, employee_name: employeeNames?.get(employee_guid) || null,
        job_title: jobTitles?.get(employee_guid) || null, category,
        quantity: v.qty, net_sales: v.netC / 100,
      }
    }),
    daily_void_discounts: [
      ...[...sales.vdEmp].map(([key, v]) => {
        const [kind, employee_guid, reason] = key.split('\u0001')
        return {
          ...base, kind, dim: 'employee',
          employee_guid: employee_guid || null,
          employee_name: (employee_guid && employeeNames?.get(employee_guid)) || null,
          reason, item_name: null,
          amount: v.amountC / 100, qty: v.qty,
        }
      }),
      ...[...sales.vdItem].map(([key, v]) => {
        const [kind, item_name] = key.split('\u0001')
        return {
          ...base, kind, dim: 'item',
          employee_guid: null, employee_name: null, reason: null, item_name,
          amount: v.amountC / 100, qty: v.qty,
        }
      }),
    ],
    daily_vd_checks: (sales.vdChecks ?? []).map((c) => ({
      ...base,
      kind: c.kind,
      check_guid: c.check_guid,
      check_number: c.check_number,
      employee_guid: c.employee_guid,
      employee_name: (c.employee_guid && employeeNames?.get(c.employee_guid)) || null,
      reason: c.reason,
      amount: c.amountC / 100,
      qty: c.qty,
      opened_at: c.opened_at,
      items: c.items,
    })),
  }
}

/* ---------- main ---------- */

const allCodes = accounts.flatMap((a) => Object.values(a.locations))
console.log(`Toast pull — dates: ${dates[0]}${dates.length > 1 ? '..' + dates.at(-1) : ''}` +
  ` · accounts: ${accounts.map((a) => a.name).join(', ')}` +
  ` · locations: ${allCodes.join(', ')}${dryRun ? ' · DRY RUN' : ''}`)

const codeToUuid = await resolveLocations()

// Dashboard-entered hourly rates (employee_rates) override Toast wages when
// computing the labor_cost aggregate — Toast rarely carries a wage here.
// Wages only: tips/gratuity never count as labor.
let dashboardRates = new Map()
if (!dryRun) {
  const { data, error } = await supabase.from('employee_rates').select('employee_guid, rate')
  if (error) fail(`employee_rates read failed: ${error.message}`)
  dashboardRates = new Map((data ?? []).map((r) => [r.employee_guid, Number(r.rate)]))
  console.log(`dashboard rates loaded: ${dashboardRates.size}`)
}

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

    const wageIdx = await fetchWageIndex(account, token, guid)
    const catNames = await fetchGuidNames(account, token, guid, '/config/v2/salesCategories', 'sales categories')
    const altPays = await fetchGuidNames(account, token, guid, '/config/v2/alternatePaymentTypes', 'alternate payments')
    const voidRsns = await fetchGuidNames(account, token, guid, '/config/v2/voidReasons', 'void reasons')
    const lookups = { categoryNames: catNames.map, altPayments: altPays.map, employeeNames: wageIdx.names, voidReasons: voidRsns.map }
    if (dryRun) {
      console.log(
        `${code}: lookups — ${wageIdx.empJob.size} employee-job wages · ${wageIdx.names.size} employee names` +
        ` · ${catNames.map.size} sales categories · ${altPays.map.size} alternate payment types · ${voidRsns.map.size} void reasons` +
        [...wageIdx.notes, catNames.note, altPays.note, voidRsns.note].filter(Boolean).map((n) => ` · ${n}`).join(''),
      )
    }

    for (const businessDate of dates) {
      try {
        const [orders, entries] = await Promise.all([
          fetchOrders(account, token, guid, businessDate),
          fetchTimeEntries(account, token, guid, businessDate),
        ])
        const sales = aggregateOrders(orders, lookups)
        const labor = aggregateLabor(entries, wageIdx)
        const jobTitles = dayJobTitles(entries, wageIdx)

        console.log(
          `${code} ${businessDate}: net $${sales.net_sales.toFixed(2)} · gross $${sales.gross_sales.toFixed(2)}` +
          ` · covers ${sales.covers} · voids $${sales.voids_amount.toFixed(2)}` +
          ` · disc $${sales.discounts_amount.toFixed(2)} · labor $${labor.labor_cost.toFixed(2)}` +
          ` (${sales.order_count} orders, ${labor.entry_count} time entries)`
        )

        if (dryRun) {
          const s = labor.wage_sources
          console.log(
            `    · wage sources: ${s.entry} on entry · ${s.employeeJob} employee-job · ${s.jobDefault} job default · ${s.none} unresolved`,
          )
          if (labor.sample_entry_keys) {
            console.log(`    · sample wage-less entry fields: ${labor.sample_entry_keys}`)
          }
          // Calibration aid: compare these per-name totals against Toast Web's
          // Check Discounts / Menu Item Discounts reports to spot double-counts.
          const fmtDbg = (o) =>
            Object.entries(o)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => `${k} $${(v / 100).toFixed(2)}`)
              .join(' · ') || 'none'
          console.log(`    · check-level discounts: ${fmtDbg(sales.discountDebug.check)}`)
          console.log(`    · item-level discounts:  ${fmtDbg(sales.discountDebug.item)}`)
          // Breakdown calibration — compare against Sales category summary /
          // Payments summary exports.
          const money = (c) => '$' + (c / 100).toFixed(2)
          console.log(
            `    · categories: ` +
            [...sales.cats].sort((a, b) => b[1].netC - a[1].netC)
              .map(([k, v]) => `${k} ${money(v.netC)} (${v.qty} items)`).join(' · '),
          )
          console.log(
            `    · payments: ` +
            [...sales.pays].sort((a, b) => b[1].amountC - a[1].amountC)
              .map(([k, v]) => `${k} ×${v.count} ${money(v.amountC)} tips ${money(v.tipsC)}`).join(' · '),
          )
          console.log(
            `    · top items: ` +
            [...sales.items].sort((a, b) => b[1].netC - a[1].netC).slice(0, 5)
              .map(([, v]) => `${v.name} ${money(v.netC)} (${v.qty})`).join(' · '),
          )
          console.log(
            `    · top servers: ` +
            [...sales.servers].sort((a, b) => b[1].netC - a[1].netC).slice(0, 3)
              .map(([g, v]) => `${lookups.employeeNames.get(g) || g.slice(0, 8)} ${money(v.netC)} (${v.orders} orders)`)
              .join(' · '),
          )
          // Role calibration — check titles against Toast Web's job list.
          console.log(
            `    · server roles: ` +
            ([...sales.servers].slice(0, 5)
              .map(([g]) => `${lookups.employeeNames.get(g) || g.slice(0, 8)} → ${jobTitles.get(g) || '(no job)'}`)
              .join(' · ') || 'none'),
          )
          if (sales.largeTips.length) {
            console.log(
              `    · large tips (> $${TIP_HOLD_THRESHOLD} — auto-hold): ` +
              sales.largeTips
                .map((t) => `${lookups.employeeNames.get(t.serverGuid) || 'unknown'} ${money(t.tipC)} on ${t.check || '?'}`)
                .join(' · '),
            )
          }
        }

        if (!dryRun) {
          if (sales.order_count === 0 && labor.entry_count === 0) {
            // No evidence of activity (closed day or pre-Toast history):
            // write nothing rather than a misleading $0 row.
            console.log('    · no activity — row not written')
          } else {
            const laborRows = laborBreakdown(entries, wageIdx)
            labor.labor_cost =
              Math.round(
                laborRows.reduce((s, r) => {
                  const dash = dashboardRates.get(r.employee_guid)
                  return s + (dash != null ? r.hours * dash : r.wages)
                }, 0) * 100,
              ) / 100
            await upsertDay(locationId, businessDate, sales, labor)
            const rows = breakdownRows(sales, locationId, businessDate, lookups.employeeNames, jobTitles)
            for (const [table, tableRows] of Object.entries(rows)) {
              await replaceDayRows(table, locationId, businessDate, tableRows)
            }
            await replaceDayRows(
              'daily_labor',
              locationId,
              businessDate,
              laborRows.map((r) => ({ location_id: locationId, business_date: businessDate, ...r })),
            )
            await writeTipHolds(locationId, businessDate, sales.largeTips, lookups.employeeNames)
          }
        }
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
