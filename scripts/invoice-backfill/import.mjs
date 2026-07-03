#!/usr/bin/env node
/**
 * One-time invoice backfill (INVOICE_SYSTEM reference §9).
 * Reads backfill_invoices.json (1,226 deduped submissions extracted from the
 * Invoice Intake sheet: Processed tab = status truth, Fillout_Intake = live
 * unprocessed queue, per-location tabs = extra legacy rows) and inserts them
 * through the invoices rules-engine trigger:
 *   - approved / declined / imported_legacy rows keep their status (rules
 *     skipped, but vendor + category still resolve; they feed baselines)
 *   - 'pending_rules' rows (the unprocessed live queue) insert with no status
 *     so rules 1–4 run — most auto-approve, anomalies land in Review Queue
 * Then runs rollup_invoice_costs('2026-01-01', today).
 *
 * Idempotent: submission_id is unique; re-runs skip existing rows.
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const rows = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'backfill_invoices.json'), 'utf8'))

const { data: locs, error: locErr } = await supabase.from('locations').select('id, name')
if (locErr) throw new Error(locErr.message)
const locByName = Object.fromEntries(locs.map((l) => [l.name, l.id]))

const { data: existing } = await supabase.from('invoices').select('submission_id')
const seen = new Set((existing ?? []).map((r) => r.submission_id))

// Legacy/decided rows first (they build vendor baselines), then the live
// unprocessed queue through the rules engine — both in submission order.
const decided = rows.filter((r) => r.status !== 'pending_rules').sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
const pending = rows.filter((r) => r.status === 'pending_rules').sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))

const toRow = (r) => {
  const missingAmount = r.amount == null
  const row = {
    submission_id: r.submission_id,
    submitted_at: r.submitted_at,
    location_id: locByName[r.location],
    vendor_name_raw: r.vendor_raw || 'Unknown vendor',
    invoice_number: r.invoice_number || null,
    invoice_date: r.invoice_date,
    amount: r.amount ?? 0,
    file_url: r.file_url,
    evernote_link: r.evernote_link,
    evernote_id: r.evernote_id,
    notes: [r.notes, missingAmount ? '[import: amount missing on the sheet]' : null].filter(Boolean).join(' · ') || null,
  }
  if (r.status !== 'pending_rules') row.status = r.status
  return row
}

let inserted = 0
let skipped = 0
async function insertAll(list, label) {
  const fresh = list.filter((r) => !seen.has(r.submission_id) && locByName[r.location])
  const noLoc = list.filter((r) => !locByName[r.location])
  if (noLoc.length) console.log(`${label}: ${noLoc.length} rows skipped — unknown location`)
  skipped += list.length - fresh.length - noLoc.length
  for (let i = 0; i < fresh.length; i += 100) {
    const batch = fresh.slice(i, i + 100).map(toRow)
    const { error } = await supabase.from('invoices').insert(batch)
    if (error) throw new Error(`${label} batch at ${i}: ${error.message}`)
    inserted += batch.length
    console.log(`${label}: ${Math.min(i + 100, fresh.length)}/${fresh.length}`)
  }
}

await insertAll(decided, 'decided/legacy')
await insertAll(pending, 'live queue (rules engine)')
console.log(`inserted ${inserted} · already present ${skipped}`)

const { error: ruErr } = await supabase.rpc('rollup_invoice_costs', { p_from: '2026-01-01', p_to: new Date().toISOString().slice(0, 10) })
if (ruErr) throw new Error(`rollup failed: ${ruErr.message}`)
console.log('rollup_invoice_costs complete (2026-01-01 → today)')

const { data: stat } = await supabase.from('invoices').select('status')
const counts = {}
for (const s of stat ?? []) counts[s.status] = (counts[s.status] || 0) + 1
console.log('invoice status counts:', counts)
