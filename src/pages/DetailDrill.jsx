import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, RankRow, ModeToggle } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'

/* ---------- demo data (Teranga ATL) ---------- */

// Top sellers with $/Qty ranking — ported from the handoff's DCLogic data.
const SELLERS = {
  food: {
    dollar: [
      ['Jollof Rice & Chicken', 4180], ['Suya Platter', 3520], ['Grilled Lamb Chops', 2910],
      ['Egusi Soup', 2300], ['Thieboudienne', 1960], ['Jollof Rice & Fish', 1540],
    ],
    qty: [
      ['Jollof Rice & Chicken', 312], ['Suya Platter', 264], ['Egusi Soup', 198],
      ['Thieboudienne', 176], ['Grilled Lamb Chops', 154], ['Plantain Side', 148],
    ],
  },
  liquor: {
    dollar: [
      ['Hennessy VSOP', 3140], ['Don Julio 1942', 2540], ['Casamigos Blanco', 1890],
      ['Moët Impérial', 1740], ['Veuve Clicquot', 1400], ['Grey Goose', 1180],
    ],
    qty: [
      ['Hennessy VSOP', 118], ['Casamigos Blanco', 96], ['Grey Goose', 84],
      ['Don Julio 1942', 62], ['Moët Impérial', 44], ['Veuve Clicquot', 36],
    ],
  },
  hookah: {
    dollar: [
      ['Double Apple', 1540], ['Mint', 1240], ['Blue Mist', 960],
      ['Watermelon', 760], ['Lemon Mint', 580], ['Grape', 420],
    ],
    qty: [
      ['Double Apple', 88], ['Mint', 71], ['Blue Mist', 55],
      ['Watermelon', 43], ['Lemon Mint', 33], ['Grape', 24],
    ],
  },
}

const PAYMENT_METHODS = [
  ['Visa / MC', '2,070', '$101,033', '$48.81', '$18,490', '71%'],
  ['Amex', '352', '$17,076', '$48.51', '$3,420', '12%'],
  ['Cash', '414', '$15,653', '$37.81', '$1,205', '11%'],
  ['Gift Card', '242', '$5,692', '$23.52', '$310', '4%'],
  ['Comp / Other', '102', '$2,846', '$27.90', '$0', '2%'],
]

// Exception preview — top rows behind the flag count; red = high severity.
const EXCEPTION_PREVIEW = [
  { check: '#48217 · Void after payment', amt: '$184.00', hot: true },
  { check: '#47903 · Discount > 50%', amt: '$210.00', hot: true },
  { check: '#48056 · Comp > $100', amt: '$126.00', hot: false },
  { check: '#47788 · Void after payment', amt: '$88.50', hot: false },
]

const PNL_REVENUE = [
  ['Food Sales', '$358,200', '58.0%'],
  ['Drink Sales', '$148,300', '24.0%'],
  ['Hookah', '$74,100', '12.0%'],
  ['Valet', '$36,500', '6.0%'],
]

/* ---------- page ---------- */

export default function DetailDrill() {
  const [mode, setMode] = useState('dollar') // 'dollar' | 'qty'

  const fmt = (v) =>
    mode === 'dollar' ? '$' + v.toLocaleString('en-US') : v.toLocaleString('en-US') + ' sold'
  const rows = (cat) => SELLERS[cat][mode].map((r, i) => ({ rank: i + 1, name: r[0], val: fmt(r[1]) }))

  const pnlSection = (label, right) => (
    <tr style={{ background: colors.panelGray }}>
      <td
        colSpan={right ? 2 : 3}
        style={{ padding: '12px 20px', fontWeight: 700, color: colors.brand, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}
      >
        {label}
      </td>
      {right && (
        <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: colors.brand, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>
          {right}
        </td>
      )}
    </tr>
  )

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="locations" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '22px 26px 48px' }}>
        <Link
          to="/locations/atl"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: colors.muted2, marginBottom: 12 }}
        >
          ← Back to Teranga ATL
        </Link>

        {/* ===== PAGE TITLE ===== */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.05 }}>
              Detail Drill{' '}
              <span style={{ fontFamily: fonts.sans, fontSize: 15, color: colors.muted3, fontWeight: 600 }}>· Teranga ATL</span>
            </div>
            <div style={{ fontSize: 13, color: colors.muted3, marginTop: 4 }}>
              The transaction-level "why" behind this location · Sep 15–21
            </div>
          </div>
        </div>

        {/* ===== TOP SELLERS ===== */}
        <SectionHeader title="Top Sellers" right={<ModeToggle mode={mode} onChange={setMode} />} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 30 }}>
          {[
            ['Top Food', rows('food')],
            ['Top Liquor', rows('liquor')],
            ['Top Hookah Flavor', rows('hookah')],
          ].map(([title, list]) => (
            <div key={title} style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {list.map((it) => (
                  <RankRow key={it.rank} n={it.rank} name={it.name} val={it.val} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ===== PAYMENT METHODS + EXCEPTIONS ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, marginBottom: 30 }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <div style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: 600 }}>Payment Methods</div>
              <div style={{ fontSize: 11, color: colors.muted3 }}>3,180 transactions · $142,300</div>
            </div>
            <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: colors.muted2, textAlign: 'right', borderBottom: `1px solid ${colors.pageBg}` }}>
                  <th style={{ textAlign: 'left', padding: '9px 6px', fontWeight: 600 }}>Method</th>
                  {['Txns', 'Volume', 'Avg Tx', 'Tips', 'Share'].map((h) => (
                    <th key={h} style={{ padding: '9px 6px', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PAYMENT_METHODS.map((row, ri) => (
                  <tr
                    key={row[0]}
                    style={{
                      textAlign: 'right',
                      borderBottom: ri < PAYMENT_METHODS.length - 1 ? `1px solid ${colors.panelGray}` : 'none',
                    }}
                  >
                    <td style={{ textAlign: 'left', padding: '11px 6px', fontWeight: 600 }}>{row[0]}</td>
                    {row.slice(1).map((c, i) => (
                      <td key={i} style={{ padding: '11px 6px', fontWeight: i === 4 ? 700 : 400 }}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Void / Exception preview → full list */}
          <Link to="/exceptions?loc=atl" style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: 600 }}>Void / Exception Detail</div>
              <div style={{ fontSize: 12, color: colors.brand, fontWeight: 700 }}>Open full list →</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {EXCEPTION_PREVIEW.map((e) => (
                <div
                  key={e.check}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    background: e.hot ? colors.redBg : colors.panelGray,
                    borderRadius: 9,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: e.hot ? colors.red : colors.muted1 }}>● Open</span>
                  <span style={{ flex: 1, fontSize: 12 }}>{e.check}</span>
                  <span className="tnum" style={{ fontSize: 12, fontWeight: 700 }}>{e.amt}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
              6 flags this period · $844.50 at risk · 4 open
            </div>
          </Link>
        </div>

        {/* ===== MONTHLY P&L ===== */}
        <SectionHeader
          title="Monthly P&L Summary"
          right={<div style={{ fontSize: 11, color: colors.muted3 }}>September 2025 · month-to-date</div>}
        />
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {pnlSection('Revenue', '% of Net Sales')}
              {PNL_REVENUE.map(([label, amt, pct]) => (
                <tr key={label} style={{ borderBottom: `1px solid ${colors.panelGray}` }}>
                  <td colSpan={2} style={{ padding: '11px 20px' }}>{label}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right' }}>
                    {amt} <span style={{ color: colors.muted3 }}>· {pct}</span>
                  </td>
                </tr>
              ))}
              <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                <td colSpan={2} style={{ padding: '12px 20px', fontWeight: 700 }}>Net Sales</td>
                <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700 }}>$617,100</td>
              </tr>

              {pnlSection('Cost of Goods & Operating')}
              <tr style={{ borderBottom: `1px solid ${colors.panelGray}` }}>
                <td colSpan={2} style={{ padding: '11px 20px' }}>
                  Food Cost <span style={{ fontSize: 11, color: colors.greenDark, fontWeight: 600 }}>· 29.4% ✓</span>
                </td>
                <td style={{ padding: '11px 20px', textAlign: 'right' }}>($181,400)</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${colors.panelGray}` }}>
                <td colSpan={2} style={{ padding: '11px 20px' }}>
                  Liquor Cost <span style={{ fontSize: 11, color: colors.muted3 }}>· 22.0%</span>
                </td>
                <td style={{ padding: '11px 20px', textAlign: 'right' }}>($32,600)</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${colors.panelGray}` }}>
                <td colSpan={2} style={{ padding: '11px 20px' }}>
                  Labor <span style={{ fontSize: 11, color: colors.greenDark, fontWeight: 600 }}>· 26.5% ✓</span>
                </td>
                <td style={{ padding: '11px 20px', textAlign: 'right' }}>($163,500)</td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${colors.panelGray}` }}>
                <td colSpan={2} style={{ padding: '11px 20px' }}>
                  Operating Expenses <span style={{ fontSize: 11, color: colors.muted3 }}>· invoice sheet</span>
                </td>
                <td style={{ padding: '11px 20px', textAlign: 'right' }}>($107,400)</td>
              </tr>
              <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                <td colSpan={2} style={{ padding: '12px 20px', fontWeight: 700 }}>Total Costs</td>
                <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700 }}>($484,900)</td>
              </tr>

              <tr style={{ background: colors.brand, color: '#fff' }}>
                <td colSpan={2} style={{ padding: '15px 20px', fontWeight: 700, fontSize: 15 }}>Net Operating Income</td>
                <td style={{ padding: '15px 20px', textAlign: 'right', fontFamily: fonts.serif, fontWeight: 600, fontSize: 22 }}>
                  $132,200
                </td>
              </tr>
              <tr style={{ background: '#102C58', color: colors.brandTint3 }}>
                <td colSpan={2} style={{ padding: '9px 20px', fontSize: 11 }}>Operating Margin</td>
                <td style={{ padding: '9px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#fff' }}>21.4%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
