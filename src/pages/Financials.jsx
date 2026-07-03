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
import { fetchInvoices, fetchReviewQueue, reviewInvoice, fetchBills, fetchBillPayments, saveBillPayment, addBill, removeBill, fetchCategories, sumBy } from '../data/financials.js'
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
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([]) // { bill_id, month, amount } for the year
  const [categories, setCategories] = useState([])
  const [billModal, setBillModal] = useState(null) // bill row or null
  const [billDraft, setBillDraft] = useState({ name: '', category_id: '', due_day: '', expected: '', loc: '' })
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
          fetchBills(id),
          fetchBillPayments(year),
          fetchCategories(),
        ])
      })
      .then((res) => {
        if (!live || !res) return
        const [q, inv, yInv, yMet, b, p, cats] = res
        setQueue(q)
        setInvoices(inv)
        setYearInvoices(yInv)
        setYearMetrics(yMet)
        setBills(b)
        setPayments(p)
        setCategories(cats)
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

  /* ---- monthly P&L (expenses = approved invoices + manual bill payments) ---- */
  const billIds = useMemo(() => new Set(bills.map((b) => b.id)), [bills])
  const scopedPayments = useMemo(() => payments.filter((p) => billIds.has(p.bill_id)), [payments, billIds])
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
    for (const p of scopedPayments) exp[Number(p.month.slice(5, 7)) - 1] += Number(p.amount) || 0
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
  }, [yearMetrics, yearInvoices, scopedPayments, year])
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

  /* ---- recurring bills worksheet ---- */
  const billMonth = range.end.slice(0, 7) // YYYY-MM of the range's end
  // payment lookup: `${bill_id}|${YYYY-MM}` → amount
  const payMap = useMemo(() => {
    const m = new Map()
    for (const p of payments) m.set(`${p.bill_id}|${p.month.slice(0, 7)}`, Number(p.amount))
    return m
  }, [payments])
  // invoiced actuals per (vendor, month) — shown in the modal so a bill that
  // also comes through invoice intake isn't entered twice
  const invoicedByVendorMonth = useMemo(() => {
    const m = new Map()
    for (const i of yearInvoices) {
      if (!i.vendor_id) continue
      const k = `${i.location_id}|${i.vendor_id}|${i.invoice_date.slice(0, 7)}`
      m.set(k, (m.get(k) ?? 0) + Number(i.amount))
    }
    return m
  }, [yearInvoices])
  const billRows = useMemo(
    () =>
      bills.map((b) => {
        const monthly = b.frequency === 'weekly' && b.expected_amount ? Number(b.expected_amount) * 4.33 : Number(b.expected_amount) || null
        const entered = payMap.get(`${b.id}|${billMonth}`) ?? null
        let ytd = 0
        for (let m = 1; m <= 12; m++) ytd += payMap.get(`${b.id}|${year}-${String(m).padStart(2, '0')}`) ?? 0
        const variance = monthly && entered != null ? ((entered - monthly) / monthly) * 100 : null
        return { ...b, monthly, entered, ytd, variance }
      }),
    [bills, payMap, billMonth, year],
  )
  const billsYtdTotal = billRows.reduce((a, b) => a + b.ytd, 0)

  const savePayment = async (billId, monthIso, raw) => {
    const cleaned = String(raw ?? '').replace(/[$,]/g, '').trim()
    const val = cleaned === '' ? null : parseFloat(cleaned)
    if (val != null && (Number.isNaN(val) || val < 0)) return
    const key = `${billId}|${monthIso.slice(0, 7)}`
    const prev = payMap.get(key) ?? null
    if (prev === val || (prev == null && val == null)) return
    try {
      await saveBillPayment(billId, monthIso, val)
      setPayments((ps) => {
        const rest = ps.filter((p) => !(p.bill_id === billId && p.month.slice(0, 7) === monthIso.slice(0, 7)))
        return val == null ? rest : [...rest, { bill_id: billId, month: monthIso, amount: val }]
      })
    } catch (e) {
      setError(e.message)
    }
  }

  const handleAddBill = async () => {
    const locId = loc === 'all' ? locByCode[billDraft.loc]?.id : scopeId
    if (!billDraft.name.trim()) return
    if (!locId) {
      setError('Pick a location for the new bill.')
      return
    }
    setError('')
    try {
      await addBill({
        location_id: locId,
        name: billDraft.name,
        category_id: billDraft.category_id || null,
        due_day: billDraft.due_day,
        expected_amount: parseFloat(String(billDraft.expected).replace(/[$,]/g, '')) || null,
      })
      setBillDraft({ name: '', category_id: '', due_day: '', expected: '', loc: billDraft.loc })
      setReload((k) => k + 1)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleRemoveBill = async (b) => {
    if (!window.confirm(`Remove "${b.name}" and its entered payments?`)) return
    try {
      await removeBill(b.id)
      setBillModal(null)
      setReload((k) => k + 1)
    } catch (e) {
      setError(e.message)
    }
  }

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

        {/* ===== RECURRING BILLS WORKSHEET ===== */}
        <SectionHeader
          title={`Recurring Bills · ${year}`}
          sub={`${fmtMoney(billsYtdTotal)} entered YTD`}
          right={<span style={{ fontSize: 12, color: colors.muted3 }}>Bills without invoices — click a row to enter what was paid each month</span>}
        />
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
              <thead>
                <tr style={{ background: colors.panelGray, color: colors.muted2 }}>
                  <th style={{ ...thL, padding: '11px 18px' }}>Bill</th>
                  {loc === 'all' && <th style={thL}>Location</th>}
                  <th style={thL}>Category</th>
                  <th style={thL}>Due</th>
                  <th style={th}>Expected / mo</th>
                  <th style={th}>{MO[Number(billMonth.slice(5, 7)) - 1]} entered</th>
                  <th style={th}>YTD entered</th>
                  <th style={{ width: 34 }} />
                </tr>
              </thead>
              <tbody>
                {billRows.map((b) => {
                  const off = b.variance != null && Math.abs(b.variance) > 25
                  return (
                    <tr key={b.id} className="row-hover" style={{ borderTop: `1px solid ${colors.pageBg}`, cursor: 'pointer' }} onClick={() => setBillModal(b)}>
                      <td style={{ ...tdL, padding: '11px 18px', fontWeight: 700, color: colors.brand }}>{b.name}</td>
                      {loc === 'all' && <td style={tdL}>{locations.find((l) => l.id === b.location_id)?.name ?? ''}</td>}
                      <td style={tdL}>{b.expense_categories?.name ?? '—'}</td>
                      <td style={tdL}>{b.due_day || 'Varies'}</td>
                      <td style={td}>{b.monthly ? fmt2(b.monthly) : '—'}{b.frequency === 'weekly' ? <span style={{ color: colors.muted3 }}> (wk×4.33)</span> : ''}</td>
                      <td style={{ ...td, fontWeight: 700, color: b.entered == null ? colors.muted3 : off ? colors.red : 'inherit', background: off && b.entered != null ? colors.redBg : 'transparent' }}>
                        {b.entered == null ? '—' : fmt2(b.entered)}
                      </td>
                      <td style={td}>{b.ytd > 0 ? fmt2(b.ytd) : '—'}</td>
                      <td
                        onClick={(e) => { e.stopPropagation(); if (canAct) handleRemoveBill(b) }}
                        title="Remove this bill"
                        style={{ padding: '11px 14px 11px 0', textAlign: 'center', color: '#C4C9D1', cursor: canAct ? 'pointer' : 'default', fontSize: 13 }}
                      >
                        {canAct ? '✕' : ''}
                      </td>
                    </tr>
                  )
                })}
                {billRows.length === 0 && (
                  <tr><td colSpan={loc === 'all' ? 8 : 7} style={{ padding: 18, fontSize: 12, color: colors.muted3 }}>No bills yet — add one below.</td></tr>
                )}
                {canAct && (
                  <tr style={{ borderTop: `1px solid ${colors.pageBg}`, background: '#FAFBFC' }}>
                    <td style={{ padding: '10px 18px' }}>
                      <input value={billDraft.name} onChange={(e) => setBillDraft({ ...billDraft, name: e.target.value })} placeholder="Bill / vendor name" style={{ width: '100%', padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit' }} />
                    </td>
                    {loc === 'all' && (
                      <td style={{ padding: '10px 12px' }}>
                        <select value={billDraft.loc} onChange={(e) => setBillDraft({ ...billDraft, loc: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' }}>
                          <option value="">Location…</option>
                          {active.map((l) => <option key={l.id} value={l.code.toLowerCase()}>{l.name}</option>)}
                        </select>
                      </td>
                    )}
                    <td style={{ padding: '10px 12px' }}>
                      <select value={billDraft.category_id} onChange={(e) => setBillDraft({ ...billDraft, category_id: e.target.value })} style={{ width: '100%', padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' }}>
                        <option value="">Category…</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input value={billDraft.due_day} onChange={(e) => setBillDraft({ ...billDraft, due_day: e.target.value })} placeholder="1st / 20th" style={{ width: 80, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit' }} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <input value={billDraft.expected} onChange={(e) => setBillDraft({ ...billDraft, expected: e.target.value })} placeholder="$ / mo" style={{ width: 90, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit', textAlign: 'right' }} />
                    </td>
                    <td colSpan={3} style={{ padding: '10px 18px', textAlign: 'right' }}>
                      <span onClick={handleAddBill} style={{ display: 'inline-flex', padding: '8px 16px', background: colors.brand, color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add Bill</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
          Entered payments count as expenses on the 1st of their month (Payroll-category bills stay out of the expense
          tiles — labor comes from Toast). Costs from invoices land on the invoice date; flagged and declined invoices
          never count. The nightly rollup re-syncs everything after review decisions.
        </div>
      </div>

      {/* ===== MONTHLY PAYMENT MODAL ===== */}
      {billModal && (
        <div onClick={() => setBillModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,44,88,0.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 15, width: 720, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 26 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <div style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 600 }}>{billModal.name} · {year}</div>
                <div style={{ fontSize: 12, color: colors.muted3, marginTop: 3 }}>
                  {billModal.expense_categories?.name ?? 'Uncategorized'} · due {billModal.due_day || 'varies'}
                  {billModal.monthly ? ` · expected ${fmt2(billModal.monthly)}/mo` : ''} · {locations.find((l) => l.id === billModal.location_id)?.name ?? ''}
                </div>
              </div>
              <span onClick={() => setBillModal(null)} style={{ fontSize: 16, color: colors.muted3, cursor: 'pointer', padding: 4 }}>✕</span>
            </div>
            <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 16 }}>
              Enter what was paid each month — saves when you leave the field. Clear a field to remove the entry.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {MO.map((label, m) => {
                const monthIso = `${year}-${String(m + 1).padStart(2, '0')}-01`
                const key = `${billModal.id}|${monthIso.slice(0, 7)}`
                const saved = payMap.get(key)
                const invoiced = billModal.vendor_id
                  ? invoicedByVendorMonth.get(`${billModal.location_id}|${billModal.vendor_id}|${monthIso.slice(0, 7)}`)
                  : null
                return (
                  <div key={label} style={{ border: `1px solid ${colors.border}`, borderRadius: 9, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.muted3, fontWeight: 700, marginBottom: 6 }}>{label}</div>
                    <input
                      key={`${key}|${saved ?? ''}`}
                      defaultValue={saved != null ? saved : ''}
                      placeholder={billModal.monthly ? String(Math.round(billModal.monthly)) : '—'}
                      disabled={!canAct}
                      onBlur={(e) => savePayment(billModal.id, monthIso, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                      className="tnum"
                      style={{ width: '100%', padding: '7px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', textAlign: 'right', background: canAct ? '#fff' : colors.panelGray }}
                    />
                    <div style={{ fontSize: 10, color: invoiced ? '#8A6D1A' : colors.muted4, marginTop: 5, minHeight: 13 }}>
                      {invoiced ? `invoiced ${fmt2(invoiced)}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
              <span className="tnum" style={{ fontSize: 13, fontWeight: 700 }}>
                YTD entered: {fmt2(MO.reduce((a, _, m) => a + (payMap.get(`${billModal.id}|${year}-${String(m + 1).padStart(2, '0')}`) ?? 0), 0))}
              </span>
              <div style={{ display: 'flex', gap: 10 }}>
                {canAct && (
                  <span onClick={() => handleRemoveBill(billModal)} style={{ padding: '9px 16px', border: `1px solid ${colors.redBorder}`, color: colors.red, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    Remove Bill
                  </span>
                )}
                <span onClick={() => setBillModal(null)} style={{ padding: '9px 16px', background: colors.brand, color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Done
                </span>
              </div>
            </div>
            {invoicedNoteNeeded(billModal, invoicedByVendorMonth, year) && (
              <div style={{ fontSize: 11, color: '#8A6D1A', background: '#FBF3DC', padding: '8px 12px', borderRadius: 8, marginTop: 14 }}>
                This vendor also comes through invoice intake — amounts marked "invoiced" are already counted as
                expenses. Only enter months paid outside the invoice flow, or you'll double-count.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Show the double-count warning only when the bill's vendor actually has invoices this year. */
function invoicedNoteNeeded(bill, invoicedByVendorMonth, year) {
  if (!bill.vendor_id) return false
  for (let m = 1; m <= 12; m++) {
    if (invoicedByVendorMonth.get(`${bill.location_id}|${bill.vendor_id}|${year}-${String(m).padStart(2, '0')}`)) return true
  }
  return false
}
