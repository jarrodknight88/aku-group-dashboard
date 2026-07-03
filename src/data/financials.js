import { supabase } from '../lib/supabase.js'

/* Invoice & expense data layer (INVOICE_SYSTEM reference §8).
   Statuses counting toward spend: auto_approved, approved, imported_legacy —
   needs_review and declined are excluded everywhere, matching the cost
   roll-up. RLS scopes reads to the caller's locations. */

export const COUNTED = ['auto_approved', 'approved', 'imported_legacy']

const INVOICE_COLS =
  'id, submission_id, submitted_at, location_id, vendor_id, vendor_name_raw, invoice_number, invoice_date, amount, status, flag_reasons, file_url, evernote_link, notes, ' +
  'vendors(name, is_recurring, expected_amount, expected_frequency), expense_categories(name, grp)'

/** Counted invoices in a window (joined with vendor + category). */
export async function fetchInvoices(locationId, start, end) {
  let q = supabase
    .from('invoices')
    .select(INVOICE_COLS)
    .in('status', COUNTED)
    .gte('invoice_date', start)
    .lte('invoice_date', end)
    .order('invoice_date', { ascending: false })
    .limit(5000)
  if (locationId) q = q.eq('location_id', locationId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

/** The review queue — every needs_review invoice, org-wide (RLS scopes it). */
export async function fetchReviewQueue() {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_COLS)
    .eq('status', 'needs_review')
    .order('submitted_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Approve or decline a flagged invoice (admin-only, enforced in the DB). */
export async function reviewInvoice(id, approve) {
  const { error } = await supabase.rpc('review_invoice', { p_invoice_id: id, p_approve: approve })
  if (error) throw new Error(error.message)
}

/** The recurring-bills worksheet (per location; null = all the caller can see). */
export async function fetchBills(locationId) {
  let q = supabase
    .from('recurring_bills')
    .select('id, location_id, name, vendor_id, category_id, due_day, frequency, expected_amount, sort_order, expense_categories(name, grp)')
    .order('sort_order')
    .order('name')
  if (locationId) q = q.eq('location_id', locationId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Manual payments for a calendar year (RLS scopes to visible locations). */
export async function fetchBillPayments(year) {
  const { data, error } = await supabase
    .from('recurring_bill_payments')
    .select('bill_id, month, amount')
    .gte('month', `${year}-01-01`)
    .lte('month', `${year}-12-01`)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Set (amount) or clear (null) one bill's payment for a month, then re-sync
    the expense rollup for that month so tiles update immediately. */
export async function saveBillPayment(billId, monthIso, amount) {
  if (amount == null) {
    const { error } = await supabase.from('recurring_bill_payments').delete().eq('bill_id', billId).eq('month', monthIso)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('recurring_bill_payments')
      .upsert({ bill_id: billId, month: monthIso, amount, updated_at: new Date().toISOString() }, { onConflict: 'bill_id,month' })
    if (error) throw new Error(error.message)
  }
  await supabase.rpc('rollup_bill_payments', { p_from: monthIso, p_to: monthIso })
}

export async function addBill({ location_id, name, category_id, due_day, expected_amount, frequency }) {
  // link to the canonical vendor when the name matches, so invoice actuals
  // show up in the month modal
  const { data: vendor } = await supabase.from('vendors').select('id').eq('name', name.trim()).maybeSingle()
  const { error } = await supabase.from('recurring_bills').insert({
    location_id, name: name.trim(), vendor_id: vendor?.id ?? null, category_id,
    due_day: due_day || 'Varies', frequency: frequency || 'monthly',
    expected_amount: expected_amount || null, sort_order: 500,
  })
  if (error) throw new Error(error.message)
}

export async function removeBill(id) {
  const { error } = await supabase.from('recurring_bills').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchCategories() {
  const { data, error } = await supabase.from('expense_categories').select('id, name, grp').order('sort_order')
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Sum helper: group invoices by a key function. */
export function sumBy(rows, keyFn) {
  const m = new Map()
  for (const r of rows) {
    const k = keyFn(r)
    if (k == null) continue
    const g = m.get(k) ?? { key: k, amount: 0, count: 0 }
    g.amount += Number(r.amount) || 0
    g.count += 1
    m.set(k, g)
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount)
}
