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

/** Real payroll per month for the P&L: tips paid + salaried monthly total.
    Admin-only server-side — non-admins get [] (their P&L shows wages only,
    which come from daily_metrics.labor_cost they can already read). */
export async function fetchPayrollMonths(year, locationId) {
  const { data, error } = await supabase.rpc('payroll_month_totals', {
    p_year: Number(year),
    p_location: locationId ?? null,
  })
  if (error) return []
  return data ?? []
}

/* ---- native intake form (§10.1) ---- */

/** Mirror of the DB's normalize_vendor_name(): lowercase, strip apostrophes
    and periods, collapse whitespace — keeps client-side vendor matching in
    lockstep with the alias table. */
export function normalizeVendorName(p) {
  return String(p ?? '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Vendor list for the intake dropdown (RLS: any authenticated user). */
export async function fetchVendors() {
  const { data, error } = await supabase
    .from('vendors')
    .select('id, name, default_category_id, is_recurring, expected_amount, expected_frequency')
    .order('name')
    .limit(2000)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** alias → vendor_id map so typed names resolve exactly like the trigger. */
export async function fetchVendorAliases() {
  const { data, error } = await supabase.from('vendor_aliases').select('alias, vendor_id').limit(5000)
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Look-ahead for the duplicate rule: same vendor with the same amount within
    ±7 days, or the same invoice #. Two separate queries (not a PostgREST
    `or=` string) so a free-text invoice number can't break the filter. */
export async function findLikelyDuplicates({ vendorId, amount, invoiceDate, invoiceNumber }) {
  if (!vendorId || !amount || !invoiceDate) return []
  const shift = (days) => {
    const d = new Date(`${invoiceDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const cols = 'id, invoice_date, amount, invoice_number, status, locations(name)'
  const queries = [
    supabase.from('invoices').select(cols).eq('vendor_id', vendorId).eq('amount', amount)
      .gte('invoice_date', shift(-7)).lte('invoice_date', shift(7)).limit(5),
  ]
  if (invoiceNumber?.trim()) {
    queries.push(supabase.from('invoices').select(cols).eq('vendor_id', vendorId).eq('invoice_number', invoiceNumber.trim()).limit(5))
  }
  const results = await Promise.all(queries)
  const seen = new Map()
  for (const { data } of results) for (const r of data ?? []) seen.set(r.id, r)
  return [...seen.values()].sort((a, b) => (a.invoice_date < b.invoice_date ? 1 : -1))
}

/** Upload the invoice photo/PDF to the public `invoices` bucket. */
export async function uploadInvoiceFile(file, locCode) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().slice(0, 8)
  const path = `${locCode || 'org'}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('invoices').upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error(error.message)
  return supabase.storage.from('invoices').getPublicUrl(path).data.publicUrl
}

/** Insert straight into invoices — the BEFORE trigger runs the rules engine,
    stamps submitted_by from the JWT, and forces the status through review.
    Returns the decided row so the form can show the outcome. */
export async function submitInvoice({ locationId, vendorName, invoiceDate, amount, invoiceNumber, categoryId, notes, fileUrl, userId }) {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      submission_id: `native-${crypto.randomUUID()}`,
      location_id: locationId,
      vendor_name_raw: vendorName.trim(),
      invoice_date: invoiceDate,
      amount,
      invoice_number: invoiceNumber?.trim() || null,
      category_id: categoryId || null,
      notes: notes?.trim() || null,
      file_url: fileUrl || null,
      submitted_by: userId,
    })
    .select('id, status, flag_reasons, vendors(name)')
    .single()
  if (error) throw new Error(error.message)
  return data
}

/** Mobile intake links (admin-only via RLS) — shown on the desktop intake
    page so admins can share the no-login /submit?k=… URL with managers. */
export async function fetchIntakeLinks() {
  const { data, error } = await supabase
    .from('invoice_intake_links')
    .select('token, location_id, label, active')
    .eq('active', true)
    .order('label')
  if (error) return [] // non-admins: RLS hides the table
  return data ?? []
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
