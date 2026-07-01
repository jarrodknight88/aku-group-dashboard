import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
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

/* ---------- small building blocks ---------- */

const card = {
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: 13,
  padding: 20,
}

function RankRow({ n, name, val }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontFamily: fonts.serif, fontSize: 14, color: colors.brand, width: 16 }}>
        {n}
      </span>
      <span style={{ flex: 1, fontSize: 12 }}>{name}</span>
      <span className="tnum" style={{ fontSize: 12, fontWeight: 700 }}>
        {val}
      </span>
    </div>
  )
}

function RankedCard({ title, rows }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {rows.map((r, i) => (
          <RankRow key={i} n={i + 1} name={r[0]} val={r[1]} />
        ))}
      </div>
    </div>
  )
}

function BarList({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span>{it.label}</span>
            <span style={{ fontWeight: 700 }}>{it.val}</span>
          </div>
          <div style={{ height: 8, background: colors.pageBg, borderRadius: 4 }}>
            <div style={{ width: `${it.w}%`, height: '100%', background: it.color, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ---------- page ---------- */

export default function LocationReport() {
  const [empMode, setEmpMode] = useState('dollar') // 'dollar' | 'qty'

  const empServers = buildRankedList('servers', empMode)
  const empBartenders = buildRankedList('bartenders', empMode)
  const empHookah = buildRankedList('hookah', empMode)
  const overallRows = overallLeaders[empMode]

  const empTabActive = {
    padding: '5px 12px',
    borderRadius: 5,
    background: colors.brand,
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    cursor: 'pointer',
  }
  const empTabIdle = {
    padding: '5px 12px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 600,
    color: colors.muted3,
    cursor: 'pointer',
  }

  const uppercaseLabel = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: colors.muted2,
    fontWeight: 600,
  }

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
            <div key={t.label} style={{ ...card, borderRadius: 13 }}>
              <div style={uppercaseLabel}>{t.label}</div>
              <div
                className="tnum"
                style={{
                  fontFamily: fonts.serif,
                  fontSize: 36,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  marginTop: 6,
                }}
              >
                {t.value}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: colors.greenDark,
                    background: colors.greenBg,
                    padding: '2px 8px',
                    borderRadius: 5,
                  }}
                >
                  {t.delta}
                </span>
                <span style={{ fontSize: 12, color: colors.muted3 }}>vs last week</span>
              </div>
            </div>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {REVENUE_STREAMS.map((it) => (
                <div key={it.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span>{it.label}</span>
                    <span style={{ fontWeight: 700 }}>{it.val}</span>
                  </div>
                  <div style={{ height: 8, background: colors.pageBg, borderRadius: 4 }}>
                    <div style={{ width: `${it.w}%`, height: '100%', background: it.color, borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== MONEY SAVED ===== */}
        <SectionHeader title="Money Saved" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 30 }}>
          {/* Food Cost % — on target */}
          <div style={{ ...card, border: `1px solid ${colors.greenBorder}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={uppercaseLabel}>Food Cost %</div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.green }} />
            </div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 32, fontWeight: 500, marginTop: 6, color: colors.greenDark }}>
              29.4%
            </div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 5 }}>$41,840 cost · Target &lt; 30%</div>
          </div>
          {/* Labor % — on target */}
          <div style={{ ...card, border: `1px solid ${colors.greenBorder}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={uppercaseLabel}>Labor %</div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.green }} />
            </div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 32, fontWeight: 500, marginTop: 6, color: colors.greenDark }}>
              26.5%
            </div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 5 }}>$37,710 cost · Target &lt; 28%</div>
          </div>
          {/* Liquor Cost % — no target */}
          <div style={card}>
            <div style={uppercaseLabel}>Liquor Cost %</div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 32, fontWeight: 500, marginTop: 6 }}>
              22.0%
            </div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 5 }}>No fixed target</div>
          </div>
          {/* Total Expenses */}
          <div style={card}>
            <div style={uppercaseLabel}>Total Expenses</div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 32, fontWeight: 500, marginTop: 6 }}>
              $24,800
            </div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 5 }}>This location · invoice sheet</div>
          </div>
        </div>

        {/* ===== MONEY PROTECTED ===== */}
        <SectionHeader title="Money Protected" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gridAutoRows: '1fr', gap: 16 }}>
          {/* Row 1 — Void % */}
          <div style={{ ...card, border: `1px solid ${colors.greenBorder}`, padding: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={uppercaseLabel}>Void % of Sales</div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.green }} />
            </div>
            <div style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: 500, marginTop: 6, color: colors.greenDark }}>0.7%</div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>
              $996 · Target &lt; 1% · <span style={{ color: colors.greenDark, fontWeight: 600 }}>within</span>
            </div>
          </div>
          {/* Voids by Day */}
          <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Voids by Day</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 54 }}>
              {VOID_BARS.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: colors.muted3, borderRadius: 2 }} />
              ))}
            </div>
          </div>
          {/* Chargebacks by Stage */}
          <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Chargebacks by Stage</div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <div style={{ background: colors.greenBg, borderRadius: 10, padding: 13, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.greenDark, fontWeight: 700 }}>Won</div>
                <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600, color: colors.greenDark, marginTop: 4 }}>$1,120</div>
                <div style={{ fontSize: 11, color: colors.greenDark }}>2 recovered</div>
              </div>
              <div style={{ background: colors.panelGray, borderRadius: 10, padding: 13, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.muted1, fontWeight: 700 }}>In Progress</div>
                <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600, color: colors.inkSoft, marginTop: 4 }}>$640</div>
                <div style={{ fontSize: 11, color: colors.muted2 }}>1 at stake</div>
              </div>
              <div style={{ background: colors.redBg, borderRadius: 10, padding: 13, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.red, fontWeight: 700 }}>Lost</div>
                <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600, color: colors.red, marginTop: 4 }}>$480</div>
                <div style={{ fontSize: 11, color: colors.red }}>1 forfeited</div>
              </div>
            </div>
          </div>
          {/* Row 2 — Discount % */}
          <div style={{ ...card, border: `1px solid ${colors.greenBorder}`, padding: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={uppercaseLabel}>Discount % of Sales</div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.green }} />
            </div>
            <div style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: 500, marginTop: 6, color: colors.greenDark }}>2.8%</div>
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 4 }}>
              $3,984 · Target &lt; 3% · <span style={{ color: colors.greenDark, fontWeight: 600 }}>within</span>
            </div>
          </div>
          {/* Discounts by Day */}
          <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Discounts by Day</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 54 }}>
              {DISCOUNT_BARS.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: colors.brandTint1, borderRadius: 2 }} />
              ))}
            </div>
          </div>
          {/* Exception Flags — links out, scoped to this location */}
          <Link
            to="/exceptions?loc=atl"
            style={{
              background: colors.brand,
              borderRadius: 13,
              padding: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.brandTint3, fontWeight: 600 }}>
                Exception Flags
              </div>
              <div style={{ fontSize: 11, color: colors.brandTint4, marginTop: 3 }}>Transactions tripping audit rules</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ fontFamily: fonts.serif, fontSize: 38, fontWeight: 600, color: '#fff', lineHeight: 1 }}>6</div>
              <div style={{ background: '#fff', color: colors.brand, fontSize: 12, fontWeight: 700, padding: '7px 13px', borderRadius: 8 }}>
                Review →
              </div>
            </div>
          </Link>
        </div>

        {/* ===== TOP SELLERS ===== */}
        <SectionHeader
          title="Top Sellers"
          sub="Teranga ATL"
          style={{ margin: '30px 0 14px' }}
          right={
            <div style={{ display: 'flex', gap: 3, background: '#fff', border: `1px solid ${colors.border}`, padding: 3, borderRadius: 7 }}>
              <div style={{ padding: '5px 12px', borderRadius: 5, background: colors.brand, fontSize: 11, fontWeight: 700, color: '#fff' }}>Top by $</div>
              <div style={{ padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, color: colors.muted3 }}>Top by Qty</div>
            </div>
          }
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          <RankedCard title="Top Food" rows={TOP_FOOD} />
          <RankedCard title="Top Liquor" rows={TOP_LIQUOR} />
          <RankedCard title="Top Hookah Flavor" rows={TOP_HOOKAH} />
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Category Performance</div>
            <BarList items={CATEGORY_PERF} />
          </div>
        </div>

        {/* ===== TOP EMPLOYEES ===== */}
        <SectionHeader
          title="Top Employees"
          sub="Teranga ATL"
          style={{ margin: '30px 0 14px' }}
          right={
            <div style={{ display: 'flex', gap: 3, background: '#fff', border: `1px solid ${colors.border}`, padding: 3, borderRadius: 7 }}>
              <div onClick={() => setEmpMode('dollar')} style={empMode === 'dollar' ? empTabActive : empTabIdle}>
                Top by $
              </div>
              <div onClick={() => setEmpMode('qty')} style={empMode === 'qty' ? empTabActive : empTabIdle}>
                Top by Qty
              </div>
            </div>
          }
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          {/* Servers */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Servers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {empServers.map((e) => (
                <RankRow key={e.rank} n={e.rank} name={e.name} val={e.val} />
              ))}
            </div>
          </div>
          {/* Bartenders */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Bartenders</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {empBartenders.map((e) => (
                <RankRow key={e.rank} n={e.rank} name={e.name} val={e.val} />
              ))}
            </div>
          </div>
          {/* Hookah */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Hookah</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {empHookah.map((e) => (
                <RankRow key={e.rank} n={e.rank} name={e.name} val={e.val} />
              ))}
            </div>
          </div>
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
