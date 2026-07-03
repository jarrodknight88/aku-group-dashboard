import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle, { Crumbs } from '../components/PageTitle.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, RankRow, ModeToggle } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { fetchLocations, sumDaily, groupSum } from '../data/live.js'
import { useDashboardData } from '../data/useDashboardData.js'
import { useRange } from '../state/RangeContext.jsx'
import { fmtRange } from '../lib/dates.js'
import { fmtMoney, fmtMoneyC, fmtPct, fmtInt } from '../lib/format.js'

/* Live Level 3 — the "why" behind the numbers, for the selected range.
   Currently scoped to the first active location with data (ATL); grows a
   location switcher when more venues come online. Cost lines await the
   invoice intake. */

export default function DetailDrill() {
  const { range } = useRange()
  const [locations, setLocations] = useState(null)
  const [mode, setMode] = useState('dollar')

  useEffect(() => {
    fetchLocations().then(setLocations).catch(() => setLocations([]))
  }, [])

  const location = locations?.find((l) => l.status === 'active' && l.code === 'ATL') ?? locations?.find((l) => l.status === 'active')
  const data = useDashboardData(locations === null ? undefined : location?.id ?? null)
  const t = useMemo(() => (data.cur ? sumDaily(data.cur) : null), [data.cur])

  const itemsByCat = useMemo(() => {
    if (!data.items) return {}
    const grouped = groupSum(data.items, (r) => r.item_key, ['net_sales', 'quantity'], (r) => ({ item_name: r.item_name, category: r.category }))
    const byCat = {}
    for (const g of grouped) (byCat[g.category || 'Uncategorized'] = byCat[g.category || 'Uncategorized'] || []).push(g)
    for (const c of Object.keys(byCat)) byCat[c].sort((a, b) => (mode === 'dollar' ? b.net_sales - a.net_sales : b.quantity - a.quantity))
    return byCat
  }, [data.items, mode])

  const payments = useMemo(() => {
    if (!data.pays) return []
    return groupSum(data.pays, (r) => r.payment_type, ['pay_count', 'amount', 'tips']).sort((a, b) => b.amount - a.amount)
  }, [data.pays])
  const payTotal = payments.reduce((s, p) => s + p.amount, 0)

  const revenueLines = useMemo(() => {
    if (!data.cats) return []
    return groupSum(data.cats, (r) => r.category, ['net_sales']).sort((a, b) => b.net_sales - a.net_sales)
  }, [data.cats])

  const topBlock = (title, cat) => {
    const rows = (itemsByCat[cat] ?? []).slice(0, 6)
    return (
      <div style={{ ...card, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{title}</div>
        {rows.length === 0 ? (
          <div style={{ color: colors.muted3, fontSize: 12 }}>No items in range</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {rows.map((r, i) => (
              <RankRow key={r.key} n={i + 1} name={r.item_name} val={mode === 'dollar' ? fmtMoney(r.net_sales) : `${fmtInt(r.quantity)} sold`} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="locations" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <Crumbs
          items={[
            { label: 'Company', to: '/' },
            { label: 'By Location', to: '/locations' },
            { label: location?.name ?? '…', to: `/locations/${(location?.code ?? 'atl').toLowerCase()}` },
            { label: 'Detail Drill' },
          ]}
        />
        <PageTitle
          title={
            <>
              Detail Drill{' '}
              <span style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted3, fontWeight: 600 }}>· {location?.name ?? '…'}</span>
            </>
          }
          meta={<>The transaction-level "why" behind this location · {fmtRange(range.start, range.end)}</>}
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
            {/* ===== TOP SELLERS ===== */}
            <SectionHeader title="Top Sellers" right={<ModeToggle mode={mode} onChange={setMode} />} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 30 }}>
              {topBlock('Top Food', 'Food')}
              {topBlock('Top Liquor', 'Liquor')}
              {topBlock('Top Hookah', 'Hookah')}
            </div>

            {/* ===== PAYMENT METHODS + EXCEPTIONS ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, marginBottom: 30 }}>
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                  <div style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: 600 }}>Payment Methods</div>
                  <div style={{ fontSize: 11, color: colors.muted3 }}>
                    {fmtInt(payments.reduce((s, p) => s + p.pay_count, 0))} payments · {fmtMoney(payTotal)} collected
                  </div>
                </div>
                {payments.length === 0 ? (
                  <div style={{ color: colors.muted3, fontSize: 12 }}>No payments in range</div>
                ) : (
                  <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: colors.muted2, textAlign: 'right', borderBottom: `1px solid ${colors.pageBg}` }}>
                        <th style={{ textAlign: 'left', padding: '9px 6px', fontWeight: 600 }}>Method</th>
                        {['Txns', 'Collected', 'Avg Tx', 'Tips', 'Share'].map((h) => (
                          <th key={h} style={{ padding: '9px 6px', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, ri) => (
                        <tr key={p.key} style={{ textAlign: 'right', borderBottom: ri < payments.length - 1 ? `1px solid ${colors.panelGray}` : 'none' }}>
                          <td style={{ textAlign: 'left', padding: '11px 6px', fontWeight: 600 }}>{p.key}</td>
                          <td style={{ padding: '11px 6px' }}>{fmtInt(p.pay_count)}</td>
                          <td style={{ padding: '11px 6px' }}>{fmtMoney(p.amount)}</td>
                          <td style={{ padding: '11px 6px' }}>{p.pay_count ? fmtMoneyC(p.amount / p.pay_count) : '—'}</td>
                          <td style={{ padding: '11px 6px' }}>{fmtMoney(p.tips)}</td>
                          <td style={{ padding: '11px 6px', fontWeight: 700 }}>{payTotal ? Math.round((p.amount / payTotal) * 100) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Void / Exception panel */}
              <Link to={`/exceptions?loc=${(location?.code ?? '').toLowerCase()}`} style={{ ...card, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                  <div style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: 600 }}>Void / Exception Detail</div>
                  <div style={{ fontSize: 12, color: colors.brand, fontWeight: 700 }}>Open list →</div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: colors.panelGray, borderRadius: 9 }}>
                    <span style={{ fontFamily: fonts.serif, fontSize: 26, fontWeight: 600, color: colors.brand }}>{data.exceptionCount ?? 0}</span>
                    <span style={{ fontSize: 12, color: colors.muted1 }}>flags in this range</span>
                  </div>
                  <div style={{ fontSize: 12, color: colors.muted1, padding: '12px 14px', background: colors.panelGray, borderRadius: 9 }}>
                    Voids this range: <span style={{ fontWeight: 700 }}>{fmtMoney(t?.voids)}</span> ({fmtPct(t?.voidPct)} of sales)
                  </div>
                  <div style={{ fontSize: 11, color: colors.muted3 }}>
                    Automated audit rules are pending definition — flags appear here once rules run or entries are logged manually.
                  </div>
                </div>
              </Link>
            </div>

            {/* ===== P&L SUMMARY ===== */}
            <SectionHeader title="P&L Summary" right={<div style={{ fontSize: 11, color: colors.muted3 }}>{fmtRange(range.start, range.end)} · selected range</div>} />
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  <tr style={{ background: colors.panelGray }}>
                    <td colSpan={2} style={{ padding: '12px 20px', fontWeight: 700, color: colors.brand, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>Revenue</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700, color: colors.brand, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>% of Net Sales</td>
                  </tr>
                  {revenueLines.map((l) => (
                    <tr key={l.key} style={{ borderBottom: `1px solid ${colors.panelGray}` }}>
                      <td colSpan={2} style={{ padding: '11px 20px' }}>{l.key}</td>
                      <td style={{ padding: '11px 20px', textAlign: 'right' }}>
                        {fmtMoney(l.net_sales)} <span style={{ color: colors.muted3 }}>· {t?.net ? ((l.net_sales / t.net) * 100).toFixed(1) : '0.0'}%</span>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                    <td colSpan={2} style={{ padding: '12px 20px', fontWeight: 700 }}>Net Sales</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 700 }}>{fmtMoney(t?.net)}</td>
                  </tr>

                  <tr style={{ background: colors.panelGray }}>
                    <td colSpan={3} style={{ padding: '12px 20px', fontWeight: 700, color: colors.brand, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>Cost of Goods &amp; Operating</td>
                  </tr>
                  {[
                    ['Food Cost', 'Awaiting invoice intake'],
                    ['Liquor Cost', 'Awaiting invoice intake'],
                    ['Labor', 'Labor source deferred'],
                    ['Operating Expenses', 'Awaiting invoice intake'],
                  ].map(([label, note]) => (
                    <tr key={label} style={{ borderBottom: `1px solid ${colors.panelGray}` }}>
                      <td colSpan={2} style={{ padding: '11px 20px' }}>
                        {label} <span style={{ fontSize: 11, color: colors.muted3 }}>· {note}</span>
                      </td>
                      <td style={{ padding: '11px 20px', textAlign: 'right', color: colors.muted3 }}>—</td>
                    </tr>
                  ))}

                  <tr style={{ background: colors.brand, color: '#fff' }}>
                    <td colSpan={2} style={{ padding: '15px 20px', fontWeight: 700, fontSize: 15 }}>Net Operating Income</td>
                    <td style={{ padding: '15px 20px', textAlign: 'right', fontFamily: fonts.serif, fontWeight: 600, fontSize: 22 }}>—</td>
                  </tr>
                  <tr style={{ background: '#102C58', color: colors.brandTint3 }}>
                    <td colSpan={2} style={{ padding: '9px 20px', fontSize: 11 }}>Operating Margin · completes when cost sources land</td>
                    <td style={{ padding: '9px 20px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#fff' }}>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
