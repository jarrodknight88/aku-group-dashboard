import { Link, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { card, labelUpper } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'

/* ---------- demo data — the flagged transactions ---------- */
// Ported from Exception Detail.dc.html. Audit rules are placeholders until
// the real rule set is defined; a location manager receives this page as a
// ?loc= deep link and only ever sees their own venue's exceptions.

const ALL_FLAGS = [
  { time: 'Sep 20 · 11:42p', loc: 'atl', check: '#48217', server: 'M. Diallo', rule: 'Void after payment closed', amount: 184.0, sev: 'High', status: 'open' },
  { time: 'Sep 20 · 10:08p', loc: 'clt', check: '#33901', server: 'K. Owusu', rule: 'Discount over 50% on check', amount: 142.5, sev: 'High', status: 'open' },
  { time: 'Sep 19 · 9:21p', loc: 'atl', check: '#48056', server: 'A. Sow', rule: 'Comp exceeds $100', amount: 126.0, sev: 'Medium', status: 'open' },
  { time: 'Sep 19 · 8:54p', loc: 'afro', check: '#21744', server: 'J. Mensah', rule: 'Void after payment closed', amount: 98.0, sev: 'Medium', status: 'open' },
  { time: 'Sep 19 · 7:30p', loc: 'clt', check: '#33812', server: 'R. Bah', rule: 'Check reopened after close', amount: 76.25, sev: 'Low', status: 'open' },
  { time: 'Sep 18 · 10:47p', loc: 'atl', check: '#47903', server: 'M. Diallo', rule: 'Discount over 50% on check', amount: 210.0, sev: 'High', status: 'open' },
  { time: 'Sep 18 · 9:12p', loc: 'afro', check: '#21680', server: 'F. Kamara', rule: 'Comp exceeds $100', amount: 118.0, sev: 'Medium', status: 'open' },
  { time: 'Sep 18 · 6:38p', loc: 'clt', check: '#33704', server: 'K. Owusu', rule: 'Refund without manager approval', amount: 64.0, sev: 'High', status: 'open' },
  { time: 'Sep 17 · 11:02p', loc: 'atl', check: '#47788', server: 'A. Sow', rule: 'Void after payment closed', amount: 88.5, sev: 'Medium', status: 'open' },
  { time: 'Sep 17 · 8:25p', loc: 'afro', check: '#21588', server: 'J. Mensah', rule: 'Check reopened after close', amount: 52.0, sev: 'Low', status: 'cleared' },
  { time: 'Sep 17 · 7:14p', loc: 'clt', check: '#33640', server: 'R. Bah', rule: 'Discount over 50% on check', amount: 96.75, sev: 'Medium', status: 'cleared' },
  { time: 'Sep 16 · 10:33p', loc: 'atl', check: '#47652', server: 'M. Diallo', rule: 'Comp exceeds $100', amount: 104.0, sev: 'Medium', status: 'cleared' },
  { time: 'Sep 16 · 9:48p', loc: 'afro', check: '#21490', server: 'F. Kamara', rule: 'Void after payment closed', amount: 71.0, sev: 'Low', status: 'cleared' },
  { time: 'Sep 16 · 6:55p', loc: 'clt', check: '#33571', server: 'K. Owusu', rule: 'Refund without manager approval', amount: 58.5, sev: 'Medium', status: 'cleared' },
  { time: 'Sep 15 · 10:19p', loc: 'atl', check: '#47511', server: 'A. Sow', rule: 'Discount over 50% on check', amount: 132.0, sev: 'High', status: 'cleared' },
  { time: 'Sep 15 · 8:07p', loc: 'afro', check: '#21402', server: 'J. Mensah', rule: 'Check reopened after close', amount: 44.0, sev: 'Low', status: 'cleared' },
  { time: 'Sep 15 · 6:41p', loc: 'clt', check: '#33498', server: 'R. Bah', rule: 'Comp exceeds $100', amount: 112.5, sev: 'Medium', status: 'cleared' },
]

const LOC_NAMES = { atl: 'Teranga ATL', clt: 'Teranga CLT', afro: 'Afro District' }

const SEV_STYLE = {
  High: { color: colors.red, bg: colors.redBg },
  Medium: { color: colors.muted1, bg: colors.pageBg },
  Low: { color: colors.brandTint1, bg: '#EAF0F8' },
}

const RULE_PALETTE = [colors.brand, colors.brandTint1, colors.brandTint2, colors.brandTint3, colors.brandTint4]

const money = (v) =>
  '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* ---------- page ---------- */

export default function ExceptionDetail() {
  const [params] = useSearchParams()
  let loc = (params.get('loc') || '').toLowerCase()
  if (!LOC_NAMES[loc]) loc = ''

  const filtered = loc ? ALL_FLAGS.filter((r) => r.loc === loc) : ALL_FLAGS
  const openCount = filtered.filter((r) => r.status === 'open').length
  const atRisk = money(filtered.reduce((s, r) => s + r.amount, 0))

  // Flags by audit rule, ranked; bar widths relative to the top rule.
  const counts = {}
  filtered.forEach((r) => { counts[r.rule] = (counts[r.rule] || 0) + 1 })
  const ruleArr = Object.entries(counts)
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count)
  const maxCount = ruleArr.length ? ruleArr[0].count : 1
  const ruleRows = ruleArr.slice(0, 5).map((x, i) => ({
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
            <div style={{ fontSize: 11, color: colors.brandTint4, marginTop: 4 }}>This period</div>
          </div>
          <div style={card}>
            <div style={labelUpper}>$ at Risk</div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 500, marginTop: 6 }}>{atRisk}</div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>Across flagged transactions</div>
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
              {filtered.length - openCount}
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
              {filtered.map((r) => {
                const ss = SEV_STYLE[r.sev]
                const isOpen = r.status === 'open'
                return (
                  <tr key={r.check + r.time} style={{ borderTop: `1px solid ${colors.pageBg}` }}>
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
                      <span style={{ fontSize: 11, fontWeight: 700, color: isOpen ? colors.red : colors.greenDark }}>
                        {isOpen ? '● Open' : '✓ Cleared'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
