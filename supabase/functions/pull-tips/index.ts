// pull-tips — reads the nightly reconciliation Google Sheet (one tab per day,
// MM.dd.yy) for a date range and replaces those days' rows in daily_tips.
// Invoked by the dashboard's Run Payroll button with the signed-in user's JWT;
// only org admins pass. The sheet is read via the anonymous CSV export, so it
// must be link-shared as Viewer (the function returns a clear error if not).
//
// Section semantics mirror the sheet's weekly gratuity script exactly:
// rows above the first tipout-job row (Barback / Hookah Master / Service Bar /
// Host in column B) take column K (earned tips, net of tip-out); rows at or
// below take column C (tipout received); same-name rows are summed.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// Per-location reconciliation sheets. Grows as other venues adopt the sheet.
const SHEETS: Record<string, string> = {
  atl: '1D_LsMdVuheVx9RqM_3pSiYv6y0QhMsAbDUHUpmNJAOw', // Brookhaven = Teranga ATL
}

const TIPOUT_JOB_PATTERNS = [/\bbarback\b/i, /\bhookah master\b/i, /\bservice bar\b(?!tender)/i, /\bhost\b/i]
const EXCLUDE_NAMES = new Set([
  'Day Shift', 'Night Shift', 'APD', 'Hookah Tipout', 'Barback Tipout', 'Bartender Tipout',
  'Final House Cash', 'Expected Cash', 'Name', '',
])

/** Minimal CSV parser (handles quoted fields with commas/newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

const money = (v: string | undefined) => Number(String(v ?? '').replace(/[^0-9.\-]/g, '')) || 0

const pad2 = (n: number) => String(n).padStart(2, '0')
const tabNameFor = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${m}.${d}.${y.slice(2)}` // MM.dd.yy
}

function datesInRange(startIso: string, endIso: string): string[] {
  const out: string[] = []
  const d = new Date(startIso + 'T00:00:00Z')
  const end = new Date(endIso + 'T00:00:00Z')
  while (d <= end) {
    out.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

Deno.serve(async (req: Request) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    // Authorize the caller: must be a signed-in org admin.
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: isAdmin, error: adminErr } = await caller.rpc('is_org_admin')
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Only an owner or admin can pull the tips sheet.' }), { status: 403, headers })
    }

    const { start, end, location_code } = await req.json()
    const code = String(location_code ?? '').toLowerCase()
    const sheetId = SHEETS[code]
    if (!sheetId) {
      return new Response(JSON.stringify({ error: `No reconciliation sheet configured for location "${code}".` }), { status: 400, headers })
    }
    const dates = datesInRange(start, end)
    if (!dates.length || dates.length > 92) {
      return new Response(JSON.stringify({ error: 'Date range must be 1–92 days.' }), { status: 400, headers })
    }

    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: loc, error: locErr } = await service.from('locations').select('id').ilike('code', code).single()
    if (locErr || !loc) {
      return new Response(JSON.stringify({ error: `Unknown location code "${code}".` }), { status: 400, headers })
    }

    const days: { date: string; tab: string; rows: number }[] = []
    const skipped: string[] = []
    let authFailure = false

    for (const date of dates) {
      const tab = tabNameFor(date)
      const res = await fetch(
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`,
        { redirect: 'follow' },
      )
      const body = await res.text()
      // No-access and missing-tab both come back as non-CSV; a login redirect
      // (HTML) on every tab means the sheet is not link-readable.
      if (!res.ok || body.trimStart().startsWith('<')) {
        if (body.includes('accounts.google.com') || res.status === 401 || res.status === 403) authFailure = true
        skipped.push(tab)
        continue
      }

      const data = parseCsv(body)
      let tipoutStart = Infinity
      for (let r = 0; r < data.length; r++) {
        const job = (data[r][1] ?? '').toString().trim()
        if (job && TIPOUT_JOB_PATTERNS.some((p) => p.test(job))) { tipoutStart = r; break }
      }

      const byName = new Map<string, { name: string; amount: number; section: string }>()
      for (let r = 1; r < data.length; r++) {
        const rawName = (data[r][0] ?? '').toString().trim()
        if (!rawName || EXCLUDE_NAMES.has(rawName) || /\d/.test(rawName)) continue
        const isTipout = r >= tipoutStart
        const amt = money(data[r][isTipout ? 2 : 10])
        if (!amt) continue
        const key = rawName.toLowerCase()
        const cur = byName.get(key) ?? { name: rawName, amount: 0, section: isTipout ? 'tipout' : 'earned' }
        cur.amount += amt
        if (!isTipout) cur.section = 'earned'
        byName.set(key, cur)
      }

      // Replace this location-day wholesale (idempotent re-pulls).
      const del = await service.from('daily_tips').delete().eq('location_id', loc.id).eq('business_date', date)
      if (del.error) throw new Error(`daily_tips delete failed: ${del.error.message}`)
      const rows = [...byName.values()].map((r) => ({
        location_id: loc.id, business_date: date, employee_name: r.name,
        amount: Math.round(r.amount * 100) / 100, section: r.section,
      }))
      if (rows.length) {
        const ins = await service.from('daily_tips').insert(rows)
        if (ins.error) throw new Error(`daily_tips insert failed: ${ins.error.message}`)
      }
      days.push({ date, tab, rows: rows.length })
    }

    if (authFailure && days.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            'The reconciliation sheet is not link-readable. In Google Sheets: Share → General access → "Anyone with the link" → Viewer, then run again.',
        }),
        { status: 502, headers },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, totalRows: days.reduce((s, d) => s + d.rows, 0), days, skipped }),
      { headers },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers })
  }
})
