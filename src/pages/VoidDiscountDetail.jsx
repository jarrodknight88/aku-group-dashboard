import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle, { Crumbs } from '../components/PageTitle.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, StatRow, RankRow, ModeToggle } from '../components/cards.jsx'
import { colors, layout } from '../theme.js'
import { PERSONAL_VOID_TARGET, PERSONAL_DISCOUNT_TARGET } from '../config.js'

/** §11 responsive pattern: wide tables collapse to stacked cards below 720px. */
function useWindowWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const onR = () => setW(window.innerWidth)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])
  return w
}

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
  const [empSort, setEmpSort] = useState(null) // null = follow toggle; else {key, dir}
  const [query, setQuery] = useState('')
  const isMobile = useWindowWidth() < 720

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

  const empVal = (e, key) => (key === 'name' ? e.name.toLowerCase() : key === 'role' ? e.role.toLowerCase() : e[key])
  const sortKey = empSort?.key ?? (mode === 'dollar' ? 'd' : 'q')
  const sortDir = empSort?.dir ?? 'desc'
  const sortedEmps = [...emps]
    .filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const va = empVal(a, sortKey)
      const vb = empVal(b, sortKey)
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb
      return sortDir === 'asc' ? c : -c
    })
  const overCount = emps.filter((e) => e.pct > target).length
  const EmpTh = ({ k, left, wide, children }) => (
    <th
      onClick={() => setEmpSort((s) => ({ key: k, dir: s?.key === k && s.dir === 'desc' ? 'asc' : k === 'name' || k === 'role' ? 'asc' : 'desc' }))}
      style={{ textAlign: left ? 'left' : 'right', padding: wide ? '12px 18px' : '12px 12px', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {children}
      <span style={{ color: colors.brand }}>{sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )

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

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <Crumbs
          items={[
            loc ? { label: NAMES[loc], to: `/locations/${loc}` } : { label: 'Company', to: '/' },
            { label: 'Money Protected' },
            { label: 'Void & Discount Detail' },
          ]}
        />
        <PageTitle
          title="Void & Discount Detail"
          meta={
            <>
              The "why" behind the numbers · {loc ? NAMES[loc] : 'org-wide'} ·{' '}
              <span style={{ color: '#8A6D1A', background: '#FBF3DC', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 5 }}>
                Sample data — void/discount detail pending Toast import
              </span>
            </>
          }
          right={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <DateRangePicker />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
                  <div onClick={() => setTabOv('void')} style={tabStyle(isVoid)}>Voids</div>
                  <div onClick={() => setTabOv('discount')} style={tabStyle(!isVoid)}>Discounts</div>
                </div>
                <ModeToggle mode={mode} onChange={setMode} labels={['By $', 'By Qty']} />
              </div>
            </div>
          }
        />

        {/* ===== SUMMARY STRIP ===== */}
        <StatRow
          size={26}
          min={170}
          style={{ marginBottom: 20 }}
          items={[
            {
              label: `Total ${noun}`,
              value: mode === 'dollar' ? fmt(empTotal.d) : empTotal.q,
              sub: (
                <span style={{ fontSize: 11, color: colors.muted3 }}>
                  {mode === 'dollar'
                    ? `${empTotal.q} ${isVoid ? 'voided items' : 'discounted checks'}`
                    : `${isVoid ? 'items voided · ' : 'checks discounted · '}${fmt(empTotal.d)}`}
                </span>
              ),
            },
            {
              label: '% of Sales',
              value: `${pctVal.toFixed(1)}%`,
              valueColor: overTarget ? colors.red : colors.greenDark,
              sub: (
                <span style={{ fontSize: 11, color: overTarget ? colors.red : colors.muted3, fontWeight: 600 }}>
                  Target &lt; {target}% · {overTarget ? 'over' : 'within'}
                </span>
              ),
            },
            {
              label: 'Peak Day',
              value: peak[0],
              sub: <span style={{ fontSize: 11, color: colors.muted3 }}>{peak[1]} — highest of the week</span>,
            },
            {
              label: 'Employees Over Target',
              value: overCount,
              valueColor: overCount > 0 ? colors.red : colors.ink,
              sub: (
                <span style={{ fontSize: 11, color: overCount > 0 ? colors.red : colors.muted3, fontWeight: 600 }}>
                  {overCount > 0 ? `vs ${target}% personal target` : 'All within target'}
                </span>
              ),
            },
          ]}
        />

        {/* ===== BREAKDOWN + TOP ITEMS ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16, marginBottom: 24 }}>
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
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employee"
                style={{ padding: '7px 11px', border: `1px solid ${colors.borderStrong}`, borderRadius: 8, fontSize: 12, fontFamily: 'inherit', width: 160 }}
              />
              <span style={{ fontSize: 12, color: colors.muted3, whiteSpace: 'nowrap' }}>Target: &lt; {target}% of own sales</span>
            </div>
          }
        />
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedEmps.map((e) => {
              const over = e.pct > target
              return (
                <div key={e.name} style={{ ...card, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{e.name}</span>{' '}
                      <span style={{ color: colors.muted3, fontSize: 11 }}>· {e.role} · {NAMES[e.loc]}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: over ? colors.red : colors.greenDark, background: over ? colors.redBg : colors.greenBg, padding: '3px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                      {over ? 'Over target' : 'Within'}
                    </span>
                  </div>
                  <div className="tnum" style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <span><span style={{ color: colors.muted3 }}>{noun} </span><b>{fmt(e.d)}</b></span>
                    <span><span style={{ color: colors.muted3 }}>{isVoid ? 'Items ' : 'Checks '}</span><b>{e.q}</b></span>
                    <span style={{ color: over ? colors.red : colors.greenDark, fontWeight: 700 }}>{e.pct.toFixed(1)}% of own sales</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                    <EmpTh k="name" left wide>Employee</EmpTh>
                    <EmpTh k="role" left>Role</EmpTh>
                    <th style={{ textAlign: 'left', padding: '12px 12px', fontWeight: 600 }}>Location</th>
                    <EmpTh k="d">{noun} $</EmpTh>
                    <EmpTh k="q">{isVoid ? 'Items' : 'Checks'}</EmpTh>
                    <EmpTh k="pct">% of Own Sales</EmpTh>
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
                          <span style={{ fontSize: 11, fontWeight: 700, color: over ? colors.red : colors.greenDark, background: over ? colors.redBg : colors.greenBg, padding: '3px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                            {over ? 'Over target' : 'Within'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
          % of own sales = {noun.toLowerCase()} dollars ÷ that employee's net sales for the period. Rows over the personal
          target are tinted; investigate via the exception list for check-level detail.
        </div>
      </div>
    </div>
  )
}
