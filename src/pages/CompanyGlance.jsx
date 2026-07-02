import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, StatTile, KpiTile, Within, RankRow, DayBarsCard, ChargebacksCard, ExceptionTile, ModeToggle } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { fetchLocations, sumDaily, groupSum } from '../data/live.js'
import { useDashboardData } from '../data/useDashboardData.js'
import { fmtMoney, fmtMoneyC, fmtK, fmtPct, fmtInt, deltaPct, fmtDelta } from '../lib/format.js'
import { fromStr } from '../lib/dates.js'

/* Live Level 1 — org rollup across every location the signed-in user can
   see. Percentages recompute from summed dollars across locations (never
   averaged). Venues without data yet simply contribute nothing and appear
   as awaiting-data rows in the comparison table. */

const LOC_COLORS = [colors.brand, colors.brandTint1, colors.brandTint3, colors.brandTint4]
const STREAM_COLORS = [colors.brand, colors.brandTint1, colors.brandTint2, colors.brandTint3, colors.brandTint4, colors.brandTint5]

function HeadTile({ label, cur, prev, fmt }) {
  const d = deltaPct(cur, prev)
  return <StatTile label={label} value={fmt(cur)} delta={fmtDelta(d)} up={d == null ? true : d >= 0} note="vs prior period" />
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
    const buckets = [...bmap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, m]) => ({
      key: k,
      label: weekly ? k.slice(5).replace('-', '/') : String(fromStr(k).getDate()),
      values: withData.map((l) => m.get(l.id) || 0),
    }))
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
            <div key={b.key} title={`${b.key}: ${fmtMoney(b.values.reduce((s, v) => s + v, 0))}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 124 }}>
                {b.values.map((v, i) => (
                  <div key={i} style={{ width: Math.max(4, 12 - series.length * 2), height: Math.max(2, (v / max) * 124), background: LOC_COLORS[i % LOC_COLORS.length], borderRadius: '2px 2px 0 0' }} />
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
  let acc = 0
  const segs = shares.map((l, i) => {
    const from = (acc / Math.max(1, total)) * 100
    acc += l.net
    return `${LOC_COLORS[i % LOC_COLORS.length]} ${from}% ${(acc / Math.max(1, total)) * 100}%`
  })
  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Revenue Mix</div>
      <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>Share by location</div>
      {shares.length === 0 ? (
        <div style={{ color: colors.muted3, fontSize: 12 }}>No data in range</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 108, height: 108, borderRadius: '50%', background: `conic-gradient(${segs.join(', ')})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 62, height: 62, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: fonts.serif, fontSize: 15, fontWeight: 600 }}>{fmtK(totalNet)}</div>
              <div style={{ fontSize: 9, color: colors.muted3 }}>net</div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shares.map((l, i) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: LOC_COLORS[i % LOC_COLORS.length] }} />
                  {l.name}
                </span>
                <span style={{ fontWeight: 700 }}>{total ? Math.round((l.net / total) * 100) : 0}%</span>
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
        const other = total - parts.reduce((s, v) => s + v, 0)
        return { name: l.name, widths: [...parts, Math.max(0, other)].map((v) => (v / total) * 100) }
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
                {l.widths.map((w, i) => (
                  <div key={i} style={{ width: `${w}%`, background: STREAM_COLORS[i % STREAM_COLORS.length] }} />
                ))}
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

function dayHeights(rows, field) {
  const byDate = new Map()
  for (const r of rows) byDate.set(r.business_date, (byDate.get(r.business_date) || 0) + Number(r[field] || 0))
  const days = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
  const max = Math.max(1, ...days.map(([, v]) => v))
  return days.map(([, v]) => Math.max(4, (v / max) * 100))
}

export default function CompanyGlance() {
  const [locations, setLocations] = useState(null)
  const [mode, setMode] = useState('dollar')

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
    if (!data.cats) return []
    return groupSum(data.cats, (r) => r.category, ['net_sales']).sort((a, b) => b.net_sales - a.net_sales).slice(0, 5)
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

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="company" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '28px 26px 48px' }}>
        {data.loading && <div style={{ padding: '40px 0', color: colors.muted3, fontSize: 13 }}>Loading live data…</div>}
        {data.error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
            Couldn't load data: {data.error}
          </div>
        )}

        {!data.loading && !data.error && (
          <>
            {/* ===== HEADLINE STRIP ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 30 }}>
              <HeadTile label="Total Net Sales" cur={t?.net} prev={prev?.net} fmt={fmtMoney} />
              <HeadTile label="Total Covers" cur={t?.covers} prev={prev?.covers} fmt={fmtInt} />
              <HeadTile label="Avg Check Size" cur={t?.avgCheck} prev={prev?.avgCheck} fmt={fmtMoneyC} />
              <HeadTile label="Gross Sales" cur={t?.gross} prev={prev?.gross} fmt={fmtMoney} />
            </div>

            {/* ===== MONEY IN ===== */}
            <SectionHeader title="Money In" />
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 16, marginBottom: 30 }}>
              <DailyByLocationCard rows={data.cur ?? []} locations={active} />
              <RevenueMixCard rows={data.cur ?? []} locations={active} totalNet={t?.net ?? 0} />
              <StreamsByLocationCard cats={data.cats ?? []} locations={active} />
            </div>

            {/* ===== MONEY SAVED ===== */}
            <SectionHeader title="Money Saved" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 30 }}>
              <KpiTile label="Food Cost %" value={fmtPct(t?.foodPct)} sub={t?.foodPct == null ? 'Awaiting invoice intake' : `Target < ${targets.food_pct ?? 30}%`} status={t?.foodPct == null ? 'neutral' : t.foodPct < (targets.food_pct ?? 30) ? 'good' : 'bad'} subTop={5} />
              <KpiTile label="Labor Cost %" value={fmtPct(t?.laborPct)} sub={t?.laborPct == null ? 'Labor source deferred' : `Target < ${targets.labor_pct ?? 28}%`} status={t?.laborPct == null ? 'neutral' : t.laborPct < (targets.labor_pct ?? 28) ? 'good' : 'bad'} subTop={5} />
              <KpiTile label="Liquor Cost %" value={fmtPct(t?.liquorPct)} sub={t?.liquorPct == null ? 'Awaiting invoice intake' : `Target < ${targets.liquor_pct ?? 24}%`} />
              <KpiTile label="Total Expenses" value={t?.expenses ? fmtMoney(t.expenses) : '—'} sub="Awaiting invoice intake" />
            </div>

            {/* ===== MONEY PROTECTED ===== */}
            <SectionHeader title="Money Protected" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gridAutoRows: '1fr', gap: 16, marginBottom: 30 }}>
              <KpiTile label="Void % of Sales" value={fmtPct(t?.voidPct)} status={voidStatus} size={30} padding={18}
                sub={t?.voidPct == null ? 'No sales in range' : (<>Target &lt; {targets.void_pct ?? 1}% · {voidStatus === 'good' ? <Within /> : <span style={{ fontWeight: 600 }}>over</span>}</>)} />
              <DayBarsCard title="Voids by Day" bars={dayHeights(data.cur ?? [], 'voids_amount')} color={colors.muted3} />
              <ChargebacksCard won={cb.won} inProgress={cb.in_progress} lost={cb.lost} />
              <KpiTile label="Discount % of Sales" value={fmtPct(t?.discountPct)} status={discStatus} size={30} padding={18}
                sub={t?.discountPct == null ? 'No sales in range' : (<>Target &lt; {targets.discount_pct ?? 3}% · {discStatus === 'good' ? <Within /> : <span style={{ fontWeight: 600 }}>over</span>}</>)} />
              <DayBarsCard title="Discounts by Day" bars={dayHeights(data.cur ?? [], 'discounts_amount')} color={colors.brandTint1} />
              <ExceptionTile count={data.exceptionCount ?? 0} to="/exceptions" />
            </div>

            {/* ===== TOP SELLERS ===== */}
            <SectionHeader title="Top Sellers" sub="org-wide" right={<ModeToggle mode={mode} onChange={setMode} />} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 30 }}>
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
                {catPerf.length === 0 ? (
                  <div style={{ color: colors.muted3, fontSize: 12 }}>No data in range</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {catPerf.map((g, i) => (
                      <div key={g.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span>{g.key}</span>
                          <span style={{ fontWeight: 700 }}>{fmtK(g.net_sales)}</span>
                        </div>
                        <div style={{ height: 8, background: colors.pageBg, borderRadius: 4 }}>
                          <div style={{ width: `${(g.net_sales / Math.max(1, catPerf[0].net_sales)) * 100}%`, height: '100%', background: STREAM_COLORS[i % STREAM_COLORS.length], borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                        <td style={{ padding: '13px 18px', color: colors.muted3 }}>{fmtPct(mine.liquorPct)}</td>
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
