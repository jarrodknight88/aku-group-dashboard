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

/** Recurring vendors with their expectations. */
export async function fetchRecurringVendors() {
  const { data, error } = await supabase
    .from('vendors')
    .select('id, name, is_recurring, expected_amount, expected_frequency, expense_categories:default_category_id(name, grp)')
    .eq('is_recurring', true)
    .order('name')
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
