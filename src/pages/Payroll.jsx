import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, labelUpper } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { TIP_HOLD_THRESHOLD, TIP_HOLD_DAYS } from '../config.js'

/* Payroll (handoff §9) — company dashboard + per-location run views.
   Check = (total hours × rate) + tips owed. OT pays at the REGULAR rate (no
   1.5×); the ADP export sends all hours as regular earnings with OT in its
   own read-only column. Hours/rates come from the Toast payroll export and
   tips (net of tip-out) from the nightly reconciliation sheet — both feeds
   pending, so this ships on the handoff's sample rows. Real runs land in
   payroll_runs / payroll_lines with the exported CSV stored per batch. */

const NAMES = { atl: 'Teranga ATL', clt: 'Teranga CLT', afro: 'Afro District' }
const CO_CODES = { atl: 'TGA', clt: 'TGC', afro: 'AFD' }

// Sample current-period rows (Toast hours ⨯ tips sheet). `tips: null` =
// unmatched sheet row → excluded from the check until resolved (● Review).
// tipHold/tipRelease are the §8 large-tip notations.
const HOURLY = [
  { name: 'M. Diallo', role: 'Server', loc: 'atl', hours: 82.5, ot: 4.5, rate: 12.0, tips: 2140.5, tipOut: 428.1, tipHold: { amt: 640.0, rel: 'Oct 4' } },
  { name: 'A. Sow', role: 'Server', loc: 'atl', hours: 78.0, ot: 0, rate: 12.0, tips: 1962.25, tipOut: 392.45, tipRelease: { amt: 780.0, note: 'released Sep 29' } },
  { name: 'T. Ndiaye', role: 'Server', loc: 'atl', hours: 71.25, ot: 0, rate: 11.5, tips: 1704.0, tipOut: 340.8 },
  { name: 'K. Toure', role: 'Bartender', loc: 'atl', hours: 80.0, ot: 2.0, rate: 14.0, tips: 1856.75, tipOut: 0 },
  { name: 'O. Mbaye', role: 'Hookah', loc: 'atl', hours: 68.5, ot: 0, rate: 13.0, tips: 1122.0, tipOut: 0 },
  { name: 'K. Owusu', role: 'Server', loc: 'clt', hours: 76.75, ot: 1.25, rate: 11.5, tips: 1688.5, tipOut: 337.7 },
  { name: 'R. Bah', role: 'Server', loc: 'clt', hours: 69.0, ot: 0, rate: 11.5, tips: 1512.75, tipOut: 302.55 },
  { name: 'D. Fall', role: 'Bartender', loc: 'clt', hours: 77.5, ot: 3.5, rate: 14.0, tips: 1594.25, tipOut: 0 },
  { name: 'Y. Diop', role: 'Hookah', loc: 'clt', hours: 64.0, ot: 0, rate: 13.0, tips: 918.5, tipOut: 0 },
  { name: 'J. Mensah', role: 'Server', loc: 'afro', hours: 74.25, ot: 0, rate: 11.0, tips: null, tipOut: null },
  { name: 'F. Kamara', role: 'Server', loc: 'afro', hours: 70.5, ot: 0, rate: 11.0, tips: 1428.0, tipOut: 285.6 },
  { name: 'R. Cisse', role: 'Bartender', loc: 'afro', hours: 75.0, ot: 1.0, rate: 13.5, tips: 1370.25, tipOut: 0 },
]

// Archived batches; `f` scales the sample current-period figures per run.
const PREV = [
  { period: 'Sep 1 – 14', checks: 'Sep 19', emp: '12 hourly · 3 sal', batch: 'TG0914', f: 0.97 },
  { period: 'Aug 18 – 31', checks: 'Sep 5', emp: '12 hourly · 3 sal', batch: 'TG0831', f: 0.93 },
  { period: 'Aug 4 – 17', checks: 'Aug 22', emp: '13 hourly · 3 sal', batch: 'TG0817', f: 1.02 },
  { period: 'Jul 21 – Aug 3', checks: 'Aug 8', emp: '13 hourly · 3 sal', batch: 'TG0803', f: 0.9 },
  { period: 'Jul 7 – 20', checks: 'Jul 25', emp: '12 hourly · 3 sal', batch: 'TG0720', f: 0.96 },
  { period: 'Jun 23 – Jul 6', checks: 'Jul 11', emp: '11 hourly · 3 sal', batch: 'TG0706', f: 0.88 },
]

const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const thRight = { padding: '12px 12px', fontWeight: 600 }
const thLeft = { textAlign: 'left', padding: '12px 12px', fontWeight: 600 }
const chip = (color, bg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
  color, background: bg, padding: '6px 12px', borderRadius: 7,
})
const pill = (color, bg) => ({ fontSize: 11, fontWeight: 700, color, background: bg, padding: '3px 9px', borderRadius: 5 })

/** Payable tips (§8/§9 math): sheet tips (net of tip-out) + released holds; held amounts excluded. */
const payableTips = (r) => (r.tips === null ? null : r.tips + (r.tipRelease ? r.tipRelease.amt : 0))

/* ---------- ADP export preview modal ---------- */

function ExportModal({ hourly, salaried, archived, scopeLabel, onClose }) {
  const csvF = archived ? archived.f : 1
  const csvBatch = archived ? archived.batch : 'TG0928'
  const pad = (s, n) => String(s).padEnd(n)
  const header =
    pad('Co Code', 8) + pad('Batch ID', 10) + pad('File #', 8) + pad('Employee', 16) +
    pad('Reg Hours', 11) + pad('Reg Rate', 10) + pad('Reg Earnings', 14) + pad('Code', 6) + pad('Tips Amt', 11) + 'Salary'
  let fileNo = 1041
  const lines = [header]
  for (const r of hourly) {
    const hrs = r.hours * csvF
    const wages = hrs * r.rate
    const tips = archived ? (r.tips === null ? 1400 : r.tips) * csvF : payableTips(r)
    lines.push(
      pad(CO_CODES[r.loc], 8) + pad(csvBatch, 10) + pad(String(fileNo++), 8) + pad(r.name, 16) +
      pad(hrs.toFixed(2), 11) + pad(r.rate.toFixed(2), 10) + pad(wages.toFixed(2), 14) +
      pad(tips !== null ? 'T' : '—', 6) + pad(tips !== null ? tips.toFixed(2) : '0.00', 11) + '',
    )
  }
  for (const s of salaried) {
    lines.push(
      pad(CO_CODES[s.loc], 8) + pad(csvBatch, 10) + pad(String(fileNo++), 8) + pad(s.name, 16) +
      pad('0.00', 11) + pad('—', 10) + pad('0.00', 14) + pad('—', 6) + pad('0.00', 11) + s.salary.toFixed(2),
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(16,26,42,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 940, maxWidth: '100%', maxHeight: '85vh', background: '#fff', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(10,20,40,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${colors.border}` }}>
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 600 }}>ADP Export Preview</div>
            <div style={{ fontSize: 12, color: colors.muted3, marginTop: 2 }}>
              Payroll batch CSV · {archived ? archived.period : 'Sep 15 – Sep 28 (current)'} · {scopeLabel} ·{' '}
              {hourly.length + salaried.length} employees · hours as regular earnings, tips as earnings code T
            </div>
          </div>
          <div onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: colors.panelGray, color: colors.muted1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>✕</div>
        </div>
        <div style={{ padding: '20px 24px', overflow: 'auto', flex: 1 }}>
          <pre style={{ margin: 0, background: colors.navy, color: colors.brandTint4, padding: 16, borderRadius: 10, fontSize: 11, lineHeight: 1.65, whiteSpace: 'pre', overflow: 'auto' }}>
            {lines.join('\n')}
          </pre>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: `1px solid ${colors.border}`, background: '#FAFBFC' }}>
          <div style={{ fontSize: 11, color: colors.muted3 }}>Column template is configurable to your ADP company codes &amp; earnings codes before wiring.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div onClick={onClose} style={{ padding: '10px 16px', border: `1px solid ${colors.borderStrong}`, borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 600, color: '#3A4150', cursor: 'pointer' }}>Cancel</div>
            <div style={{ padding: '10px 18px', background: colors.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>⤓ Download .csv</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export default function Payroll() {
  const [loc, setLoc] = useState('all')
  const [exportOpen, setExportOpen] = useState(false)
  const [exportRun, setExportRun] = useState(null) // index into PREV, or null = current
  const [salaried, setSalaried] = useState([
    { name: 'B. Toure', loc: 'atl', role: 'General Manager', salary: 3269.23 },
    { name: 'E. Diagne', loc: 'atl', role: 'Executive Chef', salary: 2884.62 },
    { name: 'N. Sylla', loc: 'clt', role: 'General Manager', salary: 3076.92 },
  ])
  const [draft, setDraft] = useState({ name: '', loc: 'atl', role: '', salary: '' })

  const inScope = (r) => loc === 'all' || r.loc === loc
  const hourly = HOURLY.filter(inScope)
  const scoped = salaried.filter(inScope)

  const sumHours = hourly.reduce((a, r) => a + r.hours, 0)
  const sumOT = hourly.reduce((a, r) => a + r.ot, 0)
  const sumWages = hourly.reduce((a, r) => a + r.hours * r.rate, 0)
  const sumTips = hourly.reduce((a, r) => a + (payableTips(r) ?? 0), 0)
  const heldSum = hourly.reduce((a, r) => a + (r.tipHold ? r.tipHold.amt : 0), 0)
  const sumTipOut = hourly.reduce((a, r) => a + (r.tipOut || 0), 0)
  const sumSalary = scoped.reduce((a, s) => a + s.salary, 0)
  const reviewCount = hourly.filter((r) => r.tips === null).length

  // per-location rollup for the company dashboard view
  const locSummary = ['atl', 'clt', 'afro'].map((code) => {
    const h = HOURLY.filter((r) => r.loc === code)
    const s = salaried.filter((x) => x.loc === code)
    const wages = h.reduce((a, r) => a + r.hours * r.rate, 0)
    const tips = h.reduce((a, r) => a + (r.tips || 0), 0)
    const sal = s.reduce((a, x) => a + x.salary, 0)
    const reviews = h.filter((r) => r.tips === null).length
    return {
      code,
      emp: `${h.length} hourly · ${s.length} sal`,
      hours: h.reduce((a, r) => a + r.hours, 0).toFixed(2),
      wages, tips, sal,
      total: wages + tips + sal,
      reviews,
    }
  })

  // archived batches — reconstruct this scope's share of each run
  const runSums = (f, sc) => {
    const h = sc === 'all' ? HOURLY : HOURLY.filter((r) => r.loc === sc)
    const s = sc === 'all' ? salaried : salaried.filter((x) => x.loc === sc)
    return {
      wages: h.reduce((a, r) => a + r.hours * f * r.rate, 0),
      tips: h.reduce((a, r) => a + (r.tips === null ? 1400 : r.tips) * f, 0),
      sal: s.reduce((a, x) => a + x.salary, 0),
    }
  }

  const addSalaried = () => {
    const amt = parseFloat(String(draft.salary).replace(/[$,]/g, ''))
    if (!draft.name.trim() || !(amt > 0)) return
    setSalaried((prev) => [...prev, { name: draft.name.trim(), loc: draft.loc, role: draft.role.trim() || 'Salaried', salary: amt }])
    setDraft({ name: '', loc: draft.loc, role: '', salary: '' })
  }

  const openExport = (runIdx = null) => {
    setExportRun(runIdx)
    setExportOpen(true)
  }

  const input = { width: '100%', padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit' }
  const allView = loc === 'all'

  const prevTable = (runs, { withEmp }) => (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
            <th style={{ ...thLeft, padding: '12px 18px' }}>Pay Period</th>
            <th style={thLeft}>Checks Dated</th>
            {withEmp && <th style={thLeft}>Employees</th>}
            <th style={thRight}>Hourly Wages</th>
            <th style={thRight}>Tips</th>
            <th style={thRight}>Salaries</th>
            <th style={thRight}>{withEmp ? 'Total Payroll' : 'Total'}</th>
            <th style={{ ...thRight, padding: '12px 18px', textAlign: 'left' }}>ADP Status</th>
            <th style={{ padding: '12px 18px' }} />
          </tr>
        </thead>
        <tbody>
          {withEmp && (
            <tr style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right', background: '#FAFBFC' }}>
              <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 700 }}>
                Sep 15 – 28{' '}
                <span style={{ fontSize: 10, fontWeight: 700, color: colors.brand, background: '#E8EEF6', padding: '2px 7px', borderRadius: 4, marginLeft: 6 }}>CURRENT</span>
              </td>
              <td style={{ textAlign: 'left', padding: '13px 12px' }}>Oct 3</td>
              <td style={{ textAlign: 'left', padding: '13px 12px', color: colors.muted2 }}>{hourly.length} hourly · {scoped.length} salaried</td>
              <td style={{ padding: '13px 12px' }}>{fmt(sumWages)}</td>
              <td style={{ padding: '13px 12px' }}>{fmt(sumTips)}</td>
              <td style={{ padding: '13px 12px' }}>{fmt(sumSalary)}</td>
              <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(sumWages + sumTips + sumSalary)}</td>
              <td style={{ padding: '13px 18px', textAlign: 'left' }}><span style={pill(colors.muted1, colors.pageBg)}>In progress</span></td>
              <td style={{ padding: '13px 18px' }}>
                <span onClick={() => openExport(null)} style={{ fontSize: 12, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>⤓ View</span>
              </td>
            </tr>
          )}
          {runs.map((p, i) => (
            <tr key={p.batch} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
              <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 600 }}>{p.period}</td>
              <td style={{ textAlign: 'left', padding: '13px 12px' }}>{p.checks}</td>
              {withEmp && <td style={{ textAlign: 'left', padding: '13px 12px', color: colors.muted2 }}>{p.emp}</td>}
              <td style={{ padding: '13px 12px' }}>{fmt(p.sums.wages)}</td>
              <td style={{ padding: '13px 12px' }}>{fmt(p.sums.tips)}</td>
              <td style={{ padding: '13px 12px' }}>{fmt(p.sums.sal)}</td>
              <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(p.sums.wages + p.sums.tips + p.sums.sal)}</td>
              <td style={{ padding: '13px 18px', textAlign: 'left' }}>
                <span style={pill(colors.greenDark, colors.greenBg)}>✓ Exported {p.checks}</span>{' '}
                <span style={{ fontSize: 11, color: colors.muted3, marginLeft: 6 }}>{p.batch}</span>
              </td>
              <td style={{ padding: '13px 18px' }}>
                <span onClick={() => openExport(i)} style={{ fontSize: 12, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>⤓ View</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="payroll" showDatePicker={false} />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '24px 26px 48px' }}>
        {/* ===== PAGE TITLE + PERIOD + EXPORT ===== */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.05 }}>Payroll Run</div>
            <div style={{ fontSize: 13, color: colors.muted3, marginTop: 4 }}>
              Hours from Toast · tips &amp; tip-out from nightly reconciliation sheet · overtime paid at straight time ·{' '}
              <span style={{ color: '#8A6D1A', background: '#FBF3DC', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 5 }}>
                Sample data — payroll &amp; tips-sheet feeds pending
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 15px', border: `1px solid ${colors.borderStrong}`, borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: colors.muted2 }}>📅</span> Pay Period: Sep 15 – Sep 28 <span style={{ color: colors.muted3 }}>▾</span>
              </div>
              <div style={{ fontSize: 11, color: colors.muted3, marginTop: 5 }}>Biweekly · 14 days · checks dated Oct 3</div>
            </div>
            <div onClick={() => openExport(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: colors.brand, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              ⤓ Export to ADP
            </div>
          </div>
        </div>

        {/* ===== SOURCE STATUS + LOCATION FILTER ===== */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
            {[['all', 'All locations'], ['atl', 'Teranga ATL'], ['clt', 'Teranga CLT'], ['afro', 'Afro District']].map(([code, label]) => (
              <div
                key={code}
                onClick={() => setLoc(code)}
                style={{ padding: '7px 14px', borderRadius: 6, background: code === loc ? colors.brand : 'transparent', color: code === loc ? '#fff' : colors.muted1, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                {label}
              </div>
            ))}
          </div>
          <span style={chip(colors.greenDark, colors.greenBg)}>✓ Toast hours imported · 14 days</span>
          <span style={chip(colors.greenDark, colors.greenBg)}>✓ Tips sheet matched · 14 nights</span>
          {heldSum > 0 && (
            <Link to="/exceptions" style={chip(colors.brand, '#E8EEF6')}>⏳ {fmt(heldSum)} in large tips held</Link>
          )}
          <span style={chip(colors.red, colors.redBg)}>● {reviewCount} needs review</span>
        </div>

        {/* ===== SUMMARY TILES ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
          <div style={{ background: colors.brand, borderRadius: 13, padding: 20, color: '#fff' }}>
            <div style={{ ...labelUpper, color: colors.brandTint3 }}>Total Payroll</div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 34, fontWeight: 600, marginTop: 6 }}>{fmt(sumWages + sumTips + sumSalary)}</div>
            <div style={{ fontSize: 11, color: colors.brandTint4, marginTop: 4 }}>{hourly.length} hourly · {scoped.length} salaried</div>
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
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>{scoped.length} salaried · per period</div>
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
                    <th style={{ ...thLeft }}>Status</th>
                    <th style={{ padding: '12px 18px' }} />
                  </tr>
                </thead>
                <tbody>
                  {locSummary.map((L) => (
                    <tr key={L.code} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 700 }}>{NAMES[L.code]}</td>
                      <td style={{ textAlign: 'left', padding: '13px 12px', color: colors.muted2 }}>{L.emp}</td>
                      <td style={{ padding: '13px 12px' }}>{L.hours}</td>
                      <td style={{ padding: '13px 12px' }}>{fmt(L.wages)}</td>
                      <td style={{ padding: '13px 12px' }}>{fmt(L.tips)}</td>
                      <td style={{ padding: '13px 12px' }}>{fmt(L.sal)}</td>
                      <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(L.total)}</td>
                      <td style={{ textAlign: 'left', padding: '13px 12px' }}>
                        <span style={L.reviews > 0 ? pill(colors.red, colors.redBg) : pill(colors.greenDark, colors.greenBg)}>
                          {L.reviews > 0 ? `● ${L.reviews} needs review` : '✓ Ready'}
                        </span>
                      </td>
                      <td style={{ padding: '13px 18px' }}>
                        <span onClick={() => setLoc(L.code)} style={{ fontSize: 12, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>Open run →</span>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `2px solid ${colors.border}`, textAlign: 'right', background: colors.panelGray }}>
                    <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 700 }}>Company total</td>
                    <td style={{ textAlign: 'left', padding: '13px 12px', color: colors.muted2 }}>{hourly.length} hourly · {scoped.length} salaried</td>
                    <td style={{ padding: '13px 12px', fontWeight: 700 }}>{sumHours.toFixed(2)}</td>
                    <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(sumWages)}</td>
                    <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(locSummary.reduce((a, L) => a + L.tips, 0))}</td>
                    <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(sumSalary)}</td>
                    <td style={{ padding: '13px 12px', fontWeight: 800 }}>{fmt(locSummary.reduce((a, L) => a + L.total, 0))}</td>
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            <SectionHeader title="Previous Payrolls" right={<span style={{ fontSize: 12, color: colors.muted3 }}>Saved after each ADP export · company-wide</span>} />
            {prevTable(PREV.map((p) => ({ ...p, sums: runSums(p.f, 'all') })), { withEmp: true })}
          </>
        ) : (
          <>
            {/* ===== HOURLY TABLE (run view) ===== */}
            <SectionHeader title="Hourly Employees" right={<span style={{ fontSize: 12, color: colors.muted3 }}>Check = (hours × rate) + tips owed</span>} />
            <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 28 }}>
              <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                    <th style={{ ...thLeft, padding: '12px 18px' }}>Employee</th>
                    <th style={thLeft}>Location</th>
                    <th style={thRight}>Hours</th>
                    <th style={thRight}>of which OT</th>
                    <th style={thRight}>Rate</th>
                    <th style={thRight}>Hourly Pay</th>
                    <th style={thRight}>Tips Owed</th>
                    <th style={thRight}>Tip-out (ref)</th>
                    <th style={thRight}>Match</th>
                    <th style={{ ...thRight, padding: '12px 18px' }}>Check Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hourly.map((r) => {
                    const wages = r.hours * r.rate
                    const matched = r.tips !== null
                    const payable = payableTips(r) ?? 0
                    return (
                      <tr key={r.name} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '12px 18px' }}>
                          <span style={{ fontWeight: 700 }}>{r.name}</span> <span style={{ color: colors.muted3, fontSize: 11 }}>· {r.role}</span>
                        </td>
                        <td style={{ textAlign: 'left', padding: 12 }}>{NAMES[r.loc]}</td>
                        <td style={{ padding: 12 }}>{r.hours.toFixed(2)}</td>
                        <td style={{ padding: 12, color: colors.muted3 }}>{r.ot > 0 ? r.ot.toFixed(2) : '—'}</td>
                        <td style={{ padding: 12 }}>{fmt(r.rate)}</td>
                        <td style={{ padding: 12 }}>{fmt(wages)}</td>
                        <td style={{ padding: 12 }}>
                          {matched ? fmt(payable) : '—'}
                          {(r.tipHold || r.tipRelease) && (
                            <div style={{ fontSize: 10, fontWeight: 700, color: r.tipHold ? colors.brand : colors.greenDark, marginTop: 2 }}>
                              {r.tipHold ? `− ${fmt(r.tipHold.amt)} held · rel ${r.tipHold.rel}` : `+ ${fmt(r.tipRelease.amt)} ${r.tipRelease.note}`}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: 12, color: colors.muted3 }}>{matched && r.tipOut > 0 ? fmt(r.tipOut) : '—'}</td>
                        <td style={{ padding: 12 }}>
                          <span style={matched ? pill(colors.greenDark, colors.greenBg) : pill(colors.red, colors.redBg)}>
                            {matched ? '✓ Matched' : '● Review'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 18px', fontWeight: 700 }}>{fmt(wages + payable)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: `2px solid ${colors.border}`, textAlign: 'right', background: colors.panelGray }}>
                    <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 700 }}>Totals</td>
                    <td />
                    <td style={{ padding: '13px 12px', fontWeight: 700 }}>{sumHours.toFixed(2)}</td>
                    <td style={{ padding: '13px 12px', color: colors.muted3 }}>{sumOT > 0 ? sumOT.toFixed(2) : '—'}</td>
                    <td />
                    <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(sumWages)}</td>
                    <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(sumTips)}</td>
                    <td style={{ padding: '13px 12px', color: colors.muted3 }}>{fmt(sumTipOut)}</td>
                    <td />
                    <td style={{ padding: '13px 18px', fontWeight: 800 }}>{fmt(sumWages + sumTips)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

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
                  {scoped.map((s) => (
                    <tr key={s.name} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 700 }}>{s.name}</td>
                      <td style={{ textAlign: 'left', padding: 12 }}>{NAMES[s.loc]}</td>
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
                        <option value="atl">Teranga ATL</option>
                        <option value="clt">Teranga CLT</option>
                        <option value="afro">Afro District</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="Role" style={input} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: e.target.value })} placeholder="$ per period" style={{ ...input, textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '10px 18px', textAlign: 'right' }}>
                      <div onClick={addSalaried} style={{ display: 'inline-flex', padding: '8px 16px', background: colors.brand, color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
              Overtime hours are paid at the regular rate per current policy — the export sends all hours as regular earnings.
              "Needs review" = a Toast name with no matching row on the tips sheet; resolve on the sheet and re-import. Tips over $
              {TIP_HOLD_THRESHOLD} on a single transaction are auto-held for {TIP_HOLD_DAYS} days (chargeback window): held amounts
              are excluded from tips owed and notated on the row, then added to a later run's check when released — also notated.
            </div>

            {/* ===== LOCATION PREVIOUS PAYROLLS ===== */}
            <SectionHeader
              title="Previous Payrolls"
              sub={NAMES[loc]}
              style={{ margin: '28px 0 14px' }}
              right={<span style={{ fontSize: 12, color: colors.muted3 }}>This location's share of each exported batch</span>}
            />
            {prevTable(PREV.map((p) => ({ ...p, sums: runSums(p.f, loc) })), { withEmp: false })}
          </>
        )}
      </div>

      {exportOpen && (
        <ExportModal
          hourly={hourly}
          salaried={scoped}
          archived={exportRun !== null ? PREV[exportRun] : null}
          scopeLabel={loc === 'all' ? 'All locations' : NAMES[loc]}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}
