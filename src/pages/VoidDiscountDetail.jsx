import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, labelUpper, RankRow, ModeToggle } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { PERSONAL_VOID_TARGET, PERSONAL_DISCOUNT_TARGET } from '../config.js'

/* Void & Discount drill-down (handoff §10) — reached from the Void % /
   Discount % tiles in Money Protected (?tab=void|discount, plus &loc=<code>
   from a location report). Scoping matches the exception page: ?loc= filters
   everything and the back link returns to that location's report.
   Ships on the handoff's sample rows until void reasons / discount detail /
   per-employee sales come through the Toast import (VoidDetails +
   SalesSummary/ProductMix). */

const NAMES = { atl: 'Teranga ATL', clt: 'Teranga CLT', afro: 'Afro District' }

const VOID_REASONS = [
  { label: "86'd item — out of stock", d: 610, q: 22 },
  { label: 'Customer changed mind', d: 520, q: 24 },
  { label: 'Wrong order entered', d: 486, q: 19 },
  { label: 'Long wait — walkout', d: 412, q: 12 },
  { label: 'Spill / quality issue', d: 306, q: 11 },
  { label: 'Manager void — other', d: 206, q: 8 },
]
const DISC_TYPES = [
  { label: 'Birthday 20%', d: 2760, q: 48 },
  { label: 'Industry 15%', d: 2180, q: 42 },
  { label: 'Manager comp', d: 2050, q: 31 },
  { label: 'Happy Hour', d: 1690, q: 54 },
  { label: 'Employee meal 50%', d: 1260, q: 26 },
  { label: 'Loyalty / other', d: 850, q: 13 },
]
const VOID_ITEMS = [
  { name: 'Jollof Rice & Chicken', d: 420, q: 14 },
  { name: 'Suya Platter', d: 360, q: 9 },
  { name: 'Hennessy VSOP (glass)', d: 330, q: 6 },
  { name: 'Grilled Lamb Chops', d: 290, q: 7 },
  { name: 'Double Apple Hookah', d: 240, q: 8 },
]
const DISC_ITEMS = [
  { name: 'Jollof Rice & Chicken', d: 1840, q: 38 },
  { name: 'Suya Platter', d: 1420, q: 29 },
  { name: 'Hookah — house flavors', d: 1180, q: 31 },
  { name: 'Grilled Lamb Chops', d: 960, q: 18 },
  { name: 'House cocktails', d: 890, q: 24 },
]
const VOID_EMP = [
  { name: 'M. Diallo', role: 'Server', loc: 'atl', d: 640, q: 24, pct: 1.4 },
  { name: 'K. Owusu', role: 'Server', loc: 'clt', d: 460, q: 18, pct: 1.1 },
  { name: 'J. Mensah', role: 'Server', loc: 'afro', d: 410, q: 15, pct: 1.2 },
  { name: 'A. Sow', role: 'Server', loc: 'atl', d: 390, q: 15, pct: 0.8 },
  { name: 'F. Kamara', role: 'Bartender', loc: 'afro', d: 330, q: 12, pct: 0.9 },
  { name: 'R. Bah', role: 'Bartender', loc: 'clt', d: 310, q: 12, pct: 0.7 },
]
const DISC_EMP = [
  { name: 'M. Diallo', role: 'Server', loc: 'atl', d: 2340, q: 42, pct: 5.1 },
  { name: 'K. Owusu', role: 'Server', loc: 'clt', d: 2190, q: 40, pct: 3.9 },
  { name: 'J. Mensah', role: 'Server', loc: 'afro', d: 1780, q: 35, pct: 2.6 },
  { name: 'F. Kamara', role: 'Bartender', loc: 'afro', d: 1610, q: 32, pct: 1.9 },
  { name: 'A. Sow', role: 'Server', loc: 'atl', d: 1510, q: 35, pct: 2.9 },
  { name: 'R. Bah', role: 'Bartender', loc: 'clt', d: 1360, q: 30, pct: 2.4 },
]
// per-scope % of sales + peak day [void, disc]
const SCOPE = {
  all: { vPct: 0.8, dPct: 3.4, vPeak: ['Fri', '$460 voided'], dPeak: ['Fri', '$2,300 discounted'] },
  atl: { vPct: 0.7, dPct: 2.8, vPeak: ['Fri', '$225 voided'], dPeak: ['Fri', '$785 discounted'] },
  clt: { vPct: 0.9, dPct: 3.9, vPeak: ['Sat', '$150 voided'], dPeak: ['Sat', '$730 discounted'] },
  afro: { vPct: 0.8, dPct: 2.6, vPeak: ['Fri', '$120 voided'], dPeak: ['Fri', '$540 discounted'] },
}

const BAR_PALETTE = [colors.brand, colors.brandTint1, colors.brandTint2, '#9DB6DC', colors.brandTint3, colors.brandTint4]

const fmt = (n) => '$' + n.toLocaleString('en-US')

export default function VoidDiscountDetail() {
  const [params] = useSearchParams()
  const [tabOv, setTabOv] = useState(null) // tab clicks override ?tab=
  const [mode, setMode] = useState('dollar')

  let loc = (params.get('loc') || '').toLowerCase()
  if (!NAMES[loc]) loc = ''
  const scope = loc || 'all'
  const urlTab = (params.get('tab') || 'void').toLowerCase()
  const tab = tabOv || (urlTab === 'discount' ? 'discount' : 'void')
  const isVoid = tab === 'void'
  const sc = SCOPE[scope]
  const target = isVoid ? PERSONAL_VOID_TARGET : PERSONAL_DISCOUNT_TARGET
  const noun = isVoid ? 'Voided' : 'Discounted'

  const orgEmpAll = isVoid ? VOID_EMP : DISC_EMP
  const emps = loc ? orgEmpAll.filter((r) => r.loc === loc) : orgEmpAll
  const empTotal = { d: emps.reduce((a, r) => a + r.d, 0), q: emps.reduce((a, r) => a + r.q, 0) }

  // reasons/items scale to this scope's share of the org totals
  const orgTotal = { d: orgEmpAll.reduce((a, r) => a + r.d, 0), q: orgEmpAll.reduce((a, r) => a + r.q, 0) }
  const shareD = empTotal.d / orgTotal.d
  const shareQ = empTotal.q / orgTotal.q

  const scaled = (isVoid ? VOID_REASONS : DISC_TYPES).map((r, i) => ({
    label: r.label,
    dv: Math.round(r.d * shareD),
    qv: Math.round(r.q * shareQ),
    color: BAR_PALETTE[i],
  }))
  const maxV = Math.max(...scaled.map((r) => (mode === 'dollar' ? r.dv : r.qv)), 1)
  const reasons = scaled.map((r) => {
    const v = mode === 'dollar' ? r.dv : r.qv
    return {
      label: r.label,
      color: r.color,
      pct: Math.round((v / maxV) * 100),
      val: mode === 'dollar' ? fmt(v) : `${v} ${isVoid ? 'items' : 'checks'}`,
    }
  })

  const items = (isVoid ? VOID_ITEMS : DISC_ITEMS)
    .map((it) => ({
      name: it.name,
      v: mode === 'dollar' ? it.d : it.q,
      val: mode === 'dollar' ? fmt(Math.round(it.d * shareD)) : `${Math.round(it.q * shareQ)}×`,
    }))
    .sort((a, b) => b.v - a.v)

  const sortedEmps = [...emps].sort((a, b) => (mode === 'dollar' ? b.d - a.d : b.q - a.q))
  const overCount = emps.filter((e) => e.pct > target).length

  const pctVal = isVoid ? sc.vPct : sc.dPct
  const overTarget = pctVal > target
  const peak = isVoid ? sc.vPeak : sc.dPeak

  const tabStyle = (active) => ({
    padding: '7px 16px',
    borderRadius: 6,
    background: active ? colors.brand : 'transparent',
    color: active ? '#fff' : colors.muted1,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  })

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active={loc ? 'locations' : 'company'} />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '22px 26px 48px' }}>
        <Link
          to={loc ? `/locations/${loc}` : '/'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: colors.muted2, marginBottom: 12 }}
        >
          {loc ? `← Back to ${NAMES[loc]}` : '← Back to Company'}
        </Link>

        {/* ===== PAGE TITLE + TABS + TOGGLE ===== */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.05 }}>
              Void &amp; Discount Detail
            </div>
            <div style={{ fontSize: 13, color: colors.muted3, marginTop: 4 }}>
              The "why" behind the numbers · {loc ? NAMES[loc] : 'org-wide'} ·{' '}
              <span style={{ color: '#8A6D1A', background: '#FBF3DC', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 5 }}>
                Sample data — void/discount detail pending Toast import
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
              <div onClick={() => setTabOv('void')} style={tabStyle(isVoid)}>Voids</div>
              <div onClick={() => setTabOv('discount')} style={tabStyle(!isVoid)}>Discounts</div>
            </div>
            <ModeToggle mode={mode} onChange={setMode} labels={['By $', 'By Qty']} />
          </div>
        </div>

        {/* ===== SUMMARY STRIP ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: colors.brand, borderRadius: 13, padding: 20, color: '#fff' }}>
            <div style={{ ...labelUpper, color: colors.brandTint3 }}>Total {noun}</div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 600, marginTop: 6 }}>
              {mode === 'dollar' ? fmt(empTotal.d) : empTotal.q}
            </div>
            <div style={{ fontSize: 11, color: colors.brandTint4, marginTop: 4 }}>
              {mode === 'dollar'
                ? `${empTotal.q} ${isVoid ? 'voided items' : 'discounted checks'}`
                : `${isVoid ? 'items voided · ' : 'checks discounted · '}${fmt(empTotal.d)}`}
            </div>
          </div>
          <div style={{ ...card, border: `1px solid ${overTarget ? colors.redBorder : colors.greenBorder}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={labelUpper}>% of Sales</div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: overTarget ? colors.redBright : colors.green }} />
            </div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 500, marginTop: 6, color: overTarget ? colors.red : colors.greenDark }}>
              {pctVal.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: overTarget ? colors.red : colors.muted3, marginTop: 4, fontWeight: 600 }}>
              Target &lt; {target}% · {overTarget ? 'over' : 'within'}
            </div>
          </div>
          <div style={card}>
            <div style={labelUpper}>Peak Day</div>
            <div style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 500, marginTop: 6 }}>{peak[0]}</div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>{peak[1]} — highest of the week</div>
          </div>
          <div style={{ ...card, border: `1px solid ${colors.redBorder}` }}>
            <div style={labelUpper}>Employees Over Target</div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 36, fontWeight: 500, marginTop: 6, color: colors.red }}>{overCount}</div>
            <div style={{ fontSize: 11, color: colors.red, marginTop: 4, fontWeight: 600 }}>
              {overCount > 0 ? `vs ${target}% personal target` : 'All within target'}
            </div>
          </div>
        </div>

        {/* ===== BREAKDOWN + TOP ITEMS ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{isVoid ? 'Voids by Reason' : 'Discounts by Type'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {reasons.map((rr) => (
                <div key={rr.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 210, fontSize: 12, color: '#3A4150' }}>{rr.label}</span>
                  <div style={{ flex: 1, height: 10, background: colors.pageBg, borderRadius: 5 }}>
                    <div style={{ width: `${rr.pct}%`, height: '100%', background: rr.color, borderRadius: 5 }} />
                  </div>
                  <span className="tnum" style={{ width: 70, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{rr.val}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
              {isVoid
                ? 'Reasons come from the Toast void-reason field at entry.'
                : 'Types come from the discount buttons configured in Toast.'}
            </div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{isVoid ? 'Most Voided Items' : 'Most Discounted Items'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {items.map((it, i) => (
                <RankRow key={it.name} n={i + 1} name={it.name} val={it.val} />
              ))}
            </div>
          </div>
        </div>

        {/* ===== BY EMPLOYEE ===== */}
        <SectionHeader
          title={`${isVoid ? 'Voids' : 'Discounts'} by Employee`}
          right={<span style={{ fontSize: 12, color: colors.muted3 }}>Target: &lt; {target}% of own sales</span>}
        />
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 600 }}>Employee</th>
                <th style={{ textAlign: 'left', padding: '12px 12px', fontWeight: 600 }}>Role</th>
                <th style={{ textAlign: 'left', padding: '12px 12px', fontWeight: 600 }}>Location</th>
                <th style={{ padding: '12px 12px', fontWeight: 600 }}>{noun} $</th>
                <th style={{ padding: '12px 12px', fontWeight: 600 }}>{isVoid ? 'Items' : 'Checks'}</th>
                <th style={{ padding: '12px 12px', fontWeight: 600 }}>% of Own Sales</th>
                <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'left' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedEmps.map((e) => {
                const over = e.pct > target
                return (
                  <tr key={e.name} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                    <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 600 }}>{e.name}</td>
                    <td style={{ textAlign: 'left', padding: '13px 12px', color: colors.muted2 }}>{e.role}</td>
                    <td style={{ textAlign: 'left', padding: '13px 12px' }}>{NAMES[e.loc]}</td>
                    <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(e.d)}</td>
                    <td style={{ padding: '13px 12px' }}>{e.q}</td>
                    <td style={{ padding: '13px 12px', fontWeight: 700, color: over ? colors.red : colors.greenDark, background: over ? colors.redBg : 'transparent' }}>
                      {e.pct.toFixed(1)}%
                    </td>
                    <td style={{ padding: '13px 18px', textAlign: 'left' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: over ? colors.red : colors.greenDark, background: over ? colors.redBg : colors.greenBg, padding: '3px 9px', borderRadius: 5 }}>
                        {over ? '● Over target' : '✓ Within'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
          % of own sales = {noun.toLowerCase()} dollars ÷ that employee's net sales for the period. Rows over the personal
          target are tinted; investigate via the exception list for check-level detail.
        </div>
      </div>
    </div>
  )
}
