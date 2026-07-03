import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import PageTitle, { Crumbs, dataThrough } from '../components/PageTitle.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import {
  card,
  StatRow,
  DeltaChip,
  KpiTile,
  DetailsTail,
  RankRow,
  DayBarsCard,
  DAY_LABELS,
  weekdayBars,
  DonutRing,
  ChargebacksCard,
  ExceptionTile,
  ModeToggle,
} from '../components/cards.jsx'
import { useHoverTip } from '../components/HoverTip.jsx'
import { colors, fonts, layout } from '../theme.js'
import { fetchLocations, sumDaily, groupSum } from '../data/live.js'
import { useDashboardData } from '../data/useDashboardData.js'
import { fmtMoney, fmtMoneyC, fmtK, fmtPct, fmtInt, deltaPct, fmtDelta } from '../lib/format.js'
import { fromStr } from '../lib/dates.js'

/* Live Level 2 — everything on this page derives from the Toast import
   tables for the globally selected date range. Cost tiles show awaiting
   states until the invoice intake and labor sources exist. */

const CITY_LABELS = { Atlanta: 'Atlanta, GA', Charlotte: 'Charlotte, NC' }
const STREAM_COLORS = [colors.brand, colors.brandTint1, colors.brandTint2, colors.brandTint3, colors.brandTint4, colors.brandTint5]

/* Top Employees is fed by daily_server_categories (per-employee sales split
   by Toast sales category, with the day's clocked-in job title). Sales
   attribute to the order's server, so hookah/bar staff who don't ring their
   own orders rank by what sold on the orders they DID ring. */

// Toast job title → dashboard role card. Order-takers default to Servers.
const roleOf = (job) =>
  /bartend|mixolog/i.test(job || '') ? 'bartenders' : /hookah/i.test(job || '') ? 'hookah' : 'servers'

// Category → qty unit per role card ("512 items" / "517 drinks" / "142 hookahs").
const DRINK_CATS = /liquor|beer|wine|bever|cocktail|drink/i
const HOOKAH_CATS = /hookah/i

const catQty = (emp, re) =>
  Object.entries(emp.cats).reduce((s, [c, v]) => (re.test(c) ? s + v.qty : s), 0)

/** Aggregate daily_server_categories rows into one record per employee. */
function rollupEmployees(rows) {
  const byEmp = new Map()
  for (const r of rows ?? []) {
    let e = byEmp.get(r.employee_guid)
    if (!e) byEmp.set(r.employee_guid, (e = { guid: r.employee_guid, name: '', job: '', total: 0, items: 0, cats: {} }))
    if (r.employee_name) e.name = r.employee_name
    if (r.job_title) e.job = r.job_title
    const net = Number(r.net_sales) || 0
    const qty = Number(r.quantity) || 0
    e.total += net
    e.items += qty
    const c = (e.cats[r.category] = e.cats[r.category] || { net: 0, qty: 0 })
    c.net += net
    c.qty += qty
  }
  return [...byEmp.values()].map((e) => ({ ...e, name: e.name || e.guid.slice(0, 8), role: roleOf(e.job) }))
}

const ROLE_CARDS = [
  { key: 'servers', title: 'Servers', qtyOf: (e) => e.items, unit: 'items' },
  { key: 'bartenders', title: 'Bartenders', qtyOf: (e) => catQty(e, DRINK_CATS), unit: 'drinks' },
  { key: 'hookah', title: 'Hookah', qtyOf: (e) => catQty(e, HOOKAH_CATS), unit: 'hookahs' },
]

// Overall card: per-category leaders across every role.
const LEADER_DEFS = [
  { label: 'Most Food Sold', re: /^food$/i, unit: 'items' },
  { label: 'Most Liquor Sold', re: /^liquor$/i, unit: 'drinks' },
  { label: 'Most Hookah Sold', re: /^hookah$/i, unit: 'hookahs' },
]
const ROLE_TAGS = { servers: 'Server', bartenders: 'Bartender', hookah: 'Hookah' }

/** Joined-row headline item with a delta chip vs the comparison window. */
function statItem(label, cur, prev, fmt) {
  const d = deltaPct(cur, prev)
  return { label, value: fmt(cur), sub: <DeltaChip delta={fmtDelta(d)} up={d == null ? true : d >= 0} /> }
}

/** Daily net-sales bar chart; buckets into weeks when the range is long. */
function DailySalesCard({ rows }) {
  const buckets = useMemo(() => {
    const byDate = new Map()
    for (const r of rows) byDate.set(r.business_date, (byDate.get(r.business_date) || 0) + Number(r.net_sales))
    const days = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    if (days.length <= 31) {
      return days.map(([d, v]) => {
        const dt = fromStr(d)
        const wd = DAY_LABELS[(dt.getDay() + 6) % 7]
        return {
          label: days.length <= 14 ? wd : String(dt.getDate()),
          tipDay: days.length <= 14 ? wd : `${dt.getMonth() + 1}/${dt.getDate()}`,
          v,
          key: d,
        }
      })
    }
    const weeks = new Map()
    for (const [d, v] of days) {
      const dt = fromStr(d)
      const monday = new Date(dt)
      monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
      const k = monday.toISOString().slice(5, 10)
      weeks.set(k, (weeks.get(k) || 0) + v)
    }
    return [...weeks.entries()].map(([k, v]) => ({ label: k.replace('-', '/'), tipDay: `wk ${k.replace('-', '/')}`, v, key: `wk ${k}` }))
  }, [rows])

  const max = Math.max(1, ...buckets.map((b) => b.v))
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Daily Sales</div>
        <div style={{ fontSize: 11, color: colors.muted3 }}>
          Net sales by {buckets.length > 0 && rows.length > 31 ? 'week' : 'day'}
        </div>
      </div>
      {buckets.length === 0 ? (
        <div style={{ height: 172, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.muted3, fontSize: 12 }}>
          No data in this range
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4, height: 172, marginTop: 18 }}>
          {buckets.map((b) => (
            <div key={b.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
              {buckets.length <= 14 && <div style={{ fontSize: 10, color: colors.muted2, fontWeight: 600 }}>{fmtK(b.v)}</div>}
              <div
                data-tip={`${b.tipDay} · ${fmtK(b.v)} net sales${b.v === max && b.v > 0 ? ' — best day' : ''}`}
                style={{ width: '100%', maxWidth: 46, height: Math.max(3, (b.v / max) * 118), background: colors.brand, borderRadius: '4px 4px 0 0' }}
              />
              <div style={{ fontSize: 9, color: colors.muted3, whiteSpace: 'nowrap' }}>{b.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PaymentMixCard({ pays }) {
  const groups = useMemo(
    () => groupSum(pays, (r) => r.payment_type, ['amount', 'pay_count', 'tips']).sort((a, b) => b.amount - a.amount),
    [pays],
  )
  const total = groups.reduce((s, g) => s + g.amount, 0)
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0)
  const tipFor = (g) => `${g.key} · ${fmtMoney(g.amount)} · ${pct(g.amount)}%`
  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Payment Mix</div>
      <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>Tender share of collected</div>
      {groups.length === 0 ? (
        <div style={{ color: colors.muted3, fontSize: 12 }}>No payments in range</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <DonutRing segments={groups.map((g, i) => ({ value: g.amount, color: STREAM_COLORS[i % STREAM_COLORS.length], tip: tipFor(g) }))} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.slice(0, 6).map((g, i) => (
              <div key={g.key} data-tip={tipFor(g)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: STREAM_COLORS[i % STREAM_COLORS.length] }} />
                  {g.key}
                </span>
                <span style={{ fontWeight: 700 }}>{pct(g.amount)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RevenueStreamsCard({ cats, title = 'Revenue Streams' }) {
  const groups = useMemo(
    () => groupSum(cats, (r) => r.category, ['net_sales', 'item_count']).sort((a, b) => b.net_sales - a.net_sales),
    [cats],
  )
  const max = Math.max(1, ...groups.map((g) => g.net_sales))
  const total = groups.reduce((s, g) => s + g.net_sales, 0)
  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>Net sales by category</div>
      {groups.length === 0 ? (
        <div style={{ color: colors.muted3, fontSize: 12 }}>No data in range</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {groups.slice(0, 6).map((g, i) => (
            <div key={g.key} data-tip={`${g.key} · ${fmtK(g.net_sales)} · ${total ? Math.round((g.net_sales / total) * 100) : 0}% of revenue`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span>{g.key}</span>
                <span style={{ fontWeight: 700 }}>
                  {fmtK(g.net_sales)} · {total ? Math.round((g.net_sales / total) * 100) : 0}%
                </span>
              </div>
              <div style={{ height: 8, background: colors.pageBg, borderRadius: 4 }}>
                <div style={{ width: `${(g.net_sales / max) * 100}%`, height: '100%', background: STREAM_COLORS[i % STREAM_COLORS.length], borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TopList({ title, rows, mode, rankColor }) {
  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ color: colors.muted3, fontSize: 12 }}>No items in range</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {rows.map((r, i) => (
            <RankRow key={r.key} n={i + 1} rankColor={rankColor} name={r.item_name} val={mode === 'dollar' ? fmtMoney(r.net_sales) : `${fmtInt(r.quantity)} sold`} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function LocationReport() {
  const { loc } = useParams()
  const [locations, setLocations] = useState(null)
  const [mode, setMode] = useState('dollar') // top sellers toggle
  const [bottomMode, setBottomMode] = useState('dollar') // bottom sellers toggle
  const [empMode, setEmpMode] = useState('dollar') // top employees section toggle
  const hoverTip = useHoverTip()

  useEffect(() => {
    fetchLocations().then(setLocations).catch(() => setLocations([]))
  }, [])

  const location = locations?.find((l) => l.code.toLowerCase() === (loc || '').toLowerCase())
  const data = useDashboardData(locations === null ? undefined : location?.id ?? null)

  const totals = useMemo(() => (data.cur ? sumDaily(data.cur) : null), [data.cur])
  const prevTotals = useMemo(() => (data.prev ? sumDaily(data.prev) : null), [data.prev])

  const itemsByCat = useMemo(() => {
    if (!data.items) return {}
    const grouped = groupSum(data.items, (r) => r.item_key, ['net_sales', 'quantity'], (r) => ({ item_name: r.item_name, category: r.category }))
    const byCat = {}
    for (const g of grouped) {
      const c = g.category || 'Uncategorized'
      ;(byCat[c] = byCat[c] || []).push(g)
    }
    for (const c of Object.keys(byCat)) {
      byCat[c].sort((a, b) => (mode === 'dollar' ? b.net_sales - a.net_sales : b.quantity - a.quantity))
    }
    return byCat
  }, [data.items, mode])

  const bottomList = (cat) =>
    [...(itemsByCat[cat] ?? [])]
      .sort((a, b) => (bottomMode === 'dollar' ? a.net_sales - b.net_sales : a.quantity - b.quantity))
      .slice(0, 5)

  const employees = useMemo(() => rollupEmployees(data.serverCats), [data.serverCats])

  const roleRanking = (roleCard) =>
    employees
      .filter((e) => e.role === roleCard.key)
      .sort((a, b) => (empMode === 'dollar' ? b.total - a.total : roleCard.qtyOf(b) - roleCard.qtyOf(a)))
      .slice(0, 5)

  const overallLeaders = useMemo(
    () =>
      LEADER_DEFS.map((def) => {
        const metric = (e) =>
          Object.entries(e.cats).reduce((s, [c, v]) => (def.re.test(c) ? s + (empMode === 'dollar' ? v.net : v.qty) : s), 0)
        const best = employees.reduce((top, e) => (metric(e) > metric(top ?? { cats: {} }) ? e : top), null)
        if (!best || metric(best) <= 0) return null
        return {
          label: def.label,
          name: best.name,
          role: ROLE_TAGS[best.role],
          val: empMode === 'dollar' ? fmtMoney(metric(best)) : `${fmtInt(metric(best))} ${def.unit}`,
        }
      }).filter(Boolean),
    [employees, empMode],
  )

  const cb = useMemo(() => {
    const by = { won: { amt: '$0', note: '0 recovered' }, in_progress: { amt: '$0', note: '0 at stake' }, lost: { amt: '$0', note: '0 forfeited' } }
    for (const r of data.chargebacks ?? []) {
      const noteWord = r.stage === 'won' ? 'recovered' : r.stage === 'lost' ? 'forfeited' : 'at stake'
      by[r.stage] = { amt: fmtMoney(Number(r.total)), note: `${r.cnt} ${noteWord}` }
    }
    return by
  }, [data.chargebacks])

  if (locations !== null && !location) {
    return (
      <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
        <AppHeader active="locations" />
        <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '48px 26px', color: colors.muted2 }}>
          Unknown location "{loc}". <Link to="/locations" style={{ color: colors.brand, fontWeight: 700 }}>← Back to Locations</Link>
        </div>
      </div>
    )
  }

  const t = totals
  const targets = data.targets ?? {}
  const voidStatus = t?.voidPct == null ? 'neutral' : t.voidPct < (targets.void_pct ?? 1) ? 'good' : 'bad'
  const discStatus = t?.discountPct == null ? 'neutral' : t.discountPct < (targets.discount_pct ?? 3) ? 'good' : 'bad'
  const hasData = (data.cur?.length ?? 0) > 0

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }} {...hoverTip.bind}>
      {hoverTip.tip}
      <AppHeader active="locations" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <Crumbs
          items={[
            { label: 'Company', to: '/' },
            { label: 'By Location', to: '/locations' },
            { label: location?.name ?? '…' },
          ]}
        />
        <PageTitle
          title={location?.name ?? '…'}
          meta={
            <>
              {(CITY_LABELS[location?.city] || location?.city || '') + ' · '}
              <span style={{ color: colors.muted2 }}>{dataThrough(data.cur)} · Toast + recon sheet</span>
            </>
          }
          right={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <DateRangePicker />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 10, overflowX: 'auto', maxWidth: '100%' }}>
                  {(locations ?? []).map((l) =>
                    l.status === 'active' ? (
                      <Link
                        key={l.id}
                        to={`/locations/${l.code.toLowerCase()}`}
                        style={{
                          padding: '7px 13px',
                          borderRadius: 7,
                          background: l.id === location?.id ? colors.brand : 'transparent',
                          color: l.id === location?.id ? '#fff' : colors.muted1,
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {l.name}
                      </Link>
                    ) : (
                      <div key={l.id} style={{ padding: '7px 13px', borderRadius: 7, color: colors.muted4, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {l.name} · soon
                      </div>
                    ),
                  )}
                </div>
                <Link to="/detail-drill" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', background: colors.brand, color: '#fff', borderRadius: 9, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  View Detail Drill →
                </Link>
              </div>
            </div>
          }
        />
        {data.loading && (
          <div style={{ padding: '40px 0', color: colors.muted3, fontSize: 13 }}>Loading live data…</div>
        )}
        {data.error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            Couldn't load data: {data.error}
          </div>
        )}
        {!data.loading && !data.error && !hasData && (
          <div style={{ padding: 14, background: colors.panelGray, borderRadius: 9, color: colors.muted2, fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            No data for this location in the selected range — Toast import begins with the earliest backfilled day.
          </div>
        )}

        {!data.loading && !data.error && (
          <>
            {/* ===== HEADLINE STRIP ===== */}
            <StatRow
              style={{ marginBottom: 28 }}
              items={[
                statItem('Net Sales', t?.net, prevTotals?.net, fmtMoney),
                statItem('Covers', t?.covers, prevTotals?.covers, fmtInt),
                statItem('Avg Check', t?.avgCheck, prevTotals?.avgCheck, fmtMoneyC),
                statItem('Gross Sales', t?.gross, prevTotals?.gross, fmtMoney),
              ]}
            />

            {/* ===== MONEY IN ===== */}
            <SectionHeader title="Money In" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16, marginBottom: 30 }}>
              <DailySalesCard rows={data.cur ?? []} />
              <PaymentMixCard pays={data.pays ?? []} />
              <RevenueStreamsCard cats={data.cats ?? []} />
            </div>

            {/* ===== MONEY SAVED ===== */}
            <SectionHeader title="Money Saved" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginBottom: 30 }}>
              <KpiTile label="Food Cost %" value={fmtPct(t?.foodPct)} sub={t?.foodPct == null ? 'Awaiting invoice intake' : `${fmtMoney(t.food_cost)} cost · Target < ${targets.food_pct ?? 30}%`} status={t?.foodPct == null ? 'neutral' : t.foodPct < (targets.food_pct ?? 30) ? 'good' : 'bad'} subTop={5} />
              <KpiTile label="Labor %" value={fmtPct(t?.laborPct)} sub={t?.laborPct == null ? 'Labor source deferred' : `${fmtMoney(t.labor_cost)} cost · Target < ${targets.labor_pct ?? 28}%`} status={t?.laborPct == null ? 'neutral' : t.laborPct < (targets.labor_pct ?? 28) ? 'good' : 'bad'} subTop={5} />
              <KpiTile label="Liquor Cost %" value={fmtPct(t?.liquorPct)} sub={t?.liquorPct == null ? 'Awaiting invoice intake' : `Target < ${targets.liquor_pct ?? 24}%`} status={t?.liquorPct == null ? 'neutral' : t.liquorPct < (targets.liquor_pct ?? 24) ? 'good' : 'bad'} subTop={5} />
              <KpiTile label="Total Expenses" value={t?.expenses ? fmtMoney(t.expenses) : '—'} sub="Awaiting invoice intake" />
            </div>

            {/* ===== MONEY PROTECTED ===== */}
            <SectionHeader title="Money Protected" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gridAutoRows: '1fr', gap: 16 }}>
              <KpiTile
                label="Void % of Sales"
                value={fmtPct(t?.voidPct)}
                status={voidStatus}
                size={30}
                padding={18}
                to={`/void-discount?tab=void&loc=${(location?.code ?? '').toLowerCase()}`}
                sub={
                  t?.voidPct == null ? 'No sales in range' : (
                    <>
                      {fmtMoney(t.voids)} · Target &lt; {targets.void_pct ?? 1}% · <DetailsTail />
                    </>
                  )
                }
              />
              <DayBarsCard title="Voids by Day" bars={weekdayBars(data.cur ?? [], 'voids_amount', 'voided')} color={colors.muted3} labels={DAY_LABELS} />
              <ChargebacksCard won={cb.won} inProgress={cb.in_progress} lost={cb.lost} />
              <KpiTile
                label="Discount % of Sales"
                value={fmtPct(t?.discountPct)}
                status={discStatus}
                size={30}
                padding={18}
                to={`/void-discount?tab=discount&loc=${(location?.code ?? '').toLowerCase()}`}
                sub={
                  t?.discountPct == null ? 'No sales in range' : (
                    <>
                      {fmtMoney(t.discounts)} · Target &lt; {targets.discount_pct ?? 3}% · <DetailsTail />
                    </>
                  )
                }
              />
              <DayBarsCard title="Discounts by Day" bars={weekdayBars(data.cur ?? [], 'discounts_amount', 'discounted')} color={colors.brandTint1} labels={DAY_LABELS} />
              <ExceptionTile count={data.exceptionCount ?? 0} to={`/exceptions?loc=${(location?.code ?? '').toLowerCase()}`} />
            </div>

            {/* ===== TOP SELLERS ===== */}
            <SectionHeader title="Top Sellers" sub={location?.name} style={{ margin: '30px 0 14px' }} right={<ModeToggle mode={mode} onChange={setMode} />} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
              <TopList title="Top Food" rows={(itemsByCat['Food'] ?? []).slice(0, 5)} mode={mode} />
              <TopList title="Top Liquor" rows={(itemsByCat['Liquor'] ?? []).slice(0, 5)} mode={mode} />
              <TopList title="Top Hookah" rows={(itemsByCat['Hookah'] ?? []).slice(0, 5)} mode={mode} />
              <RevenueStreamsCard cats={data.cats ?? []} title="Category Performance" />
            </div>

            {/* ===== BOTTOM SELLERS ===== */}
            <SectionHeader
              title="Bottom Sellers"
              sub={`${location?.name ?? ''} · lowest movers first`}
              style={{ margin: '30px 0 14px' }}
              right={<ModeToggle mode={bottomMode} onChange={setBottomMode} labels={['Bottom by $', 'Bottom by Qty']} />}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <TopList title="Bottom Food" rows={bottomList('Food')} mode={bottomMode} rankColor={colors.muted3} />
              <TopList title="Bottom Liquor" rows={bottomList('Liquor')} mode={bottomMode} rankColor={colors.muted3} />
              <TopList title="Bottom Hookah Flavor" rows={bottomList('Hookah')} mode={bottomMode} rankColor={colors.muted3} />
            </div>

            {/* ===== TOP EMPLOYEES ===== */}
            <SectionHeader title="Top Employees" sub={location?.name} style={{ margin: '30px 0 14px' }} right={<ModeToggle mode={empMode} onChange={setEmpMode} />} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
              {ROLE_CARDS.map((rc) => {
                const ranked = roleRanking(rc)
                return (
                  <div key={rc.key} style={{ ...card, padding: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{rc.title}</div>
                    {ranked.length === 0 ? (
                      <div style={{ color: colors.muted3, fontSize: 12 }}>No {rc.key === 'servers' ? 'employee' : rc.title.toLowerCase()} sales in range</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                        {ranked.map((e, i) => (
                          <RankRow
                            key={e.guid}
                            n={i + 1}
                            name={e.name}
                            val={empMode === 'dollar' ? fmtMoney(e.total) : `${fmtInt(rc.qtyOf(e))} ${rc.unit}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ background: colors.brand, borderRadius: 13, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 13 }}>Overall</div>
                {overallLeaders.length === 0 ? (
                  <div style={{ color: colors.brandTint3, fontSize: 12 }}>No employee sales in range</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                    {overallLeaders.map((o) => (
                      <div key={o.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.brandTint3, fontWeight: 700 }}>
                          {o.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ flex: 1, fontSize: 13, color: '#fff', fontWeight: 600 }}>
                            {o.name} <span style={{ color: colors.brandTint3, fontSize: 10, fontWeight: 500 }}>· {o.role}</span>
                          </span>
                          <span className="tnum" style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{o.val}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
