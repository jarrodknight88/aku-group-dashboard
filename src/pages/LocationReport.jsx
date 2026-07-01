import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import {
  card,
  StatTile,
  KpiTile,
  Within,
  RankRow,
  RankedCard,
  BarList,
  DayBarsCard,
  ChargebacksCard,
  ExceptionTile,
  ModeToggle,
} from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { buildRankedList, overallLeaders } from '../data/topEmployees.js'

/* ---------- static demo data (Teranga ATL) ---------- */

const HEADLINE = [
  { label: 'Net Sales', value: '$142,300', delta: '▲ 6.8%' },
  { label: 'Covers', value: '3,180', delta: '▲ 3.4%' },
  { label: 'Avg Check', value: '$44.75', delta: '▲ 3.0%' },
  { label: 'Valet Revenue', value: '$8,400', delta: '▲ 2.1%' },
]

const DAILY_SALES = [
  { day: 'Mon', label: '$18.2K', h: 80 },
  { day: 'Tue', label: '$16.4K', h: 72 },
  { day: 'Wed', label: '$20.1K', h: 89 },
  { day: 'Thu', label: '$23.8K', h: 105 },
  { day: 'Fri', label: '$28.6K', h: 126 },
  { day: 'Sat', label: '$29.4K', h: 130 },
  { day: 'Sun', label: '$18.8K', h: 83 },
]

const PAYMENT_MIX = [
  { label: 'Card (Visa/MC)', pct: '71%', color: colors.brand },
  { label: 'Amex', pct: '12%', color: colors.brandTint1 },
  { label: 'Cash', pct: '11%', color: colors.brandTint2 },
  { label: 'Gift Card', pct: '4%', color: colors.brandTint3 },
  { label: 'Comp / Other', pct: '2%', color: colors.brandTint5 },
]

const REVENUE_STREAMS = [
  { label: 'Food', val: '$82.5K · 58%', w: 100, color: colors.brand },
  { label: 'Drink', val: '$34.2K · 24%', w: 41, color: colors.brandTint1 },
  { label: 'Hookah', val: '$17.1K · 12%', w: 21, color: colors.brandTint2 },
  { label: 'Valet', val: '$8.4K · 6%', w: 10, color: colors.brandTint4 },
]

const CATEGORY_PERF = [
  { label: 'Food', val: '$82.5K', w: 100, color: colors.brand },
  { label: 'Drink', val: '$34.2K', w: 41, color: colors.brandTint1 },
  { label: 'Hookah', val: '$17.1K', w: 21, color: colors.brandTint2 },
  { label: 'Valet', val: '$8.4K', w: 10, color: colors.brandTint4 },
]

const VOID_BARS = [45, 60, 35, 72, 100, 88, 50]
const DISCOUNT_BARS = [55, 68, 48, 82, 100, 92, 62]

const TOP_FOOD = [
  ['Jollof Rice & Chicken', '$4,180'],
  ['Suya Platter', '$3,520'],
  ['Grilled Lamb Chops', '$2,910'],
  ['Egusi Soup', '$2,300'],
  ['Thieboudienne', '$1,960'],
]
const TOP_LIQUOR = [
  ['Hennessy VSOP', '$3,140'],
  ['Don Julio 1942', '$2,540'],
  ['Casamigos Blanco', '$1,890'],
  ['Moët Impérial', '$1,740'],
  ['Veuve Clicquot', '$1,400'],
]
const TOP_HOOKAH = [
  ['Double Apple', '$1,540'],
  ['Mint', '$1,240'],
  ['Blue Mist', '$960'],
  ['Watermelon', '$760'],
  ['Lemon Mint', '$580'],
]

/* ---------- page ---------- */

export default function LocationReport() {
  const [empMode, setEmpMode] = useState('dollar') // 'dollar' | 'qty'

  const empServers = buildRankedList('servers', empMode)
  const empBartenders = buildRankedList('bartenders', empMode)
  const empHookah = buildRankedList('hookah', empMode)
  const overallRows = overallLeaders[empMode]

  const donut = `conic-gradient(${colors.brand} 0 71%, ${colors.brandTint1} 71% 83%, ${colors.brandTint2} 83% 94%, ${colors.brandTint3} 94% 98%, ${colors.brandTint5} 98% 100%)`

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="locations" />

      {/* ===== LOCATION SUB-BAR ===== */}
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '22px 26px 0' }}>
        <Link
          to="/locations"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            color: colors.muted2,
            marginBottom: 12,
          }}
        >
          ← Back to Locations
        </Link>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: fonts.serif,
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                lineHeight: 1.05,
              }}
            >
              Teranga ATL
            </div>
            <div style={{ fontSize: 13, color: colors.muted3, marginTop: 4 }}>
              Atlanta, GA · measured against this location's targets
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                gap: 4,
                background: '#fff',
                border: `1px solid ${colors.border}`,
                padding: 4,
                borderRadius: 10,
              }}
            >
              <div style={{ padding: '8px 14px', borderRadius: 7, background: colors.brand, color: '#fff', fontSize: 13, fontWeight: 600 }}>
                Teranga ATL
              </div>
              <div style={{ padding: '8px 14px', borderRadius: 7, color: colors.muted1, fontSize: 13, fontWeight: 600 }}>
                Teranga CLT
              </div>
              <div style={{ padding: '8px 14px', borderRadius: 7, color: colors.muted1, fontSize: 13, fontWeight: 600 }}>
                Afro District
              </div>
              <div style={{ padding: '8px 14px', borderRadius: 7, color: colors.muted4, fontSize: 13, fontWeight: 600 }}>
                R Thomas · soon
              </div>
            </div>
            <Link
              to="/detail-drill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 16px',
                background: colors.brand,
                color: '#fff',
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              View Detail Drill →
            </Link>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '24px 26px 48px' }}>
        {/* ===== HEADLINE STRIP ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 30 }}>
          {HEADLINE.map((t) => (
            <StatTile key={t.label} {...t} />
          ))}
        </div>

        {/* ===== MONEY IN ===== */}
        <SectionHeader title="Money In" />
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 16, marginBottom: 30 }}>
          {/* Daily Sales */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Daily Sales</div>
              <div style={{ fontSize: 11, color: colors.muted3 }}>Net sales this location by day</div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 14,
                height: 172,
                marginTop: 18,
              }}
            >
              {DAILY_SALES.map((d) => (
                <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, flex: 1 }}>
                  <div style={{ fontSize: 10, color: colors.muted2, fontWeight: 600 }}>{d.label}</div>
                  <div style={{ width: '100%', maxWidth: 46, height: d.h, background: colors.brand, borderRadius: '4px 4px 0 0' }} />
                  <div style={{ fontSize: 10, color: colors.muted3 }}>{d.day}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Mix */}
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Payment Mix</div>
            <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>Tender type breakdown</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: '50%',
                  background: donut,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div style={{ width: 62, height: 62, borderRadius: '50%', background: '#fff' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {PAYMENT_MIX.map((p) => (
                  <div key={p.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: p.color }} />
                      {p.label}
                    </span>
                    <span style={{ fontWeight: 700 }}>{p.pct}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Revenue Streams */}
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue Streams</div>
            <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>Food · Drink · Hookah · Valet</div>
            <BarList items={REVENUE_STREAMS} gap={13} />
          </div>
        </div>

        {/* ===== MONEY SAVED ===== */}
        <SectionHeader title="Money Saved" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 30 }}>
          <KpiTile label="Food Cost %" value="29.4%" status="good" subTop={5} sub="$41,840 cost · Target < 30%" />
          <KpiTile label="Labor %" value="26.5%" status="good" subTop={5} sub="$37,710 cost · Target < 28%" />
          <KpiTile label="Liquor Cost %" value="22.0%" sub="No fixed target" />
          <KpiTile label="Total Expenses" value="$24,800" sub="This location · invoice sheet" />
        </div>

        {/* ===== MONEY PROTECTED ===== */}
        <SectionHeader title="Money Protected" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gridAutoRows: '1fr', gap: 16 }}>
          <KpiTile
            label="Void % of Sales"
            value="0.7%"
            status="good"
            size={30}
            padding={18}
            sub={<>$996 · Target &lt; 1% · <Within /></>}
          />
          <DayBarsCard title="Voids by Day" bars={VOID_BARS} color={colors.muted3} />
          <ChargebacksCard
            won={{ amt: '$1,120', note: '2 recovered' }}
            inProgress={{ amt: '$640', note: '1 at stake' }}
            lost={{ amt: '$480', note: '1 forfeited' }}
          />
          <KpiTile
            label="Discount % of Sales"
            value="2.8%"
            status="good"
            size={30}
            padding={18}
            sub={<>$3,984 · Target &lt; 3% · <Within /></>}
          />
          <DayBarsCard title="Discounts by Day" bars={DISCOUNT_BARS} color={colors.brandTint1} />
          <ExceptionTile count={6} to="/exceptions?loc=atl" />
        </div>

        {/* ===== TOP SELLERS ===== */}
        <SectionHeader title="Top Sellers" sub="Teranga ATL" style={{ margin: '30px 0 14px' }} right={<ModeToggle />} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          <RankedCard title="Top Food" rows={TOP_FOOD} />
          <RankedCard title="Top Liquor" rows={TOP_LIQUOR} />
          <RankedCard title="Top Hookah Flavor" rows={TOP_HOOKAH} />
          <div style={{ ...card, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Category Performance</div>
            <BarList items={CATEGORY_PERF} />
          </div>
        </div>

        {/* ===== TOP EMPLOYEES ===== */}
        <SectionHeader
          title="Top Employees"
          sub="Teranga ATL"
          style={{ margin: '30px 0 14px' }}
          right={<ModeToggle mode={empMode} onChange={setEmpMode} />}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          {[
            ['Servers', empServers],
            ['Bartenders', empBartenders],
            ['Hookah', empHookah],
          ].map(([title, rows]) => (
            <div key={title} style={{ ...card, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{title}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {rows.map((e) => (
                  <RankRow key={e.rank} n={e.rank} name={e.name} val={e.val} />
                ))}
              </div>
            </div>
          ))}
          {/* Overall — category leaders, highlighted */}
          <div style={{ background: colors.brand, borderRadius: 13, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 13 }}>Overall</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {overallRows.map((o) => (
                <div key={o.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.brandTint3, fontWeight: 700 }}>
                    {o.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 13, color: '#fff', fontWeight: 600 }}>
                      {o.name}{' '}
                      <span style={{ color: colors.brandTint3, fontSize: 10, fontWeight: 500 }}>· {o.role}</span>
                    </span>
                    <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                      {o.val}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
