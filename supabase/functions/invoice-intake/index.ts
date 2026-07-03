// invoice-intake — backend for the no-login mobile intake page (/submit?k=…).
// The URL token is the credential (same trust model as the old Fillout link,
// revocable per row in invoice_intake_links). Every request validates the
// token, then the service role does the actual work — the database itself
// grants nothing to anonymous clients.
//
// POST JSON { token, action, ...payload }:
//   bootstrap → { location|locations, vendors, categories }  (form setup)
//   check     → { duplicates }                               (live dupe warning)
//   submit    → { status, flag_reasons }                     (upload + insert;
//                the invoices BEFORE-insert trigger runs the rules engine)
//
// Deployed with verify_jwt = false: the page has no session. Abuse surface is
// bounded by the token check + small validation below.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const MAX_FILE_BYTES = 12 * 1024 * 1024
const OK_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405)

  let body: any
  try {
    body = await req.json()
  } catch {
    return reply({ error: 'invalid JSON' }, 400)
  }

  const token = String(body?.token ?? '')
  if (!/^[0-9a-f]{32,80}$/.test(token)) return reply({ error: 'bad link' }, 403)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: link } = await db
    .from('invoice_intake_links')
    .select('token, location_id, label, active')
    .eq('token', token)
    .maybeSingle()
  if (!link || !link.active) return reply({ error: 'This link is no longer active — ask the office for a new one.' }, 403)

  const action = String(body?.action ?? '')

  if (action === 'bootstrap') {
    const [locs, vendors, cats] = await Promise.all([
      db.from('locations').select('id, name, code, status').eq('status', 'active').order('created_at'),
      db.from('vendors').select('id, name, default_category_id, is_recurring, expected_amount, expected_frequency').order('name').limit(2000),
      db.from('expense_categories').select('id, name, grp').order('sort_order'),
    ])
    const aliases = await db.from('vendor_aliases').select('alias, vendor_id').limit(5000)
    const all = locs.data ?? []
    return reply({
      label: link.label,
      location: link.location_id ? all.find((l) => l.id === link.location_id) ?? null : null,
      locations: link.location_id ? undefined : all,
      vendors: vendors.data ?? [],
      aliases: aliases.data ?? [],
      categories: cats.data ?? [],
    })
  }

  if (action === 'check') {
    const { vendor_id, amount, invoice_date, invoice_number } = body
    if (!vendor_id || !Number(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(String(invoice_date ?? ''))) return reply({ duplicates: [] })
    const shift = (days: number) => {
      const d = new Date(`${invoice_date}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + days)
      return d.toISOString().slice(0, 10)
    }
    const cols = 'id, invoice_date, amount, invoice_number, status, locations(name)'
    const queries = [
      db.from('invoices').select(cols).eq('vendor_id', vendor_id).eq('amount', Number(amount))
        .gte('invoice_date', shift(-7)).lte('invoice_date', shift(7)).limit(5),
    ]
    if (typeof invoice_number === 'string' && invoice_number.trim()) {
      queries.push(db.from('invoices').select(cols).eq('vendor_id', vendor_id).eq('invoice_number', invoice_number.trim()).limit(5))
    }
    const results = await Promise.all(queries)
    const seen = new Map<string, unknown>()
    for (const r of results) for (const row of (r.data ?? []) as any[]) seen.set(row.id, row)
    return reply({ duplicates: [...seen.values()] })
  }

  if (action === 'submit') {
    const vendorName = String(body?.vendor_name ?? '').trim()
    const amount = Number(body?.amount)
    const invoiceDate = String(body?.invoice_date ?? '')
    // location comes from the link; an org-wide link may pass one of the active locations
    let locationId = link.location_id as string | null
    if (!locationId) {
      const { data: l } = await db.from('locations').select('id').eq('id', String(body?.location_id ?? '')).eq('status', 'active').maybeSingle()
      locationId = l?.id ?? null
    }
    if (!locationId) return reply({ error: 'Pick a location.' }, 400)
    if (!vendorName || vendorName.length > 200) return reply({ error: 'Enter the vendor name.' }, 400)
    if (!(amount > 0) || amount > 1_000_000) return reply({ error: 'Enter the invoice amount.' }, 400)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return reply({ error: 'Enter the invoice date.' }, 400)

    // optional photo/PDF, sent base64 — lands in the public invoices bucket
    let fileUrl: string | null = null
    if (body?.file?.data) {
      const ext = OK_TYPES[String(body.file.type ?? '')]
      if (!ext) return reply({ error: 'Attach a photo or PDF.' }, 400)
      let bytes: Uint8Array
      try {
        bytes = Uint8Array.from(atob(String(body.file.data)), (c) => c.charCodeAt(0))
      } catch {
        return reply({ error: 'Could not read the attached file.' }, 400)
      }
      if (bytes.byteLength > MAX_FILE_BYTES) return reply({ error: 'File is too big — keep it under 12 MB.' }, 400)
      const path = `mobile/${invoiceDate}-${crypto.randomUUID()}.${ext}`
      const up = await db.storage.from('invoices').upload(path, bytes, { contentType: String(body.file.type) })
      if (up.error) return reply({ error: 'Upload failed — try again.' }, 500)
      fileUrl = db.storage.from('invoices').getPublicUrl(path).data.publicUrl
    }

    const { data: row, error } = await db
      .from('invoices')
      .insert({
        submission_id: `mobile-${crypto.randomUUID()}`,
        location_id: locationId,
        vendor_name_raw: vendorName,
        invoice_date: invoiceDate,
        amount,
        invoice_number: String(body?.invoice_number ?? '').trim().slice(0, 80) || null,
        category_id: body?.category_id || null,
        notes: String(body?.notes ?? '').trim().slice(0, 1000) || null,
        submitted_name: String(body?.submitted_name ?? '').trim().slice(0, 120) || null,
        file_url: fileUrl,
      })
      .select('id, status, flag_reasons, vendors(name)')
      .single()
    if (error) return reply({ error: 'Could not save the invoice — try again.' }, 500)
    return reply({ status: row.status, flag_reasons: row.flag_reasons ?? [], vendor: (row as any).vendors?.name ?? vendorName })
  }

  return reply({ error: 'unknown action' }, 400)
})
