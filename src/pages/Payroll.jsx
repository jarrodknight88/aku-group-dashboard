import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle from '../components/PageTitle.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, labelUpper } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { fetchLocations } from '../data/live.js'
import { payPeriod, fetchPayrollData, buildRun, pullTipsSheet, addSalaried } from '../data/payroll.js'
import { supabase } from '../lib/supabase.js'
import { fmtRange } from '../lib/dates.js'
import { TIP_HOLD_THRESHOLD, TIP_HOLD_DAYS, PAY_PERIOD_DAYS, ADP_CO_CODES } from '../config.js'

/* Payroll (handoff §9) — live: hours × rates from daily_labor (Toast pull),
   tips owed from daily_tips (reconciliation sheet, fetched on demand by the
   Run Payroll button through the pull-tips edge function). Check =
   (hours × rate) + tips owed; OT pays at the regular rate. Sheet names match
   Toast names via aliases + a conservative fuzzy pass; anything unmatched
   shows ● Review with tips excluded. Exporting stores the batch CSV in
   payroll_runs so past runs show exactly what was sent. */

const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const thRight = { padding: '12px 12px', fontWeight: 600 }
const thLeft = { textAlign: 'left', padding: '12px 12px', fontWeight: 600 }
const chip = (color, bg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
  color, background: bg, padding: '6px 12px', borderRadius: 7,
})
const pill = (color, bg) => ({ fontSize: 11, fontWeight: 700, color, background: bg, padding: '3px 9px', borderRadius: 5 })

/** Batch id + ADP CSV for a set of run rows (hourly + salaried). */
function buildCsv(hourly, salaried, batchId) {
  const pad = (s, n) => String(s).padEnd(n)
  const lines = [
    pad('Co Code', 8) + pad('Batch ID', 10) + pad('File #', 8) + pad('Employee', 22) +
    pad('Reg Hours', 11) + pad('Reg Rate', 10) + pad('Reg Earnings', 14) + pad('Code', 6) + pad('Tips Amt', 11) + 'Salary',
  ]
  let fileNo = 1041 // placeholder until real ADP file numbers are mapped
  for (const r of hourly) {
    lines.push(
      pad(r.coCode, 8) + pad(batchId, 10) + pad(String(fileNo++), 8) + pad(r.name.slice(0, 21), 22) +
      pad(r.hours.toFixed(2), 11) + pad(r.rate.toFixed(2), 10) + pad(r.wages.toFixed(2), 14) +
      pad(r.tips !== null ? 'T' : '—', 6) + pad(r.tips !== null ? r.tips.toFixed(2) : '0.00', 11) + '',
    )
  }
  for (const s of salaried) {
    lines.push(
      pad(s.coCode, 8) + pad(batchId, 10) + pad(String(fileNo++), 8) + pad(s.name.slice(0, 21), 22) +
      pad('0.00', 11) + pad('—', 10) + pad('0.00', 14) + pad('—', 6) + pad('0.00', 11) + Number(s.salary).toFixed(2),
    )
  }
  return lines.join('\n')
}

function ExportModal({ csv, subtitle, onClose, onDownload }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(16,26,42,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 940, maxWidth: '100%', maxHeight: '85vh', background: '#fff', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(10,20,40,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${colors.border}` }}>
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 600 }}>ADP Export Preview</div>
            <div style={{ fontSize: 12, color: colors.muted3, marginTop: 2 }}>{subtitle}</div>
          </div>
          <div onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: colors.panelGray, color: colors.muted1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>✕</div>
        </div>
        <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1 }}>
          <pre style={{ margin: 0, background: colors.navy, color: colors.brandTint4, padding: 16, borderRadius: 10, fontSize: 11, lineHeight: 1.65, whiteSpace: 'pre', overflow: 'auto' }}>{csv}</pre>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: `1px solid ${colors.border}`, background: '#FAFBFC' }}>
          <div style={{ fontSize: 11, color: colors.muted3 }}>Confirm Co Codes, earnings codes &amp; File #s against your ADP product — the template is configurable.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div onClick={onClose} style={{ padding: '10px 16px', border: `1px solid ${colors.borderStrong}`, borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 600, color: '#3A4150', cursor: 'pointer' }}>Cancel</div>
            {onDownload && (
              <div onClick={onDownload} style={{ padding: '10px 18px', background: colors.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Download .csv &amp; save batch
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Payroll() {
  const [locations, setLocations] = useState(null)
  const [loc, setLoc] = useState('all') // location code or 'all'
  const [offset, setOffset] = useState(0) // pay periods back from current
  const [data, setData] = useState({ loading: true })
  const [pullState, setPullState] = useState(null) // {running} | {msg, error}
  const [exportView, setExportView] = useState(null) // {csv, subtitle, live} | null
  const [draft, setDraft] = useState({ name: '', loc: 'atl', role: '', salary: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [sort, setSort] = useState({ key: 'check', dir: 'desc' })

  const period = useMemo(() => payPeriod(offset), [offset])

  useEffect(() => {
    fetchLocations().then(setLocations).catch(() => setLocations([]))
  }, [])

  useEffect(() => {
    let live = true
    setData({ loading: true })
    fetchPayrollData(period.start, period.end)
      .then((d) => live && setData({ loading: false, ...d }))
      .catch((e) => live && setData({ loading: false, error: e.message }))
    return () => { live = false }
  }, [period.start, period.end, reloadKey])

  const active = (locations ?? []).filter((l) => l.status === 'active')
  const locByCode = Object.fromEntries(active.map((l) => [l.code.toLowerCase(), l]))
  const locById = Object.fromEntries(active.map((l) => [l.id, l]))
  const coCode = (l) =>
    ADP_CO_CODES[(l?.code ?? '').toLowerCase()] ?? ((l?.name ?? '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'LOC')

  const run = useMemo(
    () => (data.labor ? buildRun(data, period.start, period.end) : { rows: [], unmatchedSheetNames: [], locTipDays: new Map() }),
    [data, period.start, period.end],
  )

  const scopeId = loc === 'all' ? null : locByCode[loc]?.id
  const sortVal = (r) =>
    sort.key === 'name' ? r.name.toLowerCase()
    : sort.key === 'role' ? (r.role || '').toLowerCase()
    : sort.key === 'tips' ? (r.tips ?? -1)
    : r[sort.key]
  const hourly = run.rows
    .filter((r) => (scopeId ? r.loc === scopeId : true))
    .sort((a, b) => {
      const va = sortVal(a)
      const vb = sortVal(b)
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb
      return (sort.dir === 'asc' ? c : -c) || b.check - a.check
    })
    .map((r) => ({ ...r, coCode: coCode(locById[r.loc]) }))

  // Sortable header cell: click to sort, click again to flip direction.
  const Th = ({ k, left, wide, children }) => (
    <th
      onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 'asc' ? 'desc' : 'asc') : k === 'name' || k === 'role' ? 'asc' : 'desc' }))}
      style={{ ...(left ? thLeft : thRight), ...(wide ? { padding: '12px 18px' } : {}), cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {children}
      <span style={{ color: colors.brand }}>{sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )
  const salaried = (data.salaried ?? [])
    .filter((s) => (scopeId ? s.location_id === scopeId : true))
    .map((s) => ({ ...s, coCode: coCode(locById[s.location_id]) }))
  const unmatched = run.unmatchedSheetNames.filter((u) => (scopeId ? u.loc === scopeId : true))

  const sumHours = hourly.reduce((a, r) => a + r.hours, 0)
  const sumOT = hourly.reduce((a, r) => a + r.ot, 0)
  const sumWages = hourly.reduce((a, r) => a + r.wages, 0)
  const sumTips = hourly.reduce((a, r) => a + (r.tips ?? 0), 0)
  const heldSum = hourly.reduce((a, r) => a + r.held, 0)
  const sumSalary = salaried.reduce((a, s) => a + Number(s.salary), 0)
  const reviewCount = hourly.filter((r) => !r.matched).length
  const laborDays = new Set((data.labor ?? []).filter((r) => (scopeId ? r.location_id === scopeId : true)).map((r) => r.business_date)).size
  const tipDays = scopeId
    ? (run.locTipDays.get(scopeId)?.size ?? 0)
    : [...run.locTipDays.values()].reduce((s, set) => s + set.size, 0)

  const batchId = `TG${period.end.slice(5, 7)}${period.end.slice(8, 10)}`
  const periodLabel = fmtRange(period.start, period.end)

  const runPayroll = async () => {
    setPullState({ running: true })
    const codes = loc === 'all' ? active.map((l) => l.code.toLowerCase()) : [loc]
    const results = []
    for (const code of codes) {
      try {
        const res = await pullTipsSheet(code, period.start, period.end)
        results.push(`${code.toUpperCase()}: ${res.totalRows} tip rows across ${res.days.length} nights`)
      } catch (e) {
        results.push(`${code.toUpperCase()}: ${e.message}`)
      }
    }
    setPullState({ msg: results.join(' · ') })
    setReloadKey((k) => k + 1)
  }

  const exportBatch = () => {
    const csv = buildCsv(hourly, salaried, batchId)
    setExportView({
      csv,
      live: true,
      subtitle: `Payroll batch CSV · ${periodLabel} · ${loc === 'all' ? 'All locations' : locByCode[loc]?.name} · ${hourly.length + salaried.length} employees · hours as regular earnings, tips as earnings code T`,
    })
  }

  const downloadAndSave = async () => {
    const csv = exportView.csv
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${batchId}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    const { data: saved, error } = await supabase
      .from('payroll_runs')
      .upsert(
        {
          period_start: period.start, period_end: period.end, batch_id: batchId,
          status: 'exported', exported_at: new Date().toISOString(), csv,
        },
        { onConflict: 'batch_id' },
      )
      .select('id')
      .single()
    if (!error && saved?.id) {
      // Stamp every released hold this export just paid, so the tip can't ride
      // along on a future run ("pays on the next run exported after approval").
      const holdIds = hourly.flatMap((r) => r.releasedHoldIds ?? [])
      if (holdIds.length) {
        await supabase.from('tip_holds').update({ released_run_id: saved.id, updated_at: new Date().toISOString() }).in('id', holdIds)
      }
    }
    if (!error) setReloadKey((k) => k + 1)
    setExportView(null)
  }

  const handleAdd = async () => {
    const amt = parseFloat(String(draft.salary).replace(/[$,]/g, ''))
    const target = locByCode[draft.loc]
    if (!draft.name.trim() || !(amt > 0) || !target) return
    try {
      await addSalaried(target.id, draft.name.trim(), draft.role.trim(), amt)
      setDraft({ name: '', loc: draft.loc, role: '', salary: '' })
      setReloadKey((k) => k + 1)
    } catch (e) {
      setPullState({ msg: `Add failed: ${e.message}` })
    }
  }

  const input = { width: '100%', padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit' }
  const allView = loc === 'all'

  const runsTable = (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'left' }}>
            <th style={{ ...thLeft, padding: '12px 18px' }}>Pay Period</th>
            <th style={thLeft}>Batch</th>
            <th style={thLeft}>ADP Status</th>
            <th style={{ padding: '12px 18px' }} />
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderTop: `1px solid ${colors.pageBg}`, background: '#FAFBFC' }}>
            <td style={{ padding: '13px 18px', fontWeight: 700 }}>
              {periodLabel}
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.brand, background: '#E8EEF6', padding: '2px 7px', borderRadius: 4, marginLeft: 6 }}>CURRENT</span>
            </td>
            <td style={{ padding: '13px 12px', color: colors.muted3 }}>{batchId}</td>
            <td style={{ padding: '13px 12px' }}><span style={pill(colors.muted1, colors.pageBg)}>In progress</span></td>
            <td style={{ padding: '13px 18px' }}>
              <span onClick={exportBatch} style={{ fontSize: 12, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>View</span>
            </td>
          </tr>
          {(data.runs ?? []).map((r) => (
            <tr key={r.id} style={{ borderTop: `1px solid ${colors.pageBg}` }}>
              <td style={{ padding: '13px 18px', fontWeight: 600 }}>{fmtRange(r.period_start, r.period_end)}</td>
              <td style={{ padding: '13px 12px', color: colors.muted3 }}>{r.batch_id}</td>
              <td style={{ padding: '13px 12px' }}>
                <span style={pill(colors.greenDark, colors.greenBg)}>✓ Exported {r.exported_at ? r.exported_at.slice(5, 10).replace('-', '/') : ''}</span>
              </td>
              <td style={{ padding: '13px 18px' }}>
                <span
                  onClick={() => setExportView({ csv: r.csv || '(no CSV stored)', subtitle: `Archived batch ${r.batch_id} · ${fmtRange(r.period_start, r.period_end)} — exactly as exported` })}
                  style={{ fontSize: 12, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}
                >
                  View
                </span>
              </td>
            </tr>
          ))}
          {(data.runs ?? []).length === 0 && (
            <tr style={{ borderTop: `1px solid ${colors.pageBg}` }}>
              <td colSpan={4} style={{ padding: '16px 18px', color: colors.muted3, fontSize: 12 }}>
                No exported batches yet — each ADP export saves its CSV here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="payroll" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '24px 26px 48px' }}>
        {/* ===== PAGE TITLE + PERIOD + ACTIONS ===== */}
        <PageTitle
          title="Payroll Run"
          meta={<>Hours from Toast · tips &amp; tip-out from nightly reconciliation sheet · overtime paid at straight time</>}
          right={
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 4, border: `1px solid ${colors.borderStrong}`, borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 600 }}>
                <span onClick={() => setOffset((o) => o - 1)} style={{ padding: '5px 10px', cursor: 'pointer', color: colors.muted1 }}>◀</span>
                <span style={{ padding: '5px 4px' }}>Pay Period: {periodLabel}</span>
                <span
                  onClick={() => offset < 0 && setOffset((o) => o + 1)}
                  style={{ padding: '5px 10px', cursor: offset < 0 ? 'pointer' : 'default', color: offset < 0 ? colors.muted1 : colors.muted4 }}
                >
                  ▶
                </span>
              </div>
              <div style={{ fontSize: 11, color: colors.muted3, marginTop: 5 }}>Biweekly · Tue – Mon · {PAY_PERIOD_DAYS} days</div>
            </div>
            <div
              onClick={pullState?.running ? undefined : runPayroll}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: colors.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: pullState?.running ? 0.7 : 1 }}
            >
              {pullState?.running ? 'Pulling tips sheet…' : 'Run Payroll'}
            </div>
              <div onClick={exportBatch} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', border: `1px solid ${colors.borderStrong}`, background: '#fff', color: colors.brand, borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Export to ADP
              </div>
            </div>
          }
        />

        {pullState?.msg && (
          <div style={{ padding: '10px 14px', background: '#E8EEF6', borderRadius: 9, color: colors.brand, fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
            {pullState.msg}
          </div>
        )}
        {data.error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            Couldn't load payroll data: {data.error}
          </div>
        )}
        {data.loading && <div style={{ padding: '40px 0', color: colors.muted3, fontSize: 13 }}>Loading payroll data…</div>}

        {!data.loading && !data.error && (
          <>
            {/* ===== SOURCE STATUS + LOCATION FILTER ===== */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
                {[['all', 'All locations'], ...active.map((l) => [l.code.toLowerCase(), l.name])].map(([code, label]) => (
                  <div
                    key={code}
                    onClick={() => setLoc(code)}
                    style={{ padding: '7px 14px', borderRadius: 6, background: code === loc ? colors.brand : 'transparent', color: code === loc ? '#fff' : colors.muted1, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <span style={laborDays > 0 ? chip(colors.greenDark, colors.greenBg) : chip(colors.red, colors.redBg)}>
                {laborDays > 0 ? `✓ Toast hours imported · ${laborDays} days` : '● No Toast hours — run the backfill'}
              </span>
              <span style={tipDays > 0 ? chip(colors.greenDark, colors.greenBg) : chip(colors.red, colors.redBg)}>
                {tipDays > 0 ? `✓ Tips sheet · ${tipDays} nights` : '● Tips sheet not pulled — press Run Payroll'}
              </span>
              {heldSum > 0 && (
                <Link to="/exceptions" style={chip(colors.brand, '#E8EEF6')}>{fmt(heldSum)} in large tips held</Link>
              )}
              {reviewCount > 0 && <span style={chip(colors.red, colors.redBg)}>● {reviewCount} needs review</span>}
            </div>

            {/* ===== SUMMARY TILES ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginBottom: 28 }}>
              <div style={{ background: colors.brand, borderRadius: 13, padding: 20, color: '#fff' }}>
                <div style={{ ...labelUpper, color: colors.brandTint3 }}>Total Payroll</div>
                <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 34, fontWeight: 600, marginTop: 6 }}>{fmt(sumWages + sumTips + sumSalary)}</div>
                <div style={{ fontSize: 11, color: colors.brandTint4, marginTop: 4 }}>{hourly.length} hourly · {salaried.length} salaried</div>
              </div>
              <div style={card}>
                <div style={labelUpper}>Hourly Wages</div>
                <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 34, fontWeight: 500, marginTop: 6 }}>{fmt(sumWages)}</div>
                <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>{sumHours.toFixed(2)} hrs · OT at straight time</div>
              </div>
              <div style={card}>
                <div style={labelUpper}>Tips &amp; Gratuity Owed</div>
                <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 34, fontWeight: 500, marginTop: 6 }}>{fmt(sumTips)}</div>
                <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>
                  {heldSum > 0 ? `Net of tip-out · ${fmt(heldSum)} held` : 'Net of tip-out · from recon sheet'}
                </div>
              </div>
              <div style={card}>
                <div style={labelUpper}>Salaries</div>
                <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 34, fontWeight: 500, marginTop: 6 }}>{fmt(sumSalary)}</div>
                <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>{salaried.length} salaried · per period</div>
              </div>
            </div>

            {allView ? (
              <>
                {/* ===== ALL-LOCATIONS DASHBOARD ===== */}
                <SectionHeader title="This Pay Period by Location" right={<span style={{ fontSize: 12, color: colors.muted3 }}>Open a location to review &amp; edit its run</span>} />
                <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 28 }}>
                  <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                        <th style={{ ...thLeft, padding: '12px 18px' }}>Location</th>
                        <th style={thLeft}>Employees</th>
                        <th style={thRight}>Hours</th>
                        <th style={thRight}>Hourly Wages</th>
                        <th style={thRight}>Tips Owed</th>
                        <th style={thRight}>Salaries</th>
                        <th style={thRight}>Total</th>
                        <th style={thLeft}>Status</th>
                        <th style={{ padding: '12px 18px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((l) => {
                        const h = run.rows.filter((r) => r.loc === l.id)
                        const s = (data.salaried ?? []).filter((x) => x.location_id === l.id)
                        const wages = h.reduce((a, r) => a + r.wages, 0)
                        const tips = h.reduce((a, r) => a + (r.tips ?? 0), 0)
                        const sal = s.reduce((a, x) => a + Number(x.salary), 0)
                        const reviews = h.filter((r) => !r.matched).length
                        return (
                          <tr key={l.id} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                            <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 700 }}>{l.name}</td>
                            <td style={{ textAlign: 'left', padding: '13px 12px', color: colors.muted2 }}>{h.length} hourly · {s.length} sal</td>
                            <td style={{ padding: '13px 12px' }}>{h.reduce((a, r) => a + r.hours, 0).toFixed(2)}</td>
                            <td style={{ padding: '13px 12px' }}>{fmt(wages)}</td>
                            <td style={{ padding: '13px 12px' }}>{fmt(tips)}</td>
                            <td style={{ padding: '13px 12px' }}>{fmt(sal)}</td>
                            <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(wages + tips + sal)}</td>
                            <td style={{ textAlign: 'left', padding: '13px 12px' }}>
                              {h.length === 0 ? (
                                <span style={pill(colors.muted1, colors.pageBg)}>No hours</span>
                              ) : (
                                <span style={reviews > 0 ? pill(colors.red, colors.redBg) : pill(colors.greenDark, colors.greenBg)}>
                                  {reviews > 0 ? `● ${reviews} needs review` : '✓ Ready'}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '13px 18px' }}>
                              <span onClick={() => setLoc(l.code.toLowerCase())} style={{ fontSize: 12, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>Open run →</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <SectionHeader title="Previous Payrolls" right={<span style={{ fontSize: 12, color: colors.muted3 }}>Saved after each ADP export · company-wide</span>} />
                {runsTable}
              </>
            ) : (
              <>
                {/* ===== HOURLY TABLE (run view) ===== */}
                <SectionHeader title="Hourly Employees" right={<span style={{ fontSize: 12, color: colors.muted3 }}>Check = (hours × rate) + tips owed</span>} />
                <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: unmatched.length ? 12 : 28 }}>
                  <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                        <Th k="name" left wide>Employee</Th>
                        <Th k="role" left>Role</Th>
                        <Th k="hours">Hours</Th>
                        <Th k="ot">of which OT</Th>
                        <Th k="rate">Rate</Th>
                        <Th k="wages">Hourly Pay</Th>
                        <Th k="tips">Tips Owed</Th>
                        <th style={thRight}>Match</th>
                        <Th k="check" wide>Check Total</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {hourly.length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ padding: '18px', color: colors.muted3, fontSize: 12 }}>
                            No Toast hours for this location in {periodLabel} — run the Toast backfill for this range first.
                          </td>
                        </tr>
                      )}
                      {hourly.map((r) => (
                        <tr key={r.guid} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                          <td style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 700 }}>{r.name}</td>
                          <td style={{ textAlign: 'left', padding: 12, color: colors.muted2 }}>{r.role || '—'}</td>
                          <td style={{ padding: 12 }}>{r.hours.toFixed(2)}</td>
                          <td style={{ padding: 12, color: colors.muted3 }}>{r.ot > 0 ? r.ot.toFixed(2) : '—'}</td>
                          <td style={{ padding: 12 }}>{fmt(r.rate)}</td>
                          <td style={{ padding: 12 }}>{fmt(r.wages)}</td>
                          <td style={{ padding: 12 }}>
                            {r.matched ? fmt(r.tips) : '—'}
                            {(r.held > 0 || r.released > 0) && (
                              <div style={{ fontSize: 10, fontWeight: 700, color: r.held > 0 ? colors.brand : colors.greenDark, marginTop: 2 }}>
                                {r.held > 0
                                  ? `− ${fmt(r.held)} held · rel ${r.heldRel ?? ''}`
                                  : `+ ${fmt(r.released)} released ${r.releasedAt ?? ''}`}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: 12 }}>
                            <span style={r.matched ? pill(colors.greenDark, colors.greenBg) : pill(colors.red, colors.redBg)}>
                              {r.matched ? '✓ Matched' : '● Review'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 18px', fontWeight: 700 }}>{fmt(r.check)}</td>
                        </tr>
                      ))}
                      {hourly.length > 0 && (
                        <tr style={{ borderTop: `2px solid ${colors.border}`, textAlign: 'right', background: colors.panelGray }}>
                          <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 700 }}>Totals</td>
                          <td />
                          <td style={{ padding: '13px 12px', fontWeight: 700 }}>{sumHours.toFixed(2)}</td>
                          <td style={{ padding: '13px 12px', color: colors.muted3 }}>{sumOT > 0 ? sumOT.toFixed(2) : '—'}</td>
                          <td />
                          <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(sumWages)}</td>
                          <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(sumTips)}</td>
                          <td />
                          <td style={{ padding: '13px 18px', fontWeight: 800 }}>{fmt(sumWages + sumTips)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {unmatched.length > 0 && (
                  <div style={{ padding: '10px 14px', background: '#FBF3DC', borderRadius: 9, color: '#8A6D1A', fontSize: 12, fontWeight: 600, marginBottom: 28 }}>
                    On the tips sheet but not matched to Toast hours: {unmatched.map((u) => `${u.name} (${fmt(u.amount)})`).join(' · ')} — add an
                    alias in employee_aliases or fix the sheet spelling, then Run Payroll again.
                  </div>
                )}

                {/* ===== SALARIED ===== */}
                <SectionHeader title="Salaried Employees" right={<span style={{ fontSize: 12, color: colors.muted3 }}>Added manually · not in Toast hours</span>} />
                <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                        <th style={{ ...thLeft, padding: '12px 18px' }}>Employee</th>
                        <th style={thLeft}>Location</th>
                        <th style={thLeft}>Role</th>
                        <th style={thRight}>Salary / period</th>
                        <th style={{ ...thRight, padding: '12px 18px' }}>Check Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaried.map((s) => (
                        <tr key={s.id} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                          <td style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 700 }}>{s.name}</td>
                          <td style={{ textAlign: 'left', padding: 12 }}>{locById[s.location_id]?.name ?? ''}</td>
                          <td style={{ textAlign: 'left', padding: 12 }}>{s.role}</td>
                          <td style={{ padding: 12 }}>{fmt(s.salary)}</td>
                          <td style={{ padding: '12px 18px', fontWeight: 700 }}>{fmt(s.salary)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: `1px solid ${colors.pageBg}`, background: '#FAFBFC' }}>
                        <td style={{ padding: '10px 18px' }}>
                          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Full name" style={input} />
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <select value={draft.loc} onChange={(e) => setDraft({ ...draft, loc: e.target.value })} style={{ ...input, background: '#fff' }}>
                            {active.map((l) => (
                              <option key={l.id} value={l.code.toLowerCase()}>{l.name}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Role" style={input} />
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <input value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: e.target.value })} placeholder="$ per period" style={{ ...input, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                          <div onClick={handleAdd} style={{ display: 'inline-flex', padding: '8px 16px', background: colors.brand, color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
                  Overtime hours are paid at the regular rate per current policy — the export sends all hours as regular earnings.
                  "Needs review" = Toast hours with no matching tips-sheet row for this period; fix the sheet name or add an alias and
                  press Run Payroll again. Tips over ${TIP_HOLD_THRESHOLD} on a single transaction are auto-held for {TIP_HOLD_DAYS}{' '}
                  days (chargeback window): held amounts are excluded from tips owed and notated on the row, then added to a later
                  run's check when released — also notated.
                </div>

                <SectionHeader
                  title="Previous Payrolls"
                  sub={locByCode[loc]?.name}
                  style={{ margin: '28px 0 14px' }}
                  right={<span style={{ fontSize: 12, color: colors.muted3 }}>Each exported batch, exactly as sent</span>}
                />
                {runsTable}
              </>
            )}
          </>
        )}
      </div>

      {exportView && (
        <ExportModal
          csv={exportView.csv}
          subtitle={exportView.subtitle}
          onClose={() => setExportView(null)}
          onDownload={exportView.live ? downloadAndSave : null}
        />
      )}
    </div>
  )
}
