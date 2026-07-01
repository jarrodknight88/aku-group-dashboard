import AppHeader from '../components/AppHeader.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import {
  card,
  StatTile,
  KpiTile,
  Within,
  RankedCard,
  BarList,
  DayBarsCard,
  ChargebacksCard,
  ExceptionTile,
  ModeToggle,
} from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'

/* ---------- demo data (org-wide) ---------- */

const HEADLINE = [
  { label: 'Total Net Sales', value: '$317,300', delta: '▲ 6.2%' },
  { label: 'Total Covers', value: '7,650', delta: '▲ 3.1%' },
  { label: 'Avg Check Size', value: '$41.48', delta: '▲ 2.9%' },
  { label: 'Valet Revenue', value: '$16,700', delta: '▲ 1.8%' },
]

// Daily Sales by Location — three bars (ATL / CLT / Afro) per day, px heights.
const DAILY_BY_LOC = [
  { day: 'Mon', h: [78, 54, 40] },
  { day: 'Tue', h: [70, 48, 36] },
  { day: 'Wed', h: [88, 60, 44] },
  { day: 'Thu', h: [104, 72, 52] },
  { day: 'Fri', h: [122, 96, 70] },
  { day: 'Sat', h: [128, 100, 76] },
  { day: 'Sun', h: [84, 58, 42] },
]
const LOC_COLORS = [colors.brand, colors.brandTint1, colors.brandTint3]

const REVENUE_MIX = [
  { label: 'Teranga ATL', pct: '45%', color: colors.brand },
  { label: 'Teranga CLT', pct: '31%', color: colors.brandTint1 },
  { label: 'Afro District', pct: '24%', color: colors.brandTint3 },
]

// Revenue Streams — stacked Food/Drink/Hookah/Valet share per location.
const STREAMS_BY_LOC = [
  { label: 'Teranga ATL', w: [58, 24, 12, 6] },
  { label: 'Teranga CLT', w: [54, 26, 14, 6] },
  { label: 'Afro District', w: [62, 20, 13, 5] },
]
const STREAM_COLORS = [colors.brand, colors.brandTint1, colors.brandTint2, colors.brandTint4]
const STREAM_LABELS = ['Food', 'Drink', 'Hookah', 'Valet']

// Voids by Day — Friday spike reads red.
const VOID_BARS = [
  { h: 40 }, { h: 55 }, { h: 30 }, { h: 70 },
  { h: 100, color: colors.redBright },
  { h: 85 }, { h: 45 },
]
const DISCOUNT_BARS = [50, 65, 45, 80, 100, 90, 60]

const TOP_FOOD = [
  ['Jollof Rice & Chicken', '$9,240'],
  ['Suya Platter', '$7,810'],
  ['Grilled Lamb Chops', '$6,470'],
  ['Egusi Soup', '$5,120'],
  ['Thieboudienne', '$4,360'],
]
const TOP_LIQUOR = [
  ['Hennessy VSOP', '$6,980'],
  ['Don Julio 1942', '$5,640'],
  ['Casamigos Blanco', '$4,210'],
  ['Moët Impérial', '$3,880'],
  ['Veuve Clicquot', '$3,120'],
]
const TOP_HOOKAH = [
  ['Double Apple', '$3,420'],
  ['Mint', '$2,760'],
  ['Blue Mist', '$2,140'],
  ['Watermelon', '$1,690'],
  ['Lemon Mint', '$1,280'],
]
const CATEGORY_PERF = [
  { label: 'Food', val: '$181K', w: 90, color: colors.brand },
  { label: 'Drink', val: '$78K', w: 48, color: colors.brandTint1 },
  { label: 'Hookah', val: '$41K', w: 28, color: colors.brandTint2 },
  { label: 'Valet', val: '$17K', w: 12, color: colors.brandTint4 },
]

// Location Comparison — cell: plain string, or {v, good} for color-coded,
// or {v, good, fill: true} for the heavier tinted-background treatment.
const COMPARISON = [
  {
    name: 'Teranga ATL',
    cells: [
      '$142,300', '$8,400', '3,180', '$44.75',
      { v: '0.7%', good: true },
      { v: '2.8%', good: true },
      { v: '29.4%', good: true, fill: true },
      { v: '26.5%', good: true, fill: true },
      '22.0%',
    ],
  },
  {
    name: 'Teranga CLT',
    cells: [
      '$98,600', '$5,200', '2,420', '$40.74',
      { v: '0.9%', good: true },
      { v: '3.9%', good: false, fill: true },
      { v: '31.2%', good: false, fill: true },
      { v: '29.4%', good: false, fill: true },
      '23.6%',
    ],
  },
  {
    name: 'Afro District',
    cells: [
      '$76,400', '$3,100', '2,050', '$37.27',
      { v: '0.8%', good: true },
      { v: '2.6%', good: true },
      { v: '28.1%', good: true, fill: true },
      { v: '27.8%', good: true, fill: true },
      '21.8%',
    ],
  },
]
const COMPARISON_HEADERS = ['Net Sales', 'Valet', 'Covers', 'Avg Check', 'Voids', 'Discounts', 'Food %', 'Labor %', 'Liquor %']

function comparisonCellStyle(cell, last) {
  const base = { padding: last ? '13px 18px' : '13px 12px' }
  if (typeof cell === 'string') return base
  if (cell.fill) {
    return {
      ...base,
      background: cell.good ? colors.greenBg : colors.redBg,
      color: cell.good ? colors.greenDark : colors.red,
      fontWeight: 700,
    }
  }
  return { ...base, color: cell.good ? colors.greenDark : colors.red }
}

/* ---------- page ---------- */

export default function CompanyGlance() {
  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="company" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '28px 26px 48px' }}>
        {/* ===== HEADLINE STRIP ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 30 }}>
          {HEADLINE.map((t) => (
            <StatTile key={t.label} {...t} />
          ))}
        </div>

        {/* ===== MONEY IN ===== */}
        <SectionHeader title="Money In" />
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 16, marginBottom: 30 }}>
          {/* Daily Sales by Location */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Daily Sales by Location</div>
              <div style={{ fontSize: 11, color: colors.muted3 }}>Net sales / day</div>
            </div>
            <div style={{ display: 'flex', gap: 14, margin: '11px 0 16px' }}>
              {['ATL', 'CLT', 'Afro District'].map((l, i) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.muted2 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: LOC_COLORS[i] }} />
                  {l}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, height: 150 }}>
              {DAILY_BY_LOC.map((d) => (
                <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130 }}>
                    {d.h.map((h, i) => (
                      <div key={i} style={{ width: 10, height: h, background: LOC_COLORS[i], borderRadius: '2px 2px 0 0' }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: colors.muted3 }}>{d.day}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue Mix */}
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue Mix</div>
            <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>Share by location</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: '50%',
                  background: `conic-gradient(${colors.brand} 0 45%, ${colors.brandTint1} 45% 76%, ${colors.brandTint3} 76% 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: '50%',
                    background: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ fontFamily: fonts.serif, fontSize: 17, fontWeight: 600 }}>$317K</div>
                  <div style={{ fontSize: 9, color: colors.muted3 }}>net</div>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {REVENUE_MIX.map((m) => (
                  <div key={m.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: m.color }} />
                      {m.label}
                    </span>
                    <span style={{ fontWeight: 700 }}>{m.pct}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Revenue Streams by location */}
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue Streams</div>
            <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>Food · Drink · Hookah · Valet</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STREAMS_BY_LOC.map((l) => (
                <div key={l.label}>
                  <div style={{ fontSize: 11, color: colors.muted2, marginBottom: 5 }}>{l.label}</div>
                  <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden' }}>
                    {l.w.map((w, i) => (
                      <div key={i} style={{ width: `${w}%`, background: STREAM_COLORS[i] }} />
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                {STREAM_LABELS.map((s, i) => (
                  <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: colors.muted2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: STREAM_COLORS[i] }} />
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ===== MONEY SAVED ===== */}
        <SectionHeader title="Money Saved" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 30 }}>
          <KpiTile label="Food Cost %" value="29.6%" status="good" subTop={5} sub={<>Target &lt; 30% · <Within /></>} />
          <KpiTile label="Labor Cost %" value="27.2%" status="good" subTop={5} sub={<>Target &lt; 28% · <Within /></>} />
          <KpiTile label="Liquor Cost %" value="22.5%" sub="No fixed target" />
          <KpiTile label="Total Expenses" value="$54,200" sub="From invoice sheet" />
        </div>

        {/* ===== MONEY PROTECTED ===== */}
        <SectionHeader title="Money Protected" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gridAutoRows: '1fr', gap: 16, marginBottom: 30 }}>
          <KpiTile
            label="Void % of Sales"
            value="0.8%"
            status="good"
            size={30}
            padding={18}
            sub={<>Target &lt; 1% · <Within /></>}
          />
          <DayBarsCard title="Voids by Day" bars={VOID_BARS} color={colors.muted3} />
          <ChargebacksCard
            won={{ amt: '$2,340', note: '4 recovered' }}
            inProgress={{ amt: '$1,890', note: '3 at stake' }}
            lost={{ amt: '$1,120', note: '2 forfeited' }}
          />
          <KpiTile
            label="Discount % of Sales"
            value="3.4%"
            status="bad"
            size={30}
            padding={18}
            sub={<>Target &lt; 3% · over</>}
          />
          <DayBarsCard title="Discounts by Day" bars={DISCOUNT_BARS} color={colors.brandTint1} />
          <ExceptionTile count={17} to="/exceptions" />
        </div>

        {/* ===== TOP SELLERS ===== */}
        <SectionHeader title="Top Sellers" sub="org-wide" right={<ModeToggle />} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 30 }}>
          <RankedCard title="Top Food" rows={TOP_FOOD} />
          <RankedCard title="Top Liquor" rows={TOP_LIQUOR} />
          <RankedCard title="Top Hookah Flavor" rows={TOP_HOOKAH} />
          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Category Performance</div>
            <BarList items={CATEGORY_PERF} />
          </div>
        </div>

        {/* ===== LOCATION COMPARISON ===== */}
        <SectionHeader title="Location Comparison" />
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 600 }}>Location</th>
                {COMPARISON_HEADERS.map((h, i) => (
                  <th key={h} style={{ padding: i === COMPARISON_HEADERS.length - 1 ? '12px 18px' : 12, fontWeight: 600 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.name} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                  <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 700 }}>{row.name}</td>
                  {row.cells.map((cell, i) => (
                    <td key={i} style={comparisonCellStyle(cell, i === row.cells.length - 1)}>
                      {typeof cell === 'string' ? cell : cell.v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
