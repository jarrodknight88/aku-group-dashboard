import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { card, labelUpper } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { TIP_HOLD_RULE, TIP_HOLD_DAYS, TIP_HOLD_THRESHOLD } from '../config.js'

/* ---------- demo data — the flagged transactions ---------- */
// Ported from Exception Detail.dc.html. Audit rules are placeholders until
// the real rule set is defined (the large-tip auto-hold in section 8 is the
// first confirmed rule); a location manager receives this page as a ?loc=
// deep link and only ever sees their own venue's exceptions. Review actions
// will persist to exception_flags (status / reviewed_by / reviewed_at) once
// the import-time rule evaluator writes real rows.

const ALL_FLAGS = [
  { time: 'Sep 20 · 11:55p', loc: 'atl', check: '#48244', server: 'M. Diallo', rule: TIP_HOLD_RULE, amount: 640.0, sev: 'High', status: 'held', tip: { rel: 'Oct 4', run: 'paid on Oct 6 – 19 run', checkTotal: 212.4, card: 'Amex' } },
  { time: 'Sep 20 · 11:42p', loc: 'atl', check: '#48217', server: 'M. Diallo', rule: 'Void after payment closed', amount: 184.0, sev: 'High', status: 'open' },
  { time: 'Sep 20 · 10:08p', loc: 'clt', check: '#33901', server: 'K. Owusu', rule: 'Discount over 50% on check', amount: 142.5, sev: 'High', status: 'open' },
  { time: 'Sep 19 · 9:21p', loc: 'atl', check: '#48056', server: 'A. Sow', rule: 'Comp exceeds $100', amount: 126.0, sev: 'Medium', status: 'open' },
  { time: 'Sep 19 · 8:54p', loc: 'afro', check: '#21744', server: 'J. Mensah', rule: 'Void after payment closed', amount: 98.0, sev: 'Medium', status: 'open' },
  { time: 'Sep 19 · 7:30p', loc: 'clt', check: '#33812', server: 'R. Bah', rule: 'Check reopened after close', amount: 76.25, sev: 'Low', status: 'open' },
  { time: 'Sep 18 · 10:47p', loc: 'atl', check: '#47903', server: 'M. Diallo', rule: 'Discount over 50% on check', amount: 210.0, sev: 'High', status: 'open' },
  { time: 'Sep 18 · 9:12p', loc: 'afro', check: '#21680', server: 'F. Kamara', rule: 'Comp exceeds $100', amount: 118.0, sev: 'Medium', status: 'open' },
  { time: 'Sep 18 · 6:38p', loc: 'clt', check: '#33704', server: 'K. Owusu', rule: 'Refund without manager approval', amount: 64.0, sev: 'High', status: 'open' },
  { time: 'Sep 17 · 11:02p', loc: 'atl', check: '#47788', server: 'A. Sow', rule: 'Void after payment closed', amount: 88.5, sev: 'Medium', status: 'open' },
  { time: 'Sep 17 · 10:32p', loc: 'clt', check: '#33660', server: 'D. Fall', rule: TIP_HOLD_RULE, amount: 525.0, sev: 'High', status: 'held', tip: { rel: 'Oct 1', run: 'paid on Oct 6 – 19 run', checkTotal: 186.75, card: 'Visa' } },
  { time: 'Sep 17 · 8:25p', loc: 'afro', check: '#21588', server: 'J. Mensah', rule: 'Check reopened after close', amount: 52.0, sev: 'Low', status: 'cleared' },
  { time: 'Sep 17 · 7:14p', loc: 'clt', check: '#33640', server: 'R. Bah', rule: 'Discount over 50% on check', amount: 96.75, sev: 'Medium', status: 'cleared' },
  { time: 'Sep 16 · 10:33p', loc: 'atl', check: '#47652', server: 'M. Diallo', rule: 'Comp exceeds $100', amount: 104.0, sev: 'Medium', status: 'cleared' },
  { time: 'Sep 16 · 9:48p', loc: 'afro', check: '#21490', server: 'F. Kamara', rule: 'Void after payment closed', amount: 71.0, sev: 'Low', status: 'cleared' },
  { time: 'Sep 16 · 6:55p', loc: 'clt', check: '#33571', server: 'K. Owusu', rule: 'Refund without manager approval', amount: 58.5, sev: 'Medium', status: 'cleared' },
  { time: 'Sep 15 · 10:19p', loc: 'atl', check: '#47511', server: 'A. Sow', rule: 'Discount over 50% on check', amount: 132.0, sev: 'High', status: 'cleared' },
  { time: 'Sep 15 · 9:44p', loc: 'atl', check: '#47530', server: 'A. Sow', rule: TIP_HOLD_RULE, amount: 780.0, sev: 'High', status: 'released', tip: { rel: 'Sep 29', run: 'added to Sep 15 – 28 run (checks Oct 3)', checkTotal: 264.1, card: 'Amex' } },
  { time: 'Sep 15 · 8:07p', loc: 'afro', check: '#21402', server: 'J. Mensah', rule: 'Check reopened after close', amount: 44.0, sev: 'Low', status: 'cleared' },
  { time: 'Sep 15 · 6:41p', loc: 'clt', check: '#33498', server: 'R. Bah', rule: 'Comp exceeds $100', amount: 112.5, sev: 'Medium', status: 'cleared' },
]

const LOC_NAMES = { atl: 'Teranga ATL', clt: 'Teranga CLT', afro: 'Afro District' }

const SEV_STYLE = {
  High: { color: colors.red, bg: colors.redBg },
  Medium: { color: colors.muted1, bg: colors.pageBg },
  Low: { color: colors.brandTint1, bg: '#EAF0F8' },
}

/* Status model (section 7): open · held · released · cleared(=approved) · denied.
   Tip rows carry release dates in their status text. */
const STATUS = {
  open: { text: '● Open', color: colors.red },
  held: { text: '⏳ Held', color: colors.brand },
  released: { text: '✓ Released', color: colors.greenDark },
  cleared: { text: '✓ Approved', color: colors.greenDark },
  denied: { text: '✕ Denied', color: colors.red },
}
const statusTextFor = (r) => {
  if (r.st === 'held' && r.tip) return `⏳ Held · rel ${r.tip.rel}`
  if (r.st === 'released' && r.tip) return `✓ Released ${r.tip.rel}`
  if (r.st === 'cleared' && r.tip) return `✓ Releases ${r.tip.rel}`
  return STATUS[r.st].text
}

const RULE_NOTES = {
  'Void after payment closed': 'Items were voided after payment was captured. Confirm with the closing manager that the void was legitimate before approving.',
  'Discount over 50% on check': 'Discount exceeds half the check value. Verify the comp reason and authorizing manager before approving.',
  'Comp exceeds $100': 'Comped amount is above the $100 house limit and requires owner-level approval.',
  'Check reopened after close': 'Check was reopened after business close. Review the adjustment made after reopening.',
  'Refund without manager approval': 'Refund was processed without a manager PIN on file.',
  [TIP_HOLD_RULE]: `Tip exceeds $${TIP_HOLD_THRESHOLD} on a single transaction. Auto-held for ${TIP_HOLD_DAYS} days to clear the chargeback window before payout — excluded from the server's payroll tips until released, then added to the next run's check. Both movements are notated on the payroll sheet.`,
}

const RULE_PALETTE = [colors.brand, colors.brandTint1, colors.brandTint2, colors.brandTint3, colors.brandTint4]

const money = (v) =>
  '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fieldLabel = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: colors.muted3,
  fontWeight: 600,
}

/* ---------- review modal (section 7) ---------- */

function ReviewModal({ flag, onApprove, onDeny, onClose }) {
  const ss = SEV_STYLE[flag.sev]
  const isTip = !!flag.tip
  const checkTotal = isTip ? flag.tip.checkTotal : Math.round(flag.amount * 2.6)
  const cardName = isTip
    ? flag.tip.card
    : ['Visa', 'Mastercard', 'Amex'][parseInt(String(flag.check).replace(/\D/g, ''), 10) % 3]
  const field = (label, value, bold) => (
    <div>
      <div style={fieldLabel}>{label}</div>
      <div className="tnum" style={{ fontSize: 13, fontWeight: bold ? 700 : 600, marginTop: 3 }}>{value}</div>
    </div>
  )
  const stage = (label, value, flex = 1) => (
    <div style={{ flex }}>
      <div style={{ ...fieldLabel, color: colors.brand, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,26,42,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 660, maxWidth: '100%', maxHeight: '85vh', background: '#fff', borderRadius: 16, overflow: 'auto', boxShadow: '0 24px 60px rgba(10,20,40,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${colors.border}` }}>
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 600 }}>{flag.rule}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: ss.color, background: ss.bg, padding: '3px 9px', borderRadius: 5 }}>{flag.sev}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: STATUS[flag.st].color }}>{statusTextFor(flag)}</span>
            </div>
          </div>
          <div onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: colors.panelGray, color: colors.muted1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            ✕
          </div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {field('Date / Time', flag.time)}
            {field('Location', LOC_NAMES[flag.loc])}
            {field('Check #', flag.check)}
            {field('Server', flag.server)}
            {field('Flagged Amount', money(flag.amount), true)}
            {field('Check Total', money(checkTotal))}
            {field('Card', cardName)}
          </div>
          {isTip && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 18, background: '#E8EEF6', borderRadius: 10, padding: '14px 16px' }}>
              {stage('Flagged', flag.time)}
              <div style={{ color: colors.brandTint2, fontSize: 14, padding: '0 10px' }}>→</div>
              {stage(`${TIP_HOLD_DAYS}-day hold ends`, flag.tip.rel)}
              <div style={{ color: colors.brandTint2, fontSize: 14, padding: '0 10px' }}>→</div>
              {stage('Payout', flag.tip.run, 1.4)}
            </div>
          )}
          <div style={{ marginTop: 16, background: colors.panelGray, borderRadius: 10, padding: '14px 16px', fontSize: 12, lineHeight: 1.6, color: '#3A4150' }}>
            {RULE_NOTES[flag.rule] || ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: `1px solid ${colors.border}`, background: '#FAFBFC' }}>
          <div onClick={onDeny} style={{ padding: '10px 18px', border: `1px solid ${colors.redBorder}`, borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 700, color: colors.red, cursor: 'pointer' }}>
            ✕ Deny
          </div>
          <div onClick={onApprove} style={{ padding: '10px 18px', background: colors.greenDark, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ✓ {isTip && flag.st === 'held' ? `Approve & Release ${flag.tip.rel}` : 'Approve'}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- page ---------- */

export default function ExceptionDetail() {
  const [params] = useSearchParams()
  // Review state is per-check until real exception_flags rows land; approve on
  // a held tip schedules its release (status text becomes "Releases <date>").
  const [statusOv, setStatusOv] = useState({})
  const [selected, setSelected] = useState(null)

  let loc = (params.get('loc') || '').toLowerCase()
  if (!LOC_NAMES[loc]) loc = ''

  const filtered = loc ? ALL_FLAGS.filter((r) => r.loc === loc) : ALL_FLAGS
  const withStatus = filtered.map((r) => ({ ...r, st: statusOv[r.check] || r.status }))

  const atRisk = withStatus.filter((r) => r.st === 'open' || r.st === 'held').reduce((s, r) => s + r.amount, 0)
  const openCount = withStatus.filter((r) => r.st === 'open').length
  const heldCount = withStatus.filter((r) => r.st === 'held').length
  const resolvedCount = withStatus.filter((r) => ['cleared', 'denied', 'released'].includes(r.st)).length

  // Flags by audit rule, ranked; bar widths relative to the top rule.
  const counts = {}
  filtered.forEach((r) => { counts[r.rule] = (counts[r.rule] || 0) + 1 })
  const ruleArr = Object.entries(counts)
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count)
  const maxCount = ruleArr.length ? ruleArr[0].count : 1
  const ruleRows = ruleArr.slice(0, 6).map((x, i) => ({
    ...x,
    pct: Math.round((x.count / maxCount) * 100),
    color: RULE_PALETTE[i % RULE_PALETTE.length],
  }))

  // Location chips (org-wide view only) — the manager-distributable deep links.
  const chipDefs = [
    { label: 'All locations', code: '' },
    { label: 'Teranga ATL', code: 'atl' },
    { label: 'Teranga CLT', code: 'clt' },
    { label: 'Afro District', code: 'afro' },
  ]

  const btn = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    padding: '10px 15px',
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 9,
    background: '#fff',
    fontSize: 13,
    fontWeight: 600,
    color: '#3A4150',
    cursor: 'pointer',
  }

  const sel = withStatus.find((r) => r.check === selected) || null
  const review = (status) => {
    if (selected) setStatusOv((prev) => ({ ...prev, [selected]: status }))
    setSelected(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="locations" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '22px 26px 48px' }}>
        <Link
          to={loc ? `/locations/${loc}` : '/'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: colors.muted2, marginBottom: 12 }}
        >
          {loc ? `← Back to ${LOC_NAMES[loc]}` : '← Back to Company'}
        </Link>

        {/* ===== PAGE TITLE ===== */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.05 }}>
              Exception Flags
            </div>
            <div style={{ fontSize: 13, color: colors.muted3, marginTop: 4 }}>
              Transactions tripping audit rules · {loc ? LOC_NAMES[loc] : 'org-wide'} ·{' '}
              <span style={{ color: '#8A6D1A', background: '#FBF3DC', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 5 }}>
                Sample data — audit rules pending definition
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={btn}>⤓ Export CSV</div>
            <div style={btn}>+ Manual entry</div>
          </div>
        </div>

        {/* ===== SUMMARY STRIP ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: colors.brand, borderRadius: 13, padding: 20, color: '#fff' }}>
            <div style={{ ...labelUpper, color: colors.brandTint3 }}>Total Flags</div>
            <div style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 600, marginTop: 6 }}>{filtered.length}</div>
            <div style={{ fontSize: 11, color: colors.brandTint4, marginTop: 4 }}>
              {heldCount > 0 ? `${heldCount} large-tip hold(s) included` : 'This period'}
            </div>
          </div>
          <div style={card}>
            <div style={labelUpper}>$ at Risk</div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 500, marginTop: 6 }}>{money(atRisk)}</div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>Open + held exposure</div>
          </div>
          <div style={{ ...card, border: `1px solid ${colors.redBorder}` }}>
            <div style={labelUpper}>Open / Unreviewed</div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 500, marginTop: 6, color: colors.red }}>
              {openCount}
            </div>
            <div style={{ fontSize: 11, color: colors.red, marginTop: 4, fontWeight: 600 }}>Needs attention</div>
          </div>
          <div style={{ ...card, border: `1px solid ${colors.greenBorder}` }}>
            <div style={labelUpper}>Cleared</div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 500, marginTop: 6, color: colors.greenDark }}>
              {resolvedCount}
            </div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>Reviewed &amp; resolved</div>
          </div>
        </div>

        {/* ===== RULE BREAKDOWN ===== */}
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Flags by Audit Rule</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {ruleRows.map((rr) => (
              <div key={rr.rule} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 230, fontSize: 12, color: '#3A4150' }}>{rr.rule}</span>
                <div style={{ flex: 1, height: 10, background: colors.pageBg, borderRadius: 5 }}>
                  <div style={{ width: `${rr.pct}%`, height: '100%', background: rr.color, borderRadius: 5 }} />
                </div>
                <span className="tnum" style={{ width: 28, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>
                  {rr.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ===== FILTER BAR ===== */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          {/* Location chips only in the org-wide view — a scoped manager link hides them */}
          {!loc && (
            <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
              {chipDefs.map((c) => {
                const active = c.code === loc
                return (
                  <Link
                    key={c.label}
                    to={c.code ? `/exceptions?loc=${c.code}` : '/exceptions'}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 6,
                      background: active ? colors.brand : 'transparent',
                      color: active ? '#fff' : colors.muted1,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {c.label}
                  </Link>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
            <div style={{ padding: '7px 14px', borderRadius: 6, background: colors.brand, color: '#fff', fontSize: 12, fontWeight: 600 }}>All</div>
            <div style={{ padding: '7px 14px', borderRadius: 6, color: colors.muted1, fontSize: 12, fontWeight: 600 }}>Open</div>
            <div style={{ padding: '7px 14px', borderRadius: 6, color: colors.muted1, fontSize: 12, fontWeight: 600 }}>Cleared</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: colors.muted3 }}>
            Showing <span style={{ color: '#3A4150', fontWeight: 600 }}>{filtered.length}</span> flagged transactions
          </div>
        </div>

        {/* ===== EXCEPTION TABLE ===== */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'left' }}>
                <th style={{ padding: '12px 18px', fontWeight: 600 }}>Date / Time</th>
                <th style={{ padding: 12, fontWeight: 600 }}>Location</th>
                <th style={{ padding: 12, fontWeight: 600 }}>Check #</th>
                <th style={{ padding: 12, fontWeight: 600 }}>Server</th>
                <th style={{ padding: 12, fontWeight: 600 }}>Rule Tripped</th>
                <th style={{ padding: 12, fontWeight: 600, textAlign: 'right' }}>Amount</th>
                <th style={{ padding: 12, fontWeight: 600 }}>Severity</th>
                <th style={{ padding: '12px 18px', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {withStatus.map((r) => {
                const ss = SEV_STYLE[r.sev]
                return (
                  <tr
                    key={r.check + r.time}
                    className="row-hover"
                    onClick={() => setSelected(r.check)}
                    style={{ borderTop: `1px solid ${colors.pageBg}`, cursor: 'pointer' }}
                  >
                    <td style={{ padding: '13px 18px', color: '#3A4150' }}>{r.time}</td>
                    <td style={{ padding: '13px 12px' }}>{LOC_NAMES[r.loc]}</td>
                    <td style={{ padding: '13px 12px', color: colors.muted2 }}>{r.check}</td>
                    <td style={{ padding: '13px 12px' }}>{r.server}</td>
                    <td style={{ padding: '13px 12px' }}>{r.rule}</td>
                    <td style={{ padding: '13px 12px', textAlign: 'right', fontWeight: 700 }}>{money(r.amount)}</td>
                    <td style={{ padding: '13px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: ss.color, background: ss.bg, padding: '3px 9px', borderRadius: 5 }}>
                        {r.sev}
                      </span>
                    </td>
                    <td style={{ padding: '13px 18px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: STATUS[r.st].color }}>{statusTextFor(r)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sel && (
        <ReviewModal
          flag={sel}
          onApprove={() => review('cleared')}
          onDeny={() => review('denied')}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
