import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle from '../components/PageTitle.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, StatRow } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useRange } from '../state/RangeContext.jsx'
import { fetchLocations, fetchDaily } from '../data/live.js'
import { fetchInvoices, fetchInvoiceById, fetchReviewQueue, reviewInvoice, fetchBills, fetchBillPayments, saveBillPayment, addBill, removeBill, fetchCategories, fetchPayrollMonths, fetchValetDays, saveValetDay, removeValetDay, syncValetSheets, fetchInvoiceComments, addInvoiceComment, sumBy } from '../data/financials.js'
import { fetchOrgUsers } from '../data/notifications.js'
import MentionInput, { extractMentions, MentionText } from '../components/MentionInput.jsx'
import { useScrollLock } from '../lib/useScrollLock.js'
import { useIsMobile, MStatGrid, MList, MRow, MPill, MWrap } from '../components/mobile.jsx'
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

const STATUS_STYLE = {
  auto_approved: { label: 'Auto-approved', color: colors.greenDark, bg: colors.greenBg },
  approved: { label: 'Approved', color: colors.greenDark, bg: colors.greenBg },
  needs_review: { label: 'Needs review', color: '#8A6D1A', bg: '#FBF3DC' },
  declined: { label: 'Declined', color: colors.red, bg: colors.redBg },
  imported_legacy: { label: 'Legacy import', color: colors.muted2, bg: colors.panelGray },
}

/** Everything about one expense in one place: details, flags, notes, the
    attached image (inline when it renders), the Evernote link, and a
    comment thread (same threading as void/discount lines). */
function InvoiceModal({ inv, locations, profile, users, onClose }) {
  useScrollLock(!!inv)
  const [imgBroken, setImgBroken] = useState(false)
  const [comments, setComments] = useState(null) // null = loading
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [commentErr, setCommentErr] = useState('')
  useEffect(() => {
    setImgBroken(false)
    setComments(null)
    setDraft('')
    setCommentErr('')
    if (inv?.id) fetchInvoiceComments(inv.id).then(setComments)
  }, [inv?.id])
  const postComment = async () => {
    if (!draft.trim() || saving || !inv?.id) return
    setSaving(true)
    setCommentErr('')
    try {
      const saved = await addInvoiceComment({
        invoiceId: inv.id,
        comment: draft,
        authorId: profile?.id,
        authorName: profile?.full_name || profile?.email || null,
        mentions: extractMentions(draft, users),
      })
      setComments((cs) => [...(cs ?? []), saved])
      setDraft('')
    } catch (e) {
      setCommentErr(e.message)
    }
    setSaving(false)
  }
  if (!inv) return null
  const st = STATUS_STYLE[inv.status] ?? { label: inv.status, color: colors.muted2, bg: colors.panelGray }
  const submitter = inv.submitter?.full_name || inv.submitter?.email || inv.submitted_name || null
  const row = (k, v) =>
    v == null || v === '' ? null : (
      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderTop: `1px solid ${colors.pageBg}`, fontSize: 12.5 }}>
        <span style={{ color: colors.muted2, whiteSpace: 'nowrap' }}>{k}</span>
        <span style={{ fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span>
      </div>
    )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(16,44,88,0.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 15, width: 660, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', padding: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em' }}>{inv.vendors?.name ?? inv.vendor_name_raw}</div>
            {inv.vendors?.name && inv.vendors.name !== inv.vendor_name_raw && (
              <div style={{ fontSize: 11, color: colors.muted3, marginTop: 2 }}>entered as "{inv.vendor_name_raw}"</div>
            )}
          </div>
          <span onClick={onClose} style={{ fontSize: 18, color: colors.muted3, cursor: 'pointer', lineHeight: 1, padding: 4 }}>✕</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 14px' }}>
          <span className="tnum" style={{ fontSize: 24, fontWeight: 700 }}>{fmt2(inv.amount)}</span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, color: st.color, background: st.bg }}>{st.label}</span>
        </div>

        {(inv.flag_reasons ?? []).length > 0 && (
          <div style={{ marginBottom: 12 }}><FlagChips reasons={inv.flag_reasons} /></div>
        )}

        {row('Invoice date', fmtRange(inv.invoice_date, inv.invoice_date))}
        {row('Invoice #', inv.invoice_number)}
        {row('Location', locations.find((l) => l.id === inv.location_id)?.name)}
        {row('Category', inv.expense_categories ? `${inv.expense_categories.name} · ${inv.expense_categories.grp ?? ''}` : 'Uncategorized')}
        {row('Submitted', inv.submitted_at ? new Date(inv.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null)}
        {row('Submitted by', submitter)}
        {row('Submission ID', inv.submission_id)}
        {row('Notes', inv.notes)}

        {(inv.file_url || inv.evernote_link) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {inv.file_url && (
              <a href={inv.file_url} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', background: colors.brand, color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                Open invoice file ↗
              </a>
            )}
            {inv.evernote_link && (
              <a href={inv.evernote_link} target="_blank" rel="noreferrer" style={{ padding: '8px 16px', border: `1px solid ${colors.borderStrong}`, color: colors.brand, borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                Open in Evernote ↗
              </a>
            )}
          </div>
        )}
        {inv.file_url && !imgBroken && (
          <a href={inv.file_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 14 }}>
            <img
              src={inv.file_url}
              alt="invoice attachment"
              onError={() => setImgBroken(true)}
              style={{ maxWidth: '100%', maxHeight: 460, borderRadius: 10, border: `1px solid ${colors.border}`, display: 'block' }}
            />
          </a>
        )}
        {inv.file_url && imgBroken && (
          <div style={{ marginTop: 12, fontSize: 11, color: colors.muted3 }}>Attachment isn't an image (probably a PDF) — use "Open invoice file" above.</div>
        )}
        {!inv.file_url && (
          <div style={{ marginTop: 14, fontSize: 11, color: colors.muted3 }}>No file was attached to this expense.</div>
        )}

        {/* ---- comment thread ---- */}
        <div style={{ margin: '18px 0 8px', fontSize: 11, fontWeight: 700, color: colors.muted3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Comments</div>
        {comments === null ? (
          <div style={{ fontSize: 12, color: colors.muted3 }}>Loading…</div>
        ) : comments.length === 0 ? (
          <div style={{ fontSize: 12, color: colors.muted3 }}>No comments yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ background: colors.panelGray, borderRadius: 10, padding: '10px 13px' }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}><MentionText text={c.comment} users={users} /></div>
                <div style={{ fontSize: 10.5, color: colors.muted3, marginTop: 5 }}>
                  {c.author_name || 'Unknown'} · {new Date(c.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
        {commentErr && <div style={{ marginTop: 8, fontSize: 12, color: colors.red, fontWeight: 600 }}>{commentErr}</div>}
        <div style={{ marginTop: 10 }}>
          <MentionInput
            rows={2}
            value={draft}
            onChange={setDraft}
            users={users}
            placeholder="Add a comment for the team… type @ to tag someone"
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${colors.borderStrong}`, borderRadius: 9, fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
        <div
          onClick={postComment}
          style={{ marginTop: 8, padding: '10px 0', textAlign: 'center', borderRadius: 9, fontSize: 13, fontWeight: 700, background: draft.trim() && !saving ? colors.brand : colors.brandTint4, color: '#fff', cursor: draft.trim() && !saving ? 'pointer' : 'default' }}
        >
          {saving ? 'Posting…' : 'Add comment'}
        </div>
      </div>
    </div>
  )
}

export default function Financials() {
  const { profile } = useAuth()
  const { range } = useRange()
  const canAct = ['owner', 'admin'].includes(profile?.role)
  const year = range.end.slice(0, 4)

  const [locations, setLocations] = useState([])
  // location scope lives in the URL (?loc=atl) so the nav dropdown can deep-link
  const [searchParams, setSearchParams] = useSearchParams()
  const loc = (searchParams.get('loc') || 'all').toLowerCase()
  const setLoc = (code) => setSearchParams(code === 'all' ? {} : { loc: code }, { replace: true })
  const [queue, setQueue] = useState([])
  const [invoices, setInvoices] = useState([]) // selected range, drill + categories
  const [yearInvoices, setYearInvoices] = useState([]) // full year, P&L + recurring
  const [yearMetrics, setYearMetrics] = useState([]) // full year revenue
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([]) // { bill_id, month, amount } for the year
  const [categories, setCategories] = useState([])
  const [billModal, setBillModal] = useState(null) // bill row or null
  const [invModal, setInvModal] = useState(null) // invoice row or null (detail view)
  const [payrollMonths, setPayrollMonths] = useState([]) // rpc: { month, tips, salaried_monthly }
  const [billDraft, setBillDraft] = useState({ name: '', category_id: '', due_day: '', expected: '', loc: '' })
  const [valetRange, setValetRange] = useState([]) // selected range, worksheet
  const [valetYear, setValetYear] = useState([]) // full year, P&L
  const [valetDraft, setValetDraft] = useState({ loc: '', date: '', cash: '', cashapp: '', clover: '', workers: '', other: '', notes: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [drill, setDrill] = useState({}) // { grp, cat, vendor }
  const [acting, setActing] = useState(null)
  const [orgUsers, setOrgUsers] = useState([]) // roster for @-mentions
  useScrollLock(!!billModal)
  const isMobile = useIsMobile()

  useEffect(() => {
    fetchOrgUsers().then(setOrgUsers)
  }, [])

  // Notification deep link (?invoice=<id>) — open that expense's modal, then
  // drop the param so closing the modal doesn't re-trigger.
  const invoiceParam = searchParams.get('invoice')
  useEffect(() => {
    if (!invoiceParam) return
    fetchInvoiceById(invoiceParam)
      .then((inv) => {
        if (inv) setInvModal(inv)
      })
      .catch(() => {})
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('invoice')
        return next
      },
      { replace: true },
    )
  }, [invoiceParam]) // eslint-disable-line react-hooks/exhaustive-deps

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
          fetchPayrollMonths(year, id),
          fetchValetDays(id, range.start, range.end),
          fetchValetDays(id, `${year}-01-01`, `${year}-12-31`),
        ])
      })
      .then((res) => {
        if (!live || !res) return
        const [q, inv, yInv, yMet, b, p, cats, pay, vRange, vYear] = res
        setQueue(q)
        setInvoices(inv)
        setYearInvoices(yInv)
        setYearMetrics(yMet)
        setBills(b)
        setPayments(p)
        setCategories(cats)
        setPayrollMonths(pay)
        setValetRange(vRange)
        setValetYear(vYear)
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

  /* ---- monthly P&L ----
     Expenses = non-payroll approved invoices + non-payroll bill payments +
     REAL payroll from the Payroll system: wages (daily_metrics.labor_cost =
     Toast hours × dashboard rates) + tips paid + salaried monthly (admin-only
     via RPC; managers see wages-only payroll). Payroll never comes from an
     invoice line. */
  const billIds = useMemo(() => new Set(bills.map((b) => b.id)), [bills])
  const payrollBillIds = useMemo(
    () => new Set(bills.filter((b) => b.expense_categories?.name === 'Payroll').map((b) => b.id)),
    [bills],
  )
  const scopedPayments = useMemo(
    () => payments.filter((p) => billIds.has(p.bill_id) && !payrollBillIds.has(p.bill_id)),
    [payments, billIds, payrollBillIds],
  )
  const pnl = useMemo(() => {
    const rev = new Array(12).fill(0)
    const exp = new Array(12).fill(0)
    const cogs = new Array(12).fill(0)
    const payroll = new Array(12).fill(0)
    for (const r of yearMetrics) {
      const m = Number(r.business_date.slice(5, 7)) - 1
      rev[m] += Number(r.net_sales) || 0
      payroll[m] += Number(r.labor_cost) || 0 // wages: Toast hours × rates
    }
    for (const i of yearInvoices) {
      if (i.expense_categories?.name === 'Payroll') continue // payroll comes from the Payroll system
      const m = Number(i.invoice_date.slice(5, 7)) - 1
      exp[m] += Number(i.amount) || 0
      if (i.expense_categories?.grp === 'Inventory & COGS') cogs[m] += Number(i.amount) || 0
    }
    for (const p of scopedPayments) exp[Number(p.month.slice(5, 7)) - 1] += Number(p.amount) || 0
    for (const v of valetYear) {
      const m = Number(v.business_date.slice(5, 7)) - 1
      rev[m] += Number(v.total_revenue) || 0 // valet is real revenue…
      exp[m] += (Number(v.workers_paid) || 0) + (Number(v.other_expenses) || 0) // …and valet staff a real cost
    }
    for (const pm of payrollMonths) {
      const m = Number(pm.month.slice(5, 7)) - 1
      payroll[m] += Number(pm.tips) || 0
      if (payroll[m] > 0) payroll[m] += Number(pm.salaried_monthly) || 0
    }
    return MO.map((label, m) => {
      const total = exp[m] + payroll[m]
      const net = rev[m] - total
      return {
        label: `${label}-${year}`,
        rev: rev[m], exp: total, payroll: payroll[m], net,
        margin: rev[m] > 0 ? (net / rev[m]) * 100 : null,
        opex: rev[m] > 0 ? ((total - cogs[m]) / rev[m]) * 100 : null,
        has: rev[m] > 0 || total > 0,
      }
    })
  }, [yearMetrics, yearInvoices, scopedPayments, payrollMonths, valetYear, year])
  const ytd = pnl.reduce((a, m) => ({ rev: a.rev + m.rev, exp: a.exp + m.exp }), { rev: 0, exp: 0 })

  /* ---- summary tiles: the SELECTED range, not the whole year ----
     Daily items (Toast sales, wages, invoices, valet) count by date; monthly
     items (bill payments, tips, salaries) count when their month starts
     inside the range — same 1st-of-month convention as the P&L. */
  const rangeTotals = useMemo(() => {
    const inR = (d) => d >= range.start && d <= range.end
    let rev = 0
    let exp = 0
    for (const r of yearMetrics) {
      if (!inR(r.business_date)) continue
      rev += Number(r.net_sales) || 0
      exp += Number(r.labor_cost) || 0 // wages
    }
    for (const i of invoices) if (i.expense_categories?.name !== 'Payroll') exp += Number(i.amount) || 0
    for (const v of valetRange) {
      rev += Number(v.total_revenue) || 0
      exp += (Number(v.workers_paid) || 0) + (Number(v.other_expenses) || 0)
    }
    for (const p of scopedPayments) if (inR(p.month)) exp += Number(p.amount) || 0
    for (const pm of payrollMonths) if (inR(pm.month)) exp += (Number(pm.tips) || 0) + (Number(pm.salaried_monthly) || 0)
    return { rev, exp }
  }, [yearMetrics, invoices, valetRange, scopedPayments, payrollMonths, range.start, range.end])

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

  /* ---- valet worksheet (nightly cash/CashApp/Clover, staff paid out) ---- */
  const valetTotals = useMemo(
    () =>
      valetRange.reduce(
        (a, v) => ({
          rev: a.rev + (Number(v.total_revenue) || 0),
          cost: a.cost + (Number(v.workers_paid) || 0) + (Number(v.other_expenses) || 0),
          net: a.net + (Number(v.net) || 0),
        }),
        { rev: 0, cost: 0, net: 0 },
      ),
    [valetRange],
  )
  const vNum = (x) => {
    const v = parseFloat(String(x ?? '').replace(/[$,]/g, ''))
    return Number.isNaN(v) ? 0 : v
  }
  const valetDraftTotal = vNum(valetDraft.cash) + vNum(valetDraft.cashapp) + vNum(valetDraft.clover)
  const valetDraftNet = valetDraftTotal - vNum(valetDraft.workers) - vNum(valetDraft.other)
  const saveValetDraft = async () => {
    const locId = loc === 'all' ? locByCode[valetDraft.loc]?.id : scopeId
    if (!locId || !valetDraft.date) {
      setError('A valet night needs a location and a date.')
      return
    }
    try {
      await saveValetDay({
        location_id: locId,
        business_date: valetDraft.date,
        cash: vNum(valetDraft.cash),
        cashapp: vNum(valetDraft.cashapp),
        clover: vNum(valetDraft.clover),
        total_revenue: valetDraftTotal,
        workers_paid: vNum(valetDraft.workers),
        other_expenses: vNum(valetDraft.other),
        net: valetDraftNet,
        notes: valetDraft.notes.trim() || null,
      })
      setValetDraft({ loc: valetDraft.loc, date: '', cash: '', cashapp: '', clover: '', workers: '', other: '', notes: '' })
      setError('')
      setReload((k) => k + 1)
    } catch (e) {
      setError(e.message)
    }
  }
  const editValetDay = (v) => {
    setValetDraft({
      loc: locations.find((l) => l.id === v.location_id)?.code?.toLowerCase() ?? '',
      date: v.business_date,
      cash: String(v.cash ?? ''),
      cashapp: String(v.cashapp ?? ''),
      clover: String(v.clover ?? ''),
      workers: String(v.workers_paid ?? ''),
      other: String(v.other_expenses ?? ''),
      notes: v.notes ?? '',
    })
  }
  const [valetSyncing, setValetSyncing] = useState(false)
  const handleValetSync = async () => {
    if (valetSyncing) return
    setValetSyncing(true)
    try {
      await syncValetSheets()
      setError('')
      setReload((k) => k + 1)
    } catch (e) {
      setError(e.message)
    }
    setValetSyncing(false)
  }
  const handleRemoveValet = async (v) => {
    if (!window.confirm(`Remove the valet entry for ${v.business_date}?`)) return
    try {
      await removeValetDay(v.id)
      setReload((k) => k + 1)
    } catch (e) {
      setError(e.message)
    }
  }

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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, maxWidth: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '100%' }}>
                <Link to="/financials/submit" style={{ padding: '9px 16px', background: colors.brand, color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  ＋ Submit invoice
                </Link>
                <DateRangePicker />
              </div>
              <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '100%' }}>
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
        {isMobile ? (
          <MStatGrid
            style={{ marginBottom: 14 }}
            items={[
              { label: `Revenue · ${fmtRange(range.start, range.end)}`, value: fmtK(rangeTotals.rev), hero: true, sub: <span>Toast net sales + valet</span> },
              { label: 'Expenses', value: fmtK(rangeTotals.exp), sub: <span>invoices · bills · payroll · valet</span> },
              { label: 'Net', value: fmtK(rangeTotals.rev - rangeTotals.exp), valueColor: rangeTotals.rev - rangeTotals.exp >= 0 ? colors.greenDark : colors.red, sub: <span>{rangeTotals.rev > 0 ? `${(((rangeTotals.rev - rangeTotals.exp) / rangeTotals.rev) * 100).toFixed(1)}% margin` : 'no revenue in range'}</span> },
              queue.length > 0 && { label: 'Needs Review', value: queue.length, valueColor: colors.red, alert: true, hero: true, sub: <span>flagged by rules — review below</span> },
            ]}
          />
        ) : (
        <StatRow
          size={26}
          min={190}
          style={{ marginBottom: 22 }}
          items={[
            { label: `Revenue · ${fmtRange(range.start, range.end)}`, value: fmtK(rangeTotals.rev), sub: <span style={{ fontSize: 11, color: colors.muted3 }}>Toast net sales + valet</span> },
            { label: `Expenses · ${fmtRange(range.start, range.end)}`, value: fmtK(rangeTotals.exp), sub: <span style={{ fontSize: 11, color: colors.muted3 }}>invoices · bills · payroll · valet</span> },
            {
              label: `Net · ${fmtRange(range.start, range.end)}`, value: fmtK(rangeTotals.rev - rangeTotals.exp),
              valueColor: rangeTotals.rev - rangeTotals.exp >= 0 ? colors.greenDark : colors.red,
              sub: <span style={{ fontSize: 11, color: colors.muted3 }}>{rangeTotals.rev > 0 ? `${(((rangeTotals.rev - rangeTotals.exp) / rangeTotals.rev) * 100).toFixed(1)}% margin` : 'no revenue in range'}</span>,
            },
            {
              label: 'Needs Review', value: queue.length,
              valueColor: queue.length > 0 ? colors.red : colors.ink,
              sub: <span style={{ fontSize: 11, color: queue.length ? colors.red : colors.muted3, fontWeight: 600 }}>{queue.length ? 'flagged by rules — review below' : 'queue is clear'}</span>,
            },
          ]}
        />
        )}

        {/* ===== REVIEW QUEUE ===== */}
        <SectionHeader title="Review Queue" right={<span style={{ fontSize: 12, color: colors.muted3 }}>Rules auto-approve normal invoices — only flagged ones land here</span>} />
        {isMobile ? (
          <MList style={{ marginBottom: 20 }}>
            {queue.length === 0 && <div style={{ padding: 16, fontSize: 12, color: colors.muted3 }}>Nothing needs review.</div>}
            {queue.map((q, i) => (
              <div key={q.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${colors.pageBg}` }}>
                <MRow
                  first
                  onClick={() => setInvModal(q)}
                  title={q.vendors?.name ?? q.vendor_name_raw}
                  sub={`${fmtRange(q.invoice_date, q.invoice_date)} · ${locations.find((l) => l.id === q.location_id)?.name ?? ''}${(q.flag_reasons ?? [])[0] ? ` · ${q.flag_reasons[0]}` : ''}`}
                  value={fmt2(q.amount)}
                  pill={<MPill tone="red">review</MPill>}
                />
                {canAct && (
                  <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px' }}>
                    <span onClick={() => acting !== q.id && act(q.id, true)} style={{ flex: 1, textAlign: 'center', padding: '9px 0', background: colors.brand, color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, opacity: acting === q.id ? 0.6 : 1 }}>Approve</span>
                    <span onClick={() => acting !== q.id && act(q.id, false)} style={{ flex: 1, textAlign: 'center', padding: '9px 0', border: `1px solid ${colors.redBorder}`, color: colors.red, borderRadius: 8, fontSize: 12, fontWeight: 700, opacity: acting === q.id ? 0.6 : 1 }}>Decline</span>
                  </div>
                )}
              </div>
            ))}
          </MList>
        ) : (
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
                    <tr key={q.id} className="row-hover" onClick={() => setInvModal(q)} style={{ borderTop: `1px solid ${colors.pageBg}`, verticalAlign: 'top', cursor: 'pointer' }} title="Click for full detail">
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
                      <td style={tdL} onClick={(e) => e.stopPropagation()}>
                        {q.file_url && <a href={q.file_url} target="_blank" rel="noreferrer" style={{ color: colors.brand, fontWeight: 700, marginRight: 10 }}>Invoice</a>}
                        {q.evernote_link && <a href={q.evernote_link} target="_blank" rel="noreferrer" style={{ color: colors.brand, fontWeight: 700 }}>Evernote</a>}
                      </td>
                      <td style={{ ...td, padding: '12px 18px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
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
        )}

        {/* ===== MONTHLY P&L ===== */}
        <SectionHeader title={`Monthly P&L · ${year}`} sub={loc === 'all' ? 'all locations' : locByCode[loc]?.name} right={<span style={{ fontSize: 12, color: colors.muted3 }}>Revenue = Toast net sales + valet · Expenses = invoices + bills + valet costs + payroll from the Payroll tab</span>} />
        {isMobile ? (
          <MList style={{ marginBottom: 20 }}>
            {pnl.filter((m) => m.has).map((m, i) => (
              <MRow
                key={m.label}
                first={i === 0}
                title={m.label}
                sub={`rev ${fmtK(m.rev)} · exp ${fmtK(m.exp)}${m.payroll > 0 ? ` · payroll ${fmtK(m.payroll)}` : ''}`}
                value={m.net < 0 ? `(${fmtMoney(-m.net)})` : fmtMoney(m.net)}
                valueSub={m.margin == null ? '' : `${m.margin.toFixed(1)}% margin`}
                pill={m.net < 0 ? <MPill tone="red">loss</MPill> : null}
              />
            ))}
            {pnl.every((m) => !m.has) && <div style={{ padding: 16, fontSize: 12, color: colors.muted3 }}>No {year} data yet.</div>}
          </MList>
        ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 28 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
              <thead>
                <tr style={{ background: colors.panelGray, color: colors.muted2 }}>
                  <th style={{ ...thL, padding: '11px 18px' }}>Month</th>
                  <th style={th}>Revenue</th>
                  <th style={th}>Expenses</th>
                  <th style={th}>of which Payroll</th>
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
                    <td style={{ ...td, color: colors.muted2 }}>{m.payroll > 0 ? fmtK(m.payroll) : '—'}</td>
                    <td style={{ ...td, fontWeight: 700, color: m.net >= 0 ? colors.greenDark : colors.red }}>{m.net < 0 ? `(${fmtMoney(-m.net)})` : fmtMoney(m.net)}</td>
                    <td style={td}>{m.margin == null ? '—' : `${m.margin.toFixed(1)}%`}</td>
                    <td style={{ ...td, padding: '11px 18px' }}>{m.opex == null ? '—' : `${m.opex.toFixed(1)}%`}</td>
                  </tr>
                ))}
                {pnl.every((m) => !m.has) && (
                  <tr><td colSpan={7} style={{ padding: 18, fontSize: 12, color: colors.muted3 }}>No {year} data yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

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
            {isMobile ? (
              <MList style={{ marginBottom: 20 }}>
                {vendorInvoices.map((i, ix) => {
                  const over = vendorBaseline && Number(i.amount) > vendorBaseline.band && Number(i.amount) >= 500
                  return (
                    <MRow
                      key={i.id}
                      first={ix === 0}
                      onClick={() => setInvModal(i)}
                      title={`${fmtRange(i.invoice_date, i.invoice_date)}${i.invoice_number ? ` · #${i.invoice_number}` : ''}`}
                      sub={`${locations.find((l) => l.id === i.location_id)?.name ?? ''} · ${i.status.replace('_', ' ')}`}
                      value={fmt2(i.amount)}
                      pill={over ? <MPill tone="red">above baseline</MPill> : null}
                    />
                  )
                })}
              </MList>
            ) : (
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
                        <tr key={i.id} className="row-hover" onClick={() => setInvModal(i)} style={{ borderTop: `1px solid ${colors.pageBg}`, cursor: 'pointer' }} title="Click for full detail">
                          <td style={{ ...tdL, padding: '11px 18px' }}>{fmtRange(i.invoice_date, i.invoice_date)}</td>
                          <td style={tdL}>{locations.find((l) => l.id === i.location_id)?.name ?? ''}</td>
                          <td style={tdL}>{i.invoice_number || '—'}</td>
                          <td style={{ ...td, fontWeight: 700, color: over ? colors.red : 'inherit', background: over ? colors.redBg : 'transparent' }}>{fmt2(i.amount)}</td>
                          <td style={{ ...tdL, color: colors.muted2 }}>{i.status.replace('_', ' ')}</td>
                          <td style={{ ...tdL, padding: '11px 18px' }} onClick={(e) => e.stopPropagation()}>
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
            )}
          </>
        )}

        {/* ===== RECURRING BILLS WORKSHEET ===== */}
        <MWrap on={isMobile} title="Recurring Bills" sub={`${fmtMoney(billsYtdTotal)} entered YTD`}>
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
        </MWrap>

        {/* ===== VALET WORKSHEET ===== */}
        <MWrap on={isMobile} title="Valet" sub={`net ${fmt2(valetTotals.net)} in range`}>
        <SectionHeader
          style={{ marginTop: 30 }}
          title="Valet"
          sub={fmtRange(range.start, range.end)}
          right={
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="tnum" style={{ fontSize: 12, color: colors.muted2 }}>
                Revenue <b>{fmt2(valetTotals.rev)}</b> · Staff &amp; costs <b>{fmt2(valetTotals.cost)}</b> · Net{' '}
                <b style={{ color: valetTotals.net >= 0 ? colors.greenDark : colors.red }}>{fmt2(valetTotals.net)}</b>
              </span>
              {canAct && (
                <span onClick={handleValetSync} style={{ padding: '6px 13px', background: valetSyncing ? colors.brandTint4 : colors.brand, color: '#fff', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {valetSyncing ? 'Syncing…' : '⟳ Sync from sheet'}
                </span>
              )}
            </span>
          }
        />
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
              <thead>
                <tr style={{ background: colors.panelGray, color: colors.muted2 }}>
                  <th style={{ ...thL, padding: '11px 18px' }}>Night</th>
                  {loc === 'all' && <th style={thL}>Location</th>}
                  <th style={th}>Cash</th>
                  <th style={th}>CashApp</th>
                  <th style={th}>Clover</th>
                  <th style={th}>Revenue</th>
                  <th style={th}>Staff paid</th>
                  <th style={th}>Other</th>
                  <th style={th}>Net</th>
                  <th style={thL}>Notes</th>
                  <th style={{ width: 34 }} />
                </tr>
              </thead>
              <tbody>
                {/* entry row: pick the date (an existing night loads for edit via its row) */}
                <tr style={{ background: '#FAFBFC' }}>
                  <td style={{ padding: '10px 18px', whiteSpace: 'nowrap' }}>
                    <input type="date" value={valetDraft.date} onChange={(e) => setValetDraft({ ...valetDraft, date: e.target.value })} style={{ padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit' }} />
                  </td>
                  {loc === 'all' && (
                    <td style={{ padding: '10px 12px' }}>
                      <select value={valetDraft.loc} onChange={(e) => setValetDraft({ ...valetDraft, loc: e.target.value })} style={{ width: '100%', minWidth: 110, padding: '8px 10px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' }}>
                        <option value="">Location…</option>
                        {active.map((l) => <option key={l.id} value={l.code.toLowerCase()}>{l.name}</option>)}
                      </select>
                    </td>
                  )}
                  {['cash', 'cashapp', 'clover', 'workers', 'other'].map((k) => (
                    <td key={k} style={{ padding: k === 'clover' ? '10px 12px 10px 6px' : '10px 6px' }}>
                      <input value={valetDraft[k]} onChange={(e) => setValetDraft({ ...valetDraft, [k]: e.target.value })} placeholder="$" style={{ width: 74, padding: '8px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit', textAlign: 'right' }} />
                    </td>
                  ))}
                  <td style={{ ...td, color: colors.muted3 }}>{valetDraft.date ? fmt2(valetDraftTotal) : '—'}</td>
                  <td style={{ ...td, fontWeight: 700, color: valetDraftNet >= 0 ? colors.greenDark : colors.red }}>{valetDraft.date ? fmt2(valetDraftNet) : '—'}</td>
                  <td style={{ padding: '10px 6px' }}>
                    <input value={valetDraft.notes} onChange={(e) => setValetDraft({ ...valetDraft, notes: e.target.value })} placeholder="Notes" style={{ width: '100%', minWidth: 110, padding: '8px 9px', border: `1px solid ${colors.borderStrong}`, borderRadius: 7, fontSize: 12, fontFamily: 'inherit' }} />
                  </td>
                  <td style={{ padding: '10px 14px 10px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span onClick={saveValetDraft} style={{ display: 'inline-flex', padding: '8px 14px', background: colors.brand, color: '#fff', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</span>
                  </td>
                </tr>
                {valetRange.slice(0, 45).map((v) => (
                  <tr key={v.id} className="row-hover" style={{ borderTop: `1px solid ${colors.pageBg}`, cursor: 'pointer' }} onClick={() => editValetDay(v)} title="Click to load into the entry row">
                    <td style={{ ...tdL, padding: '11px 18px', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtRange(v.business_date, v.business_date)}</td>
                    {loc === 'all' && <td style={tdL}>{locations.find((l) => l.id === v.location_id)?.name ?? ''}</td>}
                    <td style={td}>{fmt2(v.cash)}</td>
                    <td style={td}>{fmt2(v.cashapp)}</td>
                    <td style={td}>{fmt2(v.clover)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmt2(v.total_revenue)}</td>
                    <td style={td}>{fmt2(v.workers_paid)}</td>
                    <td style={td}>{fmt2(v.other_expenses)}</td>
                    <td style={{ ...td, fontWeight: 700, color: Number(v.net) >= 0 ? colors.greenDark : colors.red }}>{fmt2(v.net)}</td>
                    <td style={{ ...tdL, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.muted2 }} title={v.notes ?? ''}>{v.notes ?? ''}</td>
                    <td
                      onClick={(e) => { e.stopPropagation(); if (canAct) handleRemoveValet(v) }}
                      title="Remove this night"
                      style={{ padding: '11px 14px 11px 0', textAlign: 'center', color: '#C4C9D1', cursor: canAct ? 'pointer' : 'default', fontSize: 13 }}
                    >
                      {canAct ? '✕' : ''}
                    </td>
                  </tr>
                ))}
                {valetRange.length === 0 && (
                  <tr style={{ borderTop: `1px solid ${colors.pageBg}` }}>
                    <td colSpan={loc === 'all' ? 11 : 10} style={{ padding: 18, fontSize: 12, color: colors.muted3 }}>
                      No valet nights recorded in this range — enter one above. Cash + CashApp + Clover make the night's revenue; staff paid and other costs come out of it.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {valetRange.length > 45 && (
            <div style={{ padding: '10px 18px', fontSize: 11, color: colors.muted3, borderTop: `1px solid ${colors.pageBg}` }}>
              Showing the latest 45 of {valetRange.length} nights in this range — narrow the date range to see the rest.
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
          Nights sync automatically from each location's parking sheet every morning (Teranga ATL is connected; other
          venues plug in as their sheets exist) — week-level costs like the lot fee and card fees land on the week's
          last night so months add up. 2025 history came from the workbook. Valet revenue counts in the P&L revenue
          line and the overview headline; staff and costs count as expenses. Click a night to correct it — but nights
          that come from the sheet get overwritten by the next sync, so fix those in the sheet itself.
        </div>
        </MWrap>
      </div>

      {/* ===== INVOICE DETAIL MODAL ===== */}
      <InvoiceModal inv={invModal} locations={locations} profile={profile} users={orgUsers} onClose={() => setInvModal(null)} />

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
