import { supabase } from '../lib/supabase.js'

/**
 * Live query + aggregation layer over the tables the Toast pipeline fills.
 * All range math happens on daily rows, so any custom window works; the
 * percentages are always recomputed from summed dollars, never averaged.
 * `locationId` null = every location the caller's RLS lets them see.
 */

export async function fetchLocations() {
  const { data, error } = await supabase
    .from('locations')
    .select('id, name, code, city, status')
    .order('created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchDaily(locationId, start, end) {
  let q = supabase
    .from('daily_metrics')
    .select('location_id, business_date, net_sales, gross_sales, covers, food_cost, labor_cost, liquor_cost, voids_amount, discounts_amount, expenses')
    .gte('business_date', start)
    .lte('business_date', end)
    .order('business_date')
  if (locationId) q = q.eq('location_id', locationId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

const DIM_COLS = {
  daily_sales_categories: 'location_id, business_date, category, net_sales, item_count',
  daily_menu_items: 'location_id, business_date, item_key, item_name, category, quantity, net_sales',
  daily_payments: 'location_id, business_date, payment_type, pay_count, amount, tips',
  daily_server_sales: 'location_id, business_date, employee_guid, employee_name, net_sales, order_count',
  daily_server_categories: 'location_id, business_date, employee_guid, employee_name, job_title, category, quantity, net_sales',
}

export async function fetchDim(table, locationId, start, end) {
  let q = supabase.from(table).select(DIM_COLS[table]).gte('business_date', start).lte('business_date', end)
  if (locationId) q = q.eq('location_id', locationId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Range totals from daily rows. Cost fields become null when absent so the UI can show awaiting-data states. */
export function sumDaily(rows) {
  const t = {
    net: 0, gross: 0, covers: 0, voids: 0, discounts: 0,
    food_cost: 0, labor_cost: 0, liquor_cost: 0, expenses: 0, days: rows.length,
  }
  for (const r of rows) {
    t.net += Number(r.net_sales) || 0
    t.gross += Number(r.gross_sales) || 0
    t.covers += Number(r.covers) || 0
    t.voids += Number(r.voids_amount) || 0
    t.discounts += Number(r.discounts_amount) || 0
    t.food_cost += Number(r.food_cost) || 0
    t.labor_cost += Number(r.labor_cost) || 0
    t.liquor_cost += Number(r.liquor_cost) || 0
    t.expenses += Number(r.expenses) || 0
  }
  t.avgCheck = t.covers > 0 ? t.net / t.covers : null
  t.voidPct = t.net > 0 ? (t.voids / t.net) * 100 : null
  t.discountPct = t.net > 0 ? (t.discounts / t.net) * 100 : null
  // Cost percentages only when cost data actually exists (invoices/labor pending).
  t.foodPct = t.food_cost > 0 && t.net > 0 ? (t.food_cost / t.net) * 100 : null
  t.laborPct = t.labor_cost > 0 && t.net > 0 ? (t.labor_cost / t.net) * 100 : null
  t.liquorPct = t.liquor_cost > 0 && t.net > 0 ? (t.liquor_cost / t.net) * 100 : null
  return t
}

/** Group dimension rows by key, summing the named numeric fields. Returns sorted array. */
export function groupSum(rows, keyFn, fields, extraFn) {
  const map = new Map()
  for (const r of rows) {
    const k = keyFn(r)
    if (k == null) continue
    let g = map.get(k)
    if (!g) {
      g = { key: k, ...(extraFn ? extraFn(r) : {}) }
      for (const f of fields) g[f] = 0
      map.set(k, g)
    }
    for (const f of fields) g[f] += Number(r[f]) || 0
  }
  return [...map.values()]
}

/** Daily series (or weekly buckets for long ranges) for bar charts. */
export function dailySeries(rows, start, end) {
  const byDate = new Map()
  for (const r of rows) {
    byDate.set(r.business_date, (byDate.get(r.business_date) || 0) + (Number(r.net_sales) || 0))
  }
  return byDate
}

export async function fetchOrgTargets() {
  const { data, error } = await supabase.from('kpi_targets').select('metric, threshold').is('location_id', null)
  if (error) return {}
  const t = {}
  for (const r of data ?? []) t[r.metric] = Number(r.threshold)
  return t
}

export async function fetchChargebackTotals(locationId, start, end) {
  const { data, error } = await supabase.rpc('get_chargeback_totals', {
    p_location_id: locationId ?? null,
    p_start: start,
    p_end: end,
  })
  if (error) return []
  return data ?? []
}

export async function fetchExceptionCount(locationId, start, end) {
  let q = supabase
    .from('exception_flags')
    .select('id', { count: 'exact', head: true })
    .gte('occurred_at', start + 'T00:00:00Z')
    .lte('occurred_at', end + 'T23:59:59Z')
  if (locationId) q = q.eq('location_id', locationId)
  const { count, error } = await q
  if (error) return 0
  return count ?? 0
}
