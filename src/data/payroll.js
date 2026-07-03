import { supabase } from '../lib/supabase.js'
import { PAY_PERIOD_DAYS, PAYROLL_ANCHOR } from '../config.js'
import { toStr, fromStr, addDays } from '../lib/dates.js'

/* Payroll data layer (handoff §9).
   check = (hours × rate) + tips owed · OT at straight time.
   Hours/rates come from daily_labor (Toast pull); tips owed from daily_tips
   (reconciliation sheet via the pull-tips edge function; amounts are already
   net of tip-out). Sheet names match Toast names via normalization, the
   employee_aliases table, and a conservative fuzzy pass — anything ambiguous
   or unmatched surfaces as ● Review with its tips excluded, per spec. */

/** Biweekly Tue–Mon period at `offset` from the one containing today. */
export function payPeriod(offset = 0) {
  const anchor = fromStr(PAYROLL_ANCHOR)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const idx = Math.floor((today - anchor) / 86_400_000 / PAY_PERIOD_DAYS) + offset
  const start = addDays(anchor, idx * PAY_PERIOD_DAYS)
  const end = addDays(start, PAY_PERIOD_DAYS - 1)
  return { start: toStr(start), end: toStr(end) }
}

export async function fetchPayrollData(start, end) {
  const [labor, tips, aliases, salaried, holds, runs, rates] = await Promise.all([
    supabase.from('daily_labor').select('*').gte('business_date', start).lte('business_date', end),
    supabase.from('daily_tips').select('*').gte('business_date', start).lte('business_date', end),
    supabase.from('employee_aliases').select('*'),
    supabase.from('salaried_employees').select('*').eq('active', true),
    supabase.from('tip_holds').select('*'),
    supabase.from('payroll_runs').select('*').order('period_start', { ascending: false }).limit(12),
    supabase.from('employee_rates').select('*'),
  ])
  const firstError = [labor, tips, aliases, salaried, holds, runs, rates].find((r) => r.error)
  if (firstError) throw new Error(firstError.error.message)
  return {
    labor: labor.data ?? [],
    tips: tips.data ?? [],
    aliases: aliases.data ?? [],
    salaried: salaried.data ?? [],
    holds: holds.data ?? [],
    runs: runs.data ?? [],
    rates: rates.data ?? [],
  }
}

/** Set (or clear, with rate == null) an employee's dashboard hourly rate.
    One rate per employee; it applies to every period until changed. */
export async function saveEmployeeRate(locationId, guid, name, rate) {
  if (rate == null) {
    const { error } = await supabase.from('employee_rates').delete().eq('employee_guid', guid)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase
    .from('employee_rates')
    .upsert(
      { location_id: locationId, employee_guid: guid, employee_name: name, rate, updated_at: new Date().toISOString() },
      { onConflict: 'employee_guid' },
    )
  if (error) throw new Error(error.message)
}

export const normName = (s) =>
  (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()

/** Fuzzy pass, calibrated on the real sheet↔Toast name pairs. A tip name only
    matches when exactly one employee qualifies:
    - same last name + compatible first name (or the mirrored form), where
      compatible = equal, contained ("liyah"⊂"aliyah", "kenzie"⊂"mckenzie"),
      or same initial ("kiki"→"kibbyann");
    - or a single-token sheet name ("Cesar", "Lynda") equal to / contained in
      exactly one employee's first name. */
function fuzzyCandidates(sheetNorm, employees) {
  const t = sheetNorm.split(' ')
  const compat = (a, b) =>
    a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b)) || a[0] === b[0]
  if (t.length === 1) {
    return employees.filter((e) => {
      const ef = e.normName.split(' ')[0]
      return ef === t[0] || (t[0].length >= 3 && ef.includes(t[0])) || (ef.length >= 3 && t[0].includes(ef))
    })
  }
  const [first, last] = [t[0], t[t.length - 1]]
  return employees.filter((e) => {
    const et = e.normName.split(' ')
    if (et.length < 2) return false
    const [ef, el] = [et[0], et[et.length - 1]]
    return (el === last && compat(ef, first)) || (ef === first && compat(el, last))
  })
}

/**
 * Build the pay-period run: one hourly row per Toast employee with matched
 * sheet tips, hold/release notations, and weekly-OT split (informational —
 * everything pays at straight time). Returns unmatched sheet names too.
 */
export function buildRun({ labor, tips, aliases, holds, rates }, periodStart, periodEnd) {
  // --- roll up Toast labor per employee ---
  const byEmp = new Map()
  const startDate = fromStr(periodStart)
  for (const r of labor) {
    let e = byEmp.get(r.employee_guid)
    if (!e) {
      byEmp.set(r.employee_guid, (e = {
        guid: r.employee_guid, name: r.employee_name || r.employee_guid.slice(0, 8),
        loc: r.location_id, jobs: {}, weeks: {}, hours: 0, wagesC: 0,
      }))
    }
    const hours = Number(r.hours) || 0
    e.hours += hours
    e.wagesC += Math.round(Number(r.wages) * 100)
    e.jobs[r.job_title] = (e.jobs[r.job_title] || 0) + hours
    const week = Math.floor((fromStr(r.business_date) - startDate) / 86_400_000 / 7)
    e.weeks[week] = (e.weeks[week] || 0) + hours
  }
  // Dashboard rates override Toast wages: Toast time entries rarely carry a
  // wage, so the entered rate × Toast hours is the wages source of truth.
  const rateMap = new Map((rates ?? []).map((r) => [r.employee_guid, Number(r.rate)]))
  const employees = [...byEmp.values()].map((e) => {
    const dashRate = rateMap.get(e.guid)
    const rate = dashRate ?? (e.hours > 0 ? e.wagesC / 100 / e.hours : 0)
    const wages = dashRate != null ? Math.round(e.hours * dashRate * 100) / 100 : e.wagesC / 100
    return {
      ...e,
      normName: normName(e.name),
      role: Object.entries(e.jobs).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
      ot: Object.values(e.weeks).reduce((s, h) => s + Math.max(0, h - 40), 0),
      rate,
      wages,
      rateSource: dashRate != null ? 'dashboard' : rate > 0 ? 'toast' : 'none',
    }
  })

  // --- roll up sheet tips per (location, name) ---
  const tipTotals = new Map()
  for (const t of tips) {
    const key = `${t.location_id}|${normName(t.employee_name)}`
    const cur = tipTotals.get(key) ?? { name: t.employee_name, loc: t.location_id, amount: 0 }
    cur.amount += Number(t.amount) || 0
    tipTotals.set(key, cur)
  }

  // --- match tips → employees: alias, exact, then unique fuzzy ---
  const aliasMap = new Map(aliases.map((a) => [`${a.location_id ?? ''}|${normName(a.sheet_name)}`, a]))
  const tipsByGuid = new Map()
  const unmatchedSheetNames = []
  for (const t of tipTotals.values()) {
    const locEmps = employees.filter((e) => e.loc === t.loc)
    const alias = aliasMap.get(`${t.loc}|${normName(t.name)}`) ?? aliasMap.get(`|${normName(t.name)}`)
    let emp = alias?.toast_guid ? locEmps.find((e) => e.guid === alias.toast_guid) : null
    if (!emp && alias?.toast_name) emp = locEmps.find((e) => e.normName === normName(alias.toast_name))
    if (!emp) emp = locEmps.find((e) => e.normName === normName(t.name))
    if (!emp) {
      const c = fuzzyCandidates(normName(t.name), locEmps)
      if (c.length === 1) emp = c[0]
    }
    if (emp) tipsByGuid.set(emp.guid, (tipsByGuid.get(emp.guid) || 0) + t.amount)
    else unmatchedSheetNames.push({ name: t.name, loc: t.loc, amount: t.amount })
  }

  // --- large-tip holds ---
  // A held tip is excluded from the run whose period it was FLAGGED in (that
  // period's sheet tips include it). A released hold pays on the NEXT run
  // exported after approval: eligible once approved (release_at = approval
  // date) and not yet stamped with the run that paid it (released_run_id,
  // set at export time — see Payroll's download-and-save).
  const inPeriod = (iso) => iso && iso.slice(0, 10) >= periodStart && iso.slice(0, 10) <= periodEnd
  const holdsByName = (list) => {
    const m = new Map()
    for (const h of list) {
      const k = `${h.location_id}|${normName(h.server_name)}`
      m.set(k, (m.get(k) ?? []).concat(h))
    }
    return m
  }
  const todayIso = new Date().toISOString().slice(0, 10)
  const heldMap = holdsByName(holds.filter((h) => h.status === 'held' && inPeriod(h.flagged_at)))
  const releasedMap = holdsByName(
    holds.filter(
      (h) =>
        h.status === 'released' &&
        !h.released_run_id &&
        h.release_at <= (periodEnd < todayIso ? periodEnd : todayIso),
    ),
  )

  const locTipDays = new Map() // location_id -> distinct tip dates (feed presence)
  for (const t of tips) {
    if (!locTipDays.has(t.location_id)) locTipDays.set(t.location_id, new Set())
    locTipDays.get(t.location_id).add(t.business_date)
  }

  const rows = employees.map((e) => {
    const key = `${e.loc}|${e.normName}`
    const held = (heldMap.get(key) ?? []).reduce((s, h) => s + Number(h.amount), 0)
    const heldRel = (heldMap.get(key) ?? [])[0]?.release_at
    const released = (releasedMap.get(key) ?? []).reduce((s, h) => s + Number(h.amount), 0)
    const releasedAt = (releasedMap.get(key) ?? [])[0]?.release_at
    const sheetTips = tipsByGuid.has(e.guid) ? tipsByGuid.get(e.guid) : null
    const matched = sheetTips !== null
    const payable = matched ? Math.max(0, sheetTips - held) + released : null
    return {
      ...e,
      sheetTips, held, heldRel, released, releasedAt, matched,
      releasedHoldIds: (releasedMap.get(key) ?? []).map((h) => h.id),
      tips: payable,
      check: e.wages + (payable ?? 0),
    }
  })

  return { rows, unmatchedSheetNames, locTipDays }
}

/** Pull the reconciliation sheet for a period via the pull-tips edge function. */
export async function pullTipsSheet(locationCode, start, end) {
  const { data, error } = await supabase.functions.invoke('pull-tips', {
    body: { start, end, location_code: locationCode },
  })
  if (error) {
    // FunctionsHttpError carries the response; surface the function's message.
    let msg = error.message
    try {
      const body = await error.context?.json()
      if (body?.error) msg = body.error
    } catch { /* keep original message */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function addSalaried(locationId, name, role, salary) {
  const { error } = await supabase
    .from('salaried_employees')
    .insert({ location_id: locationId, name, role: role || 'Salaried', salary })
  if (error) throw new Error(error.message)
}
