import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import PageTitle, { dataThrough } from '../components/PageTitle.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import { card, StatRow, DeltaChip, KpiTile, Within, DetailsTail, RankRow, DayBarsCard, DAY_LABELS, weekdayBars, DonutRing, ChargebacksCard, ExceptionTile, ModeToggle } from '../components/cards.jsx'
import { useHoverTip } from '../components/HoverTip.jsx'
import { colors, fonts, layout } from '../theme.js'
import { fetchLocations, sumDaily, groupSum } from '../data/live.js'
import { useDashboardData } from '../data/useDashboardData.js'
import { fmtMoney, fmtMoneyC, fmtK, fmtPct, fmtInt, deltaPct, fmtDelta } from '../lib/format.js'
import { fromStr, fmtRange } from '../lib/dates.js'

/* Live Level 1 — org rollup across every location the signed-in user can
   see. Percentages recompute from summed dollars across locations (never
   averaged). Venues without data yet simply contribute nothing and appear
   as awaiting-data rows in the comparison table. */

const LOC_COLORS = [colors.brand, colors.brandTint1, colors.brandTint3, colors.brandTint4]
const STREAM_COLORS = [colors.brand, colors.brandTint1, colors.brandTint2, colors.brandTint3, colors.brandTint4, colors.brandTint5]

/** Short venue label for chart tooltips: "Teranga ATL" → "ATL". */
const shortName = (name) => (name || '').replace(/^Teranga\s+/, '')

/** Joined-row headline item with a delta chip vs the comparison window. */
function statItem(label, cur, prev, fmt) {
  const d = deltaPct(cur, prev)
  return { label, value: fmt(cur), sub: <DeltaChip delta={fmtDelta(d)} up={d == null ? true : d >= 0} /> }
}

/** Grouped daily (or weekly) bars, one series per location. */
function DailyByLocationCard({ rows, locations }) {
  const { buckets, series } = useMemo(() => {
    const withData = locations.filter((l) => rows.some((r) => r.location_id === l.id))
    const keys = [...new Set(rows.map((r) => r.business_date))].sort()
    const weekly = keys.length > 31
    const bucketOf = (dstr) => {
      if (!weekly) return dstr
      const dt = fromStr(dstr)
      const monday = new Date(dt)
      monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
      return monday.toISOString().slice(0, 10)
    }
    const bmap = new Map()
    for (const r of rows) {
      const b = bucketOf(r.business_date)
      if (!bmap.has(b)) bmap.set(b, new Map())
      const m = bmap.get(b)
      m.set(r.location_id, (m.get(r.location_id) || 0) + Number(r.net_sales))
    }
    const buckets = [...bmap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, m]) => {
      const dt = fromStr(k)
      return {
        key: k,
        label: weekly ? k.slice(5).replace('-', '/') : String(dt.getDate()),
        tipDay: weekly
          ? `wk ${k.slice(5).replace('-', '/')}`
          : keys.length <= 14
            ? DAY_LABELS[(dt.getDay() + 6) % 7]
            : `${dt.getMonth() + 1}/${dt.getDate()}`,
        values: withData.map((l) => m.get(l.id) || 0),
      }
    })
    return { buckets, series: withData }
  }, [rows, locations])

  const max = Math.max(1, ...buckets.flatMap((b) => b.values))
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Daily Sales by Location</div>
        <div style={{ fontSize: 11, color: colors.muted3 }}>Net sales</div>
      </div>
      <div style={{ display: 'flex', gap: 14, margin: '11px 0 16px' }}>
        {series.map((l, i) => (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.muted2 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: LOC_COLORS[i % LOC_COLORS.length] }} />
            {l.name}
          </div>
        ))}
      </div>
      {buckets.length === 0 ? (
        <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.muted3, fontSize: 12 }}>
          No data in this range
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4, height: 150 }}>
          {buckets.map((b) => (
            <div key={b.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 124 }}>
                {b.values.map((v, i) => (
                  <div key={i} data-tip={`${shortName(series[i].name)} · ${b.tipDay} · ${fmtK(v)}`} style={{ width: Math.max(4, 12 - series.length * 2), height: Math.max(2, (v / max) * 124), background: LOC_COLORS[i % LOC_COLORS.length], borderRadius: '2px 2px 0 0' }} />
                ))}
              </div>
              <div style={{ fontSize: 9, color: colors.muted3, whiteSpace: 'nowrap' }}>{b.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RevenueMixCard({ rows, locations, totalNet }) {
  const shares = useMemo(() => {
    const withData = locations
      .map((l, i) => ({ ...l, net: rows.filter((r) => r.location_id === l.id).reduce((s, r) => s + Number(r.net_sales), 0) }))
      .filter((l) => l.net > 0)
    return withData
  }, [rows, locations])
  const total = shares.reduce((s, l) => s + l.net, 0)
  const pct = (net) => (total ? Math.round((net / total) * 100) : 0)
  const tipFor = (l) => `${l.name} · ${fmtMoney(l.net)} · ${pct(l.net)}%`
  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue Mix</div>
      <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>Share by location</div>
      {shares.length === 0 ? (
        <div style={{ color: colors.muted3, fontSize: 12 }}>No data in range</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <DonutRing
            segments={shares.map((l, i) => ({ value: l.net, color: LOC_COLORS[i % LOC_COLORS.length], tip: tipFor(l) }))}
            center={
              <>
                <div style={{ fontFamily: fonts.serif, fontSize: 14, fontWeight: 600, lineHeight: 1 }}>{fmtK(totalNet)}</div>
                <div style={{ fontSize: 9, color: colors.muted3, marginTop: 2 }}>net</div>
              </>
            }
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shares.map((l, i) => (
              <div key={l.id} data-tip={tipFor(l)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: LOC_COLORS[i % LOC_COLORS.length] }} />
                  {l.name}
                </span>
                <span style={{ fontWeight: 700 }}>{pct(l.net)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StreamsByLocationCard({ cats, locations }) {
  const { rowsByLoc, topCats } = useMemo(() => {
    const catTotals = groupSum(cats, (r) => r.category, ['net_sales']).sort((a, b) => b.net_sales - a.net_sales)
    const topCats = catTotals.slice(0, 4).map((c) => c.key)
    const rowsByLoc = locations
      .map((l) => {
        const mine = cats.filter((r) => r.location_id === l.id)
        const total = mine.reduce((s, r) => s + Number(r.net_sales), 0)
        if (total <= 0) return null
        const parts = topCats.map((c) => mine.filter((r) => r.category === c).reduce((s, r) => s + Number(r.net_sales), 0))
        const other = Math.max(0, total - parts.reduce((s, v) => s + v, 0))
        const segs = [...parts, other].map((v, i) => ({
          cat: i < topCats.length ? topCats[i] : 'Other',
          val: v,
          w: (v / total) * 100,
        }))
        return { name: l.name, segs }
      })
      .filter(Boolean)
    return { rowsByLoc, topCats }
  }, [cats, locations])

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue Streams</div>
      <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>{topCats.join(' · ') || 'By category'}</div>
      {rowsByLoc.length === 0 ? (
        <div style={{ color: colors.muted3, fontSize: 12 }}>No data in range</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rowsByLoc.map((l) => (
            <div key={l.name}>
              <div style={{ fontSize: 11, color: colors.muted2, marginBottom: 5 }}>{l.name}</div>
              <div style={{ display: 'flex', height: 16, borderRadius: 4, overflow: 'hidden' }}>
                {l.segs.map((s, i) =>
                  s.w > 0 ? (
                    <div
                      key={i}
                      data-tip={`${shortName(l.name)} · ${s.cat} · ${Math.round(s.w)}% (${fmtK(s.val)})`}
                      style={{ width: `${s.w}%`, background: STREAM_COLORS[i % STREAM_COLORS.length] }}
                    />
                  ) : null,
                )}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
            {[...topCats, 'Other'].map((c, i) => (
              <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: colors.muted2 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: STREAM_COLORS[i % STREAM_COLORS.length] }} />
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompanyGlance() {
  const [locations, setLocations] = useState(null)
  const [mode, setMode] = useState('dollar')
  const [bottomMode, setBottomMode] = useState('dollar')
  const hoverTip = useHoverTip()

  useEffect(() => {
    fetchLocations().then(setLocations).catch(() => setLocations([]))
  }, [])

  const data = useDashboardData(locations === null ? undefined : null)
  const t = useMemo(() => (data.cur ? sumDaily(data.cur) : null), [data.cur])
  const prev = useMemo(() => (data.prev ? sumDaily(data.prev) : null), [data.prev])
  const active = (locations ?? []).filter((l) => l.status === 'active')

  const itemsByCat = useMemo(() => {
    if (!data.items) return {}
    const grouped = groupSum(data.items, (r) => r.item_key, ['net_sales', 'quantity'], (r) => ({ item_name: r.item_name, category: r.category }))
    const byCat = {}
    for (const g of grouped) (byCat[g.category || 'Uncategorized'] = byCat[g.category || 'Uncategorized'] || []).push(g)
    for (const c of Object.keys(byCat)) byCat[c].sort((a, b) => (mode === 'dollar' ? b.net_sales - a.net_sales : b.quantity - a.quantity))
    return byCat
  }, [data.items, mode])

  const catPerf = useMemo(() => {
    if (!data.cats) return { list: [], total: 0 }
    const all = groupSum(data.cats, (r) => r.category, ['net_sales']).sort((a, b) => b.net_sales - a.net_sales)
    return { list: all.slice(0, 5), total: all.reduce((s, g) => s + g.net_sales, 0) }
  }, [data.cats])

  const cb = useMemo(() => {
    const by = { won: { amt: '$0', note: '0 recovered' }, in_progress: { amt: '$0', note: '0 at stake' }, lost: { amt: '$0', note: '0 forfeited' } }
    for (const r of data.chargebacks ?? []) {
      const w = r.stage === 'won' ? 'recovered' : r.stage === 'lost' ? 'forfeited' : 'at stake'
      by[r.stage] = { amt: fmtMoney(Number(r.total)), note: `${r.cnt} ${w}` }
    }
    return by
  }, [data.chargebacks])

  const targets = data.targets ?? {}
  const voidStatus = t?.voidPct == null ? 'neutral' : t.voidPct < (targets.void_pct ?? 1) ? 'good' : 'bad'
  const discStatus = t?.discountPct == null ? 'neutral' : t.discountPct < (targets.discount_pct ?? 3) ? 'good' : 'bad'

  const topList = (cat) => (itemsByCat[cat] ?? []).slice(0, 5)
  const bottomList = (cat) =>
    [...(itemsByCat[cat] ?? [])]
      .sort((a, b) => (bottomMode === 'dollar' ? a.net_sales - b.net_sales : a.quantity - b.quantity))
      .slice(0, 5)

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }} {...hoverTip.bind}>
      {hoverTip.tip}
      <AppHeader active="company" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <PageTitle
          title="Company Overview"
          meta={<>All locations · <span style={{ color: colors.muted2 }}>{dataThrough(data.cur)} · Toast</span></>}
          right={<DateRangePicker />}
        />
        {data.loading && <div style={{ padding: '40px 0', color: colors.muted3, fontSize: 13 }}>Loading live data…</div>}
        {data.error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            Couldn't load data: {data.error}
          </div>
        )}

        {!data.loading && !data.error && (
          <>
            {/* ===== HEADLINE STRIP ===== */}
            <StatRow
              style={{ marginBottom: 28 }}
              items={[
                statItem('Total Net Sales', t?.net, prev?.net, fmtMoney),
                statItem('Total Covers', t?.covers, prev?.covers, fmtInt),
                statItem('Avg Check Size', t?.avgCheck, prev?.avgCheck, fmtMoneyC),
                statItem('Gross Sales', t?.gross, prev?.gross, fmtMoney),
              ]}
            />

            {/* ===== MONEY IN ===== */}
            <SectionHeader title="Money In" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16, marginBottom: 30 }}>
              <DailyByLocationCard rows={data.cur ?? []} locations={active} />
              <RevenueMixCard rows={data.cur ?? []} locations={active} totalNet={t?.net ?? 0} />
              <StreamsByLocationCard cats={data.cats ?? []} locations={active} />
            </div>

            {/* ===== MONEY SAVED ===== */}
            <SectionHeader title="Money Saved" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginBottom: 30 }}>
              <KpiTile label="Food Cost %" value={fmtPct(t?.foodPct)} sub={t?.foodPct == null ? 'Awaiting invoice intake' : `Target < ${targets.food_pct ?? 30}%`} status={t?.foodPct == null ? 'neutral' : t.foodPct < (targets.food_pct ?? 30) ? 'good' : 'bad'} subTop={5} />
              <KpiTile label="Labor Cost %" value={fmtPct(t?.laborPct)} sub={t?.laborPct == null ? 'Labor source deferred' : `Target < ${targets.labor_pct ?? 28}%`} status={t?.laborPct == null ? 'neutral' : t.laborPct < (targets.labor_pct ?? 28) ? 'good' : 'bad'} subTop={5} />
              <KpiTile label="Liquor Cost %" value={fmtPct(t?.liquorPct)} sub={t?.liquorPct == null ? 'Awaiting invoice intake' : `Target < ${targets.liquor_pct ?? 24}%`} status={t?.liquorPct == null ? 'neutral' : t.liquorPct < (targets.liquor_pct ?? 24) ? 'good' : 'bad'} subTop={5} />
              <KpiTile label="Total Expenses" value={t?.expenses ? fmtMoney(t.expenses) : '—'} sub="Awaiting invoice intake" />
            </div>

            {/* ===== MONEY PROTECTED ===== */}
            <SectionHeader title="Money Protected" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gridAutoRows: '1fr', gap: 16, marginBottom: 30 }}>
              <KpiTile label="Void % of Sales" value={fmtPct(t?.voidPct)} status={voidStatus} size={30} padding={18} to="/void-discount?tab=void"
                sub={t?.voidPct == null ? 'No sales in range' : (<>Target &lt; {targets.void_pct ?? 1}% · {voidStatus === 'good' ? <Within /> : <span style={{ fontWeight: 600 }}>over</span>} · <DetailsTail /></>)} />
              <DayBarsCard title="Voids by Day" bars={weekdayBars(data.cur ?? [], 'voids_amount', 'voided', colors.redBright)} color={colors.muted3} labels={DAY_LABELS} />
              <ChargebacksCard won={cb.won} inProgress={cb.in_progress} lost={cb.lost} />
              <KpiTile label="Discount % of Sales" value={fmtPct(t?.discountPct)} status={discStatus} size={30} padding={18} to="/void-discount?tab=discount"
                sub={t?.discountPct == null ? 'No sales in range' : (<>Target &lt; {targets.discount_pct ?? 3}% · {discStatus === 'good' ? <Within /> : <span style={{ fontWeight: 600 }}>over</span>} · <DetailsTail /></>)} />
              <DayBarsCard title="Discounts by Day" bars={weekdayBars(data.cur ?? [], 'discounts_amount', 'discounted')} color={colors.brandTint1} labels={DAY_LABELS} />
              <ExceptionTile count={data.exceptionCount ?? 0} to="/exceptions" />
            </div>

            {/* ===== TOP SELLERS ===== */}
            <SectionHeader title="Top Sellers" sub="org-wide" right={<ModeToggle mode={mode} onChange={setMode} />} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginBottom: 30 }}>
              {['Food', 'Liquor', 'Hookah'].map((c) => (
                <div key={c} style={{ ...card, padding: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Top {c}</div>
                  {topList(c).length === 0 ? (
                    <div style={{ color: colors.muted3, fontSize: 12 }}>No items in range</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                      {topList(c).map((r, i) => (
                        <RankRow key={r.key} n={i + 1} name={r.item_name} val={mode === 'dollar' ? fmtMoney(r.net_sales) : `${fmtInt(r.quantity)} sold`} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ ...card, padding: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Category Performance</div>
                {catPerf.list.length === 0 ? (
                  <div style={{ color: colors.muted3, fontSize: 12 }}>No data in range</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {catPerf.list.map((g, i) => (
                      <div key={g.key} data-tip={`${g.key} · ${fmtK(g.net_sales)} · ${catPerf.total ? Math.round((g.net_sales / catPerf.total) * 100) : 0}% of revenue`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span>{g.key}</span>
                          <span style={{ fontWeight: 700 }}>{fmtK(g.net_sales)}</span>
                        </div>
                        <div style={{ height: 8, background: colors.pageBg, borderRadius: 4 }}>
                          <div style={{ width: `${(g.net_sales / Math.max(1, catPerf.list[0].net_sales)) * 100}%`, height: '100%', background: STREAM_COLORS[i % STREAM_COLORS.length], borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ===== BOTTOM SELLERS ===== */}
            <SectionHeader
              title="Bottom Sellers"
              sub="org-wide · lowest movers first"
              right={<ModeToggle mode={bottomMode} onChange={setBottomMode} labels={['Bottom by $', 'Bottom by Qty']} />}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 30 }}>
              {[['Bottom Food', 'Food'], ['Bottom Liquor', 'Liquor'], ['Bottom Hookah Flavor', 'Hookah']].map(([title, c]) => (
                <div key={c} style={{ ...card, padding: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{title}</div>
                  {bottomList(c).length === 0 ? (
                    <div style={{ color: colors.muted3, fontSize: 12 }}>No items in range</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                      {bottomList(c).map((r, i) => (
                        <RankRow key={r.key} n={i + 1} rankColor={colors.muted3} name={r.item_name} val={bottomMode === 'dollar' ? fmtMoney(r.net_sales) : `${fmtInt(r.quantity)} sold`} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ===== LOCATION COMPARISON ===== */}
            <SectionHeader title="Location Comparison" />
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '12px 18px', fontWeight: 600 }}>Location</th>
                    {['Net Sales', 'Gross', 'Covers', 'Avg Check', 'Voids', 'Discounts', 'Food %', 'Labor %', 'Liquor %'].map((h, i, arr) => (
                      <th key={h} style={{ padding: i === arr.length - 1 ? '12px 18px' : 12, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((l) => {
                    const mine = sumDaily((data.cur ?? []).filter((r) => r.location_id === l.id))
                    const has = mine.days > 0
                    const voidBad = mine.voidPct != null && mine.voidPct >= (targets.void_pct ?? 1)
                    const discBad = mine.discountPct != null && mine.discountPct >= (targets.discount_pct ?? 3)
                    const liqBad = mine.liquorPct != null && mine.liquorPct >= (targets.liquor_pct ?? 24)
                    const pctCell = (v, bad) => ({
                      padding: '13px 12px',
                      color: v == null ? colors.muted3 : bad ? colors.red : colors.greenDark,
                      background: v == null ? 'transparent' : bad ? colors.redBg : colors.greenBg,
                      fontWeight: v == null ? 400 : 700,
                    })
                    return (
                      <tr key={l.id} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 700 }}>
                          {l.name}
                          {!has && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: colors.muted2, background: '#E7EAEF', padding: '2px 8px', borderRadius: 10 }}>awaiting data</span>}
                        </td>
                        <td style={{ padding: '13px 12px' }}>{has ? fmtMoney(mine.net) : '—'}</td>
                        <td style={{ padding: '13px 12px' }}>{has ? fmtMoney(mine.gross) : '—'}</td>
                        <td style={{ padding: '13px 12px' }}>{has ? fmtInt(mine.covers) : '—'}</td>
                        <td style={{ padding: '13px 12px' }}>{has ? fmtMoneyC(mine.avgCheck) : '—'}</td>
                        <td style={pctCell(has ? mine.voidPct : null, voidBad)}>{has ? fmtPct(mine.voidPct) : '—'}</td>
                        <td style={pctCell(has ? mine.discountPct : null, discBad)}>{has ? fmtPct(mine.discountPct) : '—'}</td>
                        <td style={{ padding: '13px 12px', color: colors.muted3 }}>{fmtPct(mine.foodPct)}</td>
                        <td style={{ padding: '13px 12px', color: colors.muted3 }}>{fmtPct(mine.laborPct)}</td>
                        <td style={{ ...pctCell(has ? mine.liquorPct : null, liqBad), padding: '13px 18px' }}>{fmtPct(mine.liquorPct)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
