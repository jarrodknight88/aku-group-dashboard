import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle from '../components/PageTitle.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, StatRow } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useRange } from '../state/RangeContext.jsx'
import { fetchLocations, fetchDaily } from '../data/live.js'
import { fetchInvoices, fetchReviewQueue, reviewInvoice, fetchRecurringVendors, sumBy } from '../data/financials.js'
import { fmtMoney } from '../lib/format.js'
import { fmtRange } from '../lib/dates.js'

/* Financials (INVOICE_SYSTEM reference §8) — replaces the yearly sheets.
   Review Queue (flagged invoices, approve/decline) up top; monthly P&L per
   location; category spend with group → category → vendor → invoice drill;
   recurring bills actual-vs-expected; vendor baseline detail inside the
   drill. Costs land on invoice_date; needs_review/declined never count. */

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GROUPS = ['Inventory & COGS', 'Operations & Facility', 'Labor & Professional', 'Tech & Equipment', 'Logistics & Misc']
const fmt2 = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n) => (n == null ? '—' : fmtMoney(n))

function FlagChips({ reasons }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(reasons ?? []).map((r, i) => (
        <span key={i} style={{ fontSize: 11, fontWeight: 600, color: '#8A6D1A', background: '#FBF3DC', padding: '3px 8px', borderRadius: 5, width: 'fit-content' }}>
          {r}
        </span>
      ))}
    </div>
  )
}

export default function Financials() {
  const { profile } = useAuth()
  const { range } = useRange()
  const canAct = ['owner', 'admin'].includes(profile?.role)
  const year = range.end.slice(0, 4)

  const [locations, setLocations] = useState([])
  const [loc, setLoc] = useState('all')
  const [queue, setQueue] = useState([])
  const [invoices, setInvoices] = useState([]) // selected range, drill + categories
  const [yearInvoices, setYearInvoices] = useState([]) // full year, P&L + recurring
  const [yearMetrics, setYearMetrics] = useState([]) // full year revenue
  const [recurring, setRecurring] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [drill, setDrill] = useState({}) // { grp, cat, vendor }
  const [acting, setActing] = useState(null)

  const locByCode = Object.fromEntries(locations.map((l) => [l.code.toLowerCase(), l]))
  const scopeId = loc === 'all' ? null : locByCode[loc]?.id
  const active = locations.filter((l) => l.status === 'active')

  useEffect(() => {
    let live = true
    setLoading(true)
    fetchLocations()
      .then((locs) => {
        if (!live) return null
        setLocations(locs)
        const id = loc === 'all' ? null : locs.find((l) => l.code.toLowerCase() === loc)?.id ?? null
        return Promise.all([
          fetchReviewQueue(),
          fetchInvoices(id, range.start, range.end),
          fetchInvoices(id, `${year}-01-01`, `${year}-12-31`),
          fetchDaily(id, `${year}-01-01`, `${year}-12-31`),
          fetchRecurringVendors(),
        ])
      })
      .then((res) => {
        if (!live || !res) return
        const [q, inv, yInv, yMet, rec] = res
        setQueue(q)
        setInvoices(inv)
        setYearInvoices(yInv)
        setYearMetrics(yMet)
        setRecurring(rec)
        setError('')
        setLoading(false)
      })
      .catch((e) => {
        if (!live) return
        setError(e.message)
        setLoading(false)
      })
    return () => { live = false }
  }, [loc, range.start, range.end, year, reload])

  const act = async (id, approve) => {
    setActing(id)
    try {
      await reviewInvoice(id, approve)
      setReload((k) => k + 1)
    } catch (e) {
      setError(e.message)
    }
    setActing(null)
  }

  /* ---- monthly P&L ---- */
  const pnl = useMemo(() => {
    const rev = new Array(12).fill(0)
    const exp = new Array(12).fill(0)
    const cogs = new Array(12).fill(0)
    for (const r of yearMetrics) rev[Number(r.business_date.slice(5, 7)) - 1] += Number(r.net_sales) || 0
    for (const i of yearInvoices) {
      const m = Number(i.invoice_date.slice(5, 7)) - 1
      exp[m] += Number(i.amount) || 0
      if (i.expense_categories?.grp === 'Inventory & COGS') cogs[m] += Number(i.amount) || 0
    }
    return MO.map((label, m) => {
      const net = rev[m] - exp[m]
      return {
        label: `${label}-${year}`,
        rev: rev[m], exp: exp[m], net,
        margin: rev[m] > 0 ? (net / rev[m]) * 100 : null,
        opex: rev[m] > 0 ? ((exp[m] - cogs[m]) / rev[m]) * 100 : null,
        has: rev[m] > 0 || exp[m] > 0,
      }
    })
  }, [yearMetrics, yearInvoices, year])
  const ytd = pnl.reduce((a, m) => ({ rev: a.rev + m.rev, exp: a.exp + m.exp }), { rev: 0, exp: 0 })

  /* ---- category drill (selected range) ---- */
  const byGroup = useMemo(() => sumBy(invoices, (i) => i.expense_categories?.grp ?? 'Uncategorized'), [invoices])
  const rangeTotal = byGroup.reduce((a, g) => a + g.amount, 0)
  const catsInGroup = useMemo(
    () => (drill.grp ? sumBy(invoices.filter((i) => (i.expense_categories?.grp ?? 'Uncategorized') === drill.grp), (i) => i.expense_categories?.name ?? 'Uncategorized') : []),
    [invoices, drill.grp],
  )
  const vendorsInCat = useMemo(
    () => (drill.cat ? sumBy(invoices.filter((i) => (i.expense_categories?.name ?? 'Uncategorized') === drill.cat), (i) => i.vendors?.name ?? i.vendor_name_raw) : []),
    [invoices, drill.cat],
  )
  const vendorInvoices = useMemo(
    () => (drill.vendor ? invoices.filter((i) => (i.vendors?.name ?? i.vendor_name_raw) === drill.vendor) : []),
    [invoices, drill.vendor],
  )
  const vendorBaseline = useMemo(() => {
    if (!vendorInvoices.length) return null
    const amounts = vendorInvoices.map((i) => Number(i.amount)).sort((a, b) => a - b)
    const median = amounts.length % 2 ? amounts[(amounts.length - 1) / 2] : (amounts[amounts.length / 2 - 1] + amounts[amounts.length / 2]) / 2
    return { median, band: median * 2.5, n: amounts.length }
  }, [vendorInvoices])

  /* ---- recurring bills grid (current month of range end) ---- */
  const billMonth = range.end.slice(0, 7)
  const bills = useMemo(() => {
    const actual = new Map()
    for (const i of yearInvoices) {
      if (i.invoice_date.slice(0, 7) !== billMonth) continue
      const name = i.vendors?.name
      if (name) actual.set(name, (actual.get(name) ?? 0) + Number(i.amount))
    }
    return recurring
      .filter((v) => v.expected_amount)
      .map((v) => {
        const monthlyExpected = v.expected_frequency === 'weekly' ? Number(v.expected_amount) * 4.33 : Number(v.expected_amount)
        const act = actual.get(v.name) ?? 0
        const variance = monthlyExpected > 0 ? ((act - monthlyExpected) / monthlyExpected) * 100 : null
        return { ...v, monthlyExpected, actual: act, variance }
      })
  }, [recurring, yearInvoices, billMonth])

  const th = { padding: '11px 12px', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }
  const thL = { ...th, textAlign: 'left' }
  const td = { padding: '11px 12px', textAlign: 'right' }
  const tdL = { ...td, textAlign: 'left' }
  const drillRow = (onClick, active) => ({
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px',
    borderRadius: 8, cursor: 'pointer', fontSize: 12,
    background: active ? '#E8EEF6' : 'transparent', fontWeight: active ? 700 : 600,
  })

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="financials" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <PageTitle
          title="Financials"
          meta={<>Revenue from Toast · costs from approved invoices · {loading ? 'Loading…' : `${invoices.length} invoices in range`}</>}
          right={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <DateRangePicker />
              <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
                {[['all', 'All locations'], ...active.map((l) => [l.code.toLowerCase(), l.name])].map(([code, label]) => (
                  <div key={code} onClick={() => { setLoc(code); setDrill({}) }} style={{ padding: '7px 14px', borderRadius: 6, background: code === loc ? colors.brand : 'transparent', color: code === loc ? '#fff' : colors.muted1, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {label}
                  </div>
                ))}
              </div>
            </div>
          }
        />

        {error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 18 }}>
            {error}
          </div>
        )}

        {/* ===== SUMMARY ===== */}
        <StatRow
          size={26}
          min={190}
          style={{ marginBottom: 22 }}
          items={[
            { label: `Revenue (${year} YTD)`, value: fmtK(ytd.rev), sub: <span style={{ fontSize: 11, color: colors.muted3 }}>Toast net sales</span> },
            { label: `Expenses (${year} YTD)`, value: fmtK(ytd.exp), sub: <span style={{ fontSize: 11, color: colors.muted3 }}>approved invoices</span> },
            {
              label: `Net (${year} YTD)`, value: fmtK(ytd.rev - ytd.exp),
              valueColor: ytd.rev - ytd.exp >= 0 ? colors.greenDark : colors.red,
              sub: <span style={{ fontSize: 11, color: colors.muted3 }}>{ytd.rev > 0 ? `${(((ytd.rev - ytd.exp) / ytd.rev) * 100).toFixed(1)}% margin` : 'no revenue yet'}</span>,
            },
            {
              label: 'Needs Review', value: queue.length,
              valueColor: queue.length > 0 ? colors.red : colors.ink,
              sub: <span style={{ fontSize: 11, color: queue.length ? colors.red : colors.muted3, fontWeight: 600 }}>{queue.length ? 'flagged by rules — review below' : 'queue is clear'}</span>,
            },
          ]}
        />

        {/* ===== REVIEW QUEUE ===== */}
        <SectionHeader title="Review Queue" right={<span style={{ fontSize: 12, color: colors.muted3 }}>Rules auto-approve normal invoices — only flagged ones land here</span>} />
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 28 }}>
          {queue.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12, color: colors.muted3 }}>Nothing needs review.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
                <thead>
                  <tr style={{ background: colors.panelGray, color: colors.muted2 }}>
                    <th style={{ ...thL, padding: '11px 18px' }}>Submitted</th>
                    <th style={thL}>Location</th>
                    <th style={thL}>Vendor</th>
                    <th style={th}>Amount</th>
                    <th style={thL}>Why flagged</th>
                    <th style={thL}>Links</th>
                    <th style={{ ...th, padding: '11px 18px' }} />
                  </tr>
                </thead>
                <tbody>
                  {queue.map((q) => (
                    <tr key={q.id} style={{ borderTop: `1px solid ${colors.pageBg}`, verticalAlign: 'top' }}>
                      <td style={{ ...tdL, padding: '12px 18px', whiteSpace: 'nowrap' }}>
                        {fmtRange(q.invoice_date, q.invoice_date)}
                        <div style={{ fontSize: 10, color: colors.muted3 }}>#{q.invoice_number || '—'}</div>
                      </td>
                      <td style={tdL}>{locations.find((l) => l.id === q.location_id)?.name ?? ''}</td>
                      <td style={{ ...tdL, fontWeight: 700 }}>
                        {q.vendors?.name ?? q.vendor_name_raw}
                        {q.vendors?.name && q.vendors.name !== q.vendor_name_raw && (
                          <div style={{ fontSize: 10, color: colors.muted3, fontWeight: 400 }}>entered as "{q.vendor_name_raw}"</div>
                        )}
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>{fmt2(q.amount)}</td>
                      <td style={tdL}><FlagChips reasons={q.flag_reasons} /></td>
                      <td style={tdL}>
                        {q.file_url && <a href={q.file_url} target="_blank" rel="noreferrer" style={{ color: colors.brand, fontWeight: 700, marginRight: 10 }}>Invoice</a>}
                        {q.evernote_link && <a href={q.evernote_link} target="_blank" rel="noreferrer" style={{ color: colors.brand, fontWeight: 700 }}>Evernote</a>}
                      </td>
                      <td style={{ ...td, padding: '12px 18px', whiteSpace: 'nowrap' }}>
                        {canAct ? (
                          <>
                            <span onClick={() => acting !== q.id && act(q.id, true)} style={{ display: 'inline-block', padding: '6px 12px', background: colors.brand, color: '#fff', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: acting === q.id ? 0.6 : 1 }}>Approve</span>
                            <span onClick={() => acting !== q.id && act(q.id, false)} style={{ display: 'inline-block', marginLeft: 6, padding: '6px 12px', border: `1px solid ${colors.redBorder}`, color: colors.red, borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: acting === q.id ? 0.6 : 1 }}>Decline</span>
                          </>
                        ) : (
                          <span style={{ fontSize: 11, color: colors.muted3 }}>admin review</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ===== MONTHLY P&L ===== */}
        <SectionHeader title={`Monthly P&L · ${year}`} sub={loc === 'all' ? 'all locations' : locByCode[loc]?.name} right={<span style={{ fontSize: 12, color: colors.muted3 }}>Revenue = Toast net sales · Expenses = approved invoices (incl. payroll invoices)</span>} />
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 28 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 680 }}>
              <thead>
                <tr style={{ background: colors.panelGray, color: colors.muted2 }}>
                  <th style={{ ...thL, padding: '11px 18px' }}>Month</th>
                  <th style={th}>Revenue</th>
                  <th style={th}>Expenses</th>
                  <th style={th}>Net</th>
                  <th style={th}>Margin</th>
                  <th style={{ ...th, padding: '11px 18px' }}>OPEX Ratio</th>
                </tr>
              </thead>
              <tbody>
                {pnl.filter((m) => m.has).map((m) => (
                  <tr key={m.label} style={{ borderTop: `1px solid ${colors.pageBg}` }}>
                    <td style={{ ...tdL, padding: '11px 18px', fontWeight: 700 }}>{m.label}</td>
                    <td style={td}>{fmtK(m.rev)}</td>
                    <td style={td}>{fmtK(m.exp)}</td>
                    <td style={{ ...td, fontWeight: 700, color: m.net >= 0 ? colors.greenDark : colors.red }}>{m.net < 0 ? `(${fmtMoney(-m.net)})` : fmtMoney(m.net)}</td>
                    <td style={td}>{m.margin == null ? '—' : `${m.margin.toFixed(1)}%`}</td>
                    <td style={{ ...td, padding: '11px 18px' }}>{m.opex == null ? '—' : `${m.opex.toFixed(1)}%`}</td>
                  </tr>
                ))}
                {pnl.every((m) => !m.has) && (
                  <tr><td colSpan={6} style={{ padding: 18, fontSize: 12, color: colors.muted3 }}>No {year} data yet — run the invoice backfill workflow to load history.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== CATEGORY SPEND DRILL ===== */}
        <SectionHeader title="Category Spend" sub={fmtRange(range.start, range.end)} right={<span style={{ fontSize: 12, color: colors.muted3 }}>Click a group, category, then vendor to drill to invoices</span>} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start', marginBottom: 28 }}>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Groups · {fmtK(rangeTotal)}</div>
            {byGroup.length === 0 && <div style={{ fontSize: 12, color: colors.muted3, padding: '10px 0' }}>No spend in range.</div>}
            {GROUPS.filter((g) => byGroup.some((x) => x.key === g)).concat(byGroup.some((x) => x.key === 'Uncategorized') ? ['Uncategorized'] : []).map((g) => {
              const row = byGroup.find((x) => x.key === g)
              return (
                <div key={g} className="row-hover" style={drillRow(null, drill.grp === g)} onClick={() => setDrill(drill.grp === g ? {} : { grp: g })}>
                  <span>{g}</span>
                  <span className="tnum">{fmtK(row.amount)}<span style={{ color: colors.muted3, fontWeight: 400 }}> · {rangeTotal > 0 ? Math.round((row.amount / rangeTotal) * 100) : 0}%</span></span>
                </div>
              )
            })}
          </div>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{drill.grp ? `Categories · ${drill.grp}` : 'Categories'}</div>
            {!drill.grp && <div style={{ fontSize: 12, color: colors.muted3, padding: '10px 0' }}>Pick a group.</div>}
            {catsInGroup.map((c) => (
              <div key={c.key} className="row-hover" style={drillRow(null, drill.cat === c.key)} onClick={() => setDrill(drill.cat === c.key ? { grp: drill.grp } : { grp: drill.grp, cat: c.key })}>
                <span>{c.key}</span>
                <span className="tnum">{fmtK(c.amount)}</span>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{drill.cat ? `Vendors · ${drill.cat}` : 'Vendors'}</div>
            {!drill.cat && <div style={{ fontSize: 12, color: colors.muted3, padding: '10px 0' }}>Pick a category.</div>}
            {vendorsInCat.map((v) => (
              <div key={v.key} className="row-hover" style={drillRow(null, drill.vendor === v.key)} onClick={() => setDrill(drill.vendor === v.key ? { grp: drill.grp, cat: drill.cat } : { ...drill, vendor: v.key })}>
                <span>{v.key}</span>
                <span className="tnum">{fmtK(v.amount)}<span style={{ color: colors.muted3, fontWeight: 400 }}> · {v.count}</span></span>
              </div>
            ))}
          </div>
        </div>

        {/* ===== VENDOR DETAIL ===== */}
        {drill.vendor && (
          <>
            <SectionHeader
              title={`Vendor Detail · ${drill.vendor}`}
              right={
                vendorBaseline && (
                  <span style={{ fontSize: 12, color: colors.muted3 }}>
                    Median {fmt2(vendorBaseline.median)} across {vendorBaseline.n} invoices · flag band &gt; {fmt2(vendorBaseline.band)} (2.5× median, min $500)
                  </span>
                )
              }
            />
            <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 28 }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
                  <thead>
                    <tr style={{ background: colors.panelGray, color: colors.muted2 }}>
                      <th style={{ ...thL, padding: '11px 18px' }}>Date</th>
                      <th style={thL}>Location</th>
                      <th style={thL}>Invoice #</th>
                      <th style={th}>Amount</th>
                      <th style={thL}>Status</th>
                      <th style={{ ...thL, padding: '11px 18px' }}>Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorInvoices.map((i) => {
                      const over = vendorBaseline && Number(i.amount) > vendorBaseline.band && Number(i.amount) >= 500
                      return (
                        <tr key={i.id} style={{ borderTop: `1px solid ${colors.pageBg}` }}>
                          <td style={{ ...tdL, padding: '11px 18px' }}>{fmtRange(i.invoice_date, i.invoice_date)}</td>
                          <td style={tdL}>{locations.find((l) => l.id === i.location_id)?.name ?? ''}</td>
                          <td style={tdL}>{i.invoice_number || '—'}</td>
                          <td style={{ ...td, fontWeight: 700, color: over ? colors.red : 'inherit', background: over ? colors.redBg : 'transparent' }}>{fmt2(i.amount)}</td>
                          <td style={{ ...tdL, color: colors.muted2 }}>{i.status.replace('_', ' ')}</td>
                          <td style={{ ...tdL, padding: '11px 18px' }}>
                            {i.file_url && <a href={i.file_url} target="_blank" rel="noreferrer" style={{ color: colors.brand, fontWeight: 700, marginRight: 10 }}>Invoice</a>}
                            {i.evernote_link && <a href={i.evernote_link} target="_blank" rel="noreferrer" style={{ color: colors.brand, fontWeight: 700 }}>Evernote</a>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ===== RECURRING BILLS ===== */}
        <SectionHeader title="Recurring Bills" sub={billMonth} right={<span style={{ fontSize: 12, color: colors.muted3 }}>Actual vs expected for the month of the selected range's end · ±25% tolerance</span>} />
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
              <thead>
                <tr style={{ background: colors.panelGray, color: colors.muted2 }}>
                  <th style={{ ...thL, padding: '11px 18px' }}>Vendor</th>
                  <th style={thL}>Category</th>
                  <th style={th}>Expected / mo</th>
                  <th style={th}>Actual</th>
                  <th style={{ ...th, padding: '11px 18px' }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const off = b.variance != null && Math.abs(b.variance) > 25 && b.actual > 0
                  const missing = b.actual === 0
                  return (
                    <tr key={b.id} style={{ borderTop: `1px solid ${colors.pageBg}` }}>
                      <td style={{ ...tdL, padding: '11px 18px', fontWeight: 700 }}>{b.name}</td>
                      <td style={tdL}>{b.expense_categories?.name ?? '—'}</td>
                      <td style={td}>{fmt2(b.monthlyExpected)}{b.expected_frequency === 'weekly' ? <span style={{ color: colors.muted3 }}> (wk×4.33)</span> : ''}</td>
                      <td style={{ ...td, color: missing ? colors.muted3 : 'inherit' }}>{missing ? 'not yet billed' : fmt2(b.actual)}</td>
                      <td style={{ ...td, padding: '11px 18px', fontWeight: 700, color: missing ? colors.muted3 : off ? colors.red : colors.greenDark, background: off ? colors.redBg : 'transparent' }}>
                        {missing || b.variance == null ? '—' : `${b.variance > 0 ? '+' : ''}${b.variance.toFixed(0)}%`}
                      </td>
                    </tr>
                  )
                })}
                {bills.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 18, fontSize: 12, color: colors.muted3 }}>No recurring vendors configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
          Costs land on the invoice date. Flagged (needs-review) and declined invoices never count toward spend or the
          dashboard cost tiles; the nightly rollup re-syncs the trailing 45 days after each review decision.
        </div>
      </div>
    </div>
  )
}
