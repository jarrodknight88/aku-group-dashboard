import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle, { Crumbs, dataThrough } from '../components/PageTitle.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import SectionHeader from '../components/SectionHeader.jsx'
import { card, StatRow, RankRow, ModeToggle, DAY_LABELS } from '../components/cards.jsx'
import { colors, layout } from '../theme.js'
import { useRange } from '../state/RangeContext.jsx'
import { fetchLocations, fetchDaily, fetchDim, sumDaily, groupSum } from '../data/live.js'
import { fetchVdNotes, addVdNote, vdLineKey } from '../data/financials.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { fromStr, fmtRange } from '../lib/dates.js'
import { PERSONAL_VOID_TARGET, PERSONAL_DISCOUNT_TARGET } from '../config.js'

/** §11 responsive pattern: wide tables collapse to stacked cards below 720px. */
function useWindowWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  useEffect(() => {
    const onR = () => setW(window.innerWidth)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])
  return w
}

/* Void & Discount drill-down (handoff §10) — reached from the Void % /
   Discount % tiles in Money Protected (?tab=void|discount, plus &loc=<code>
   from a location report). Live: totals and % of sales from daily_metrics,
   reason/type and by-employee accountability from daily_void_discounts
   (written by the Toast pull), own-sales denominators from
   daily_server_sales, roles from daily_server_categories. */

const NAMES = { atl: 'Teranga ATL', clt: 'Teranga CLT', afro: 'Afro District' }
const BAR_PALETTE = [colors.brand, colors.brandTint1, colors.brandTint2, '#9DB6DC', colors.brandTint3, colors.brandTint4]

const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')

export default function VoidDiscountDetail() {
  const [params] = useSearchParams()
  const { range } = useRange()
  const { profile } = useAuth()
  const [tabOv, setTabOv] = useState(null) // tab clicks override ?tab=
  const [mode, setMode] = useState('dollar')
  const [empSort, setEmpSort] = useState(null) // null = follow toggle; else {key, dir}
  const [query, setQuery] = useState('')
  const isMobile = useWindowWidth() < 720

  const [locations, setLocations] = useState([])
  const [metrics, setMetrics] = useState([])
  const [vd, setVd] = useState([])
  const [serverSales, setServerSales] = useState([])
  const [serverCats, setServerCats] = useState([])
  const [notes, setNotes] = useState([]) // void_discount_notes rows for the range
  const [noteModal, setNoteModal] = useState(null) // a vd line row, or null
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  let loc = (params.get('loc') || '').toLowerCase()
  if (!NAMES[loc]) loc = ''
  const scope = loc || 'all'
  const urlTab = (params.get('tab') || 'void').toLowerCase()
  const tab = tabOv || (urlTab === 'discount' ? 'discount' : 'void')
  const isVoid = tab === 'void'
  const kind = isVoid ? 'void' : 'discount'
  const target = isVoid ? PERSONAL_VOID_TARGET : PERSONAL_DISCOUNT_TARGET
  const noun = isVoid ? 'Voided' : 'Discounted'

  const locByCode = Object.fromEntries(locations.map((l) => [l.code.toLowerCase(), l]))
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]))
  const scopeId = loc ? (locByCode[loc]?.id ?? null) : null

  useEffect(() => {
    let live = true
    setLoading(true)
    fetchLocations()
      .then((locs) => {
        if (!live) return null
        setLocations(locs)
        const id = loc ? (locs.find((l) => l.code.toLowerCase() === loc)?.id ?? null) : null
        return Promise.all([
          fetchDaily(id, range.start, range.end),
          fetchDim('daily_void_discounts', id, range.start, range.end),
          fetchDim('daily_server_sales', id, range.start, range.end),
          fetchDim('daily_server_categories', id, range.start, range.end),
          fetchVdNotes(id, range.start, range.end),
        ])
      })
      .then((res) => {
        if (!live || !res) return
        const [m, v, ss, sc, ns] = res
        setMetrics(m)
        setVd(v)
        setServerSales(ss)
        setServerCats(sc)
        setNotes(ns)
        setLoading(false)
        setError('')
      })
      .catch((e) => {
        if (!live) return
        setError(e.message)
        setLoading(false)
      })
    return () => { live = false }
  }, [loc, range.start, range.end])

  const totals = useMemo(() => sumDaily(metrics), [metrics])
  const kindRows = vd.filter((r) => r.kind === kind)
  const empRaw = kindRows.filter((r) => r.dim === 'employee')
  const itemRaw = kindRows.filter((r) => r.dim === 'item')
  const hasDetail = vd.length > 0

  // Real dollars from daily_metrics (calibrated against Toast reports);
  // qty comes from the detail rows.
  const totalD = isVoid ? totals.voids : totals.discounts
  const totalQ = empRaw.reduce((a, r) => a + Number(r.qty), 0)
  const pctVal = isVoid ? totals.voidPct : totals.discountPct
  const overTarget = pctVal != null && pctVal > (isVoid ? 1 : 3)

  // Peak weekday from daily_metrics.
  const peak = useMemo(() => {
    const by = new Array(7).fill(0)
    for (const r of metrics) {
      const amt = Number(isVoid ? r.voids_amount : r.discounts_amount) || 0
      by[(fromStr(r.business_date).getDay() + 6) % 7] += amt
    }
    const max = Math.max(...by)
    if (!(max > 0)) return null
    return [DAY_LABELS[by.indexOf(max)], `${fmt(max)} ${noun.toLowerCase()}`]
  }, [metrics, isVoid, noun])

  // Role lookup: dominant job title from daily_server_categories.
  const roleOf = useMemo(() => {
    const m = new Map()
    for (const r of serverCats) {
      if (r.job_title && !m.has(r.employee_guid)) m.set(r.employee_guid, r.job_title)
    }
    return m
  }, [serverCats])

  // Own-sales denominators per employee.
  const ownSales = useMemo(() => {
    const m = new Map()
    for (const r of serverSales) {
      const k = `${r.location_id}|${r.employee_guid}`
      m.set(k, (m.get(k) ?? 0) + (Number(r.net_sales) || 0))
    }
    return m
  }, [serverSales])

  const emps = useMemo(
    () =>
      groupSum(
        empRaw,
        (r) => `${r.location_id}|${r.employee_guid ?? r.employee_name ?? 'unknown'}`,
        ['amount', 'qty'],
        (r) => ({
          name: r.employee_name || 'Unattributed',
          guid: r.employee_guid,
          locId: r.location_id,
        }),
      ).map((e) => {
        const sales = ownSales.get(`${e.locId}|${e.guid}`) ?? 0
        return {
          name: e.name,
          role: roleOf.get(e.guid) || '—',
          locId: e.locId,
          d: e.amount,
          q: e.qty,
          pct: sales > 0 ? (e.amount / sales) * 100 : null,
        }
      }),
    [empRaw, ownSales, roleOf],
  )
  const empTotal = { d: emps.reduce((a, r) => a + r.d, 0), q: emps.reduce((a, r) => a + r.q, 0) }

  const reasonRows = useMemo(() => {
    const grouped = groupSum(empRaw, (r) => r.reason || 'No reason recorded', ['amount', 'qty'])
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
    const maxV = Math.max(...grouped.map((r) => (mode === 'dollar' ? r.amount : r.qty)), 1)
    return grouped.map((r, i) => {
      const v = mode === 'dollar' ? r.amount : r.qty
      return {
        label: r.key,
        color: BAR_PALETTE[i % BAR_PALETTE.length],
        pct: Math.round((v / maxV) * 100),
        val: mode === 'dollar' ? fmt(v) : `${Math.round(r.qty)} ${isVoid ? 'items' : 'checks'}`,
      }
    })
  }, [empRaw, mode, isVoid])

  const items = useMemo(
    () =>
      groupSum(itemRaw, (r) => r.item_name || 'Unknown item', ['amount', 'qty'])
        .map((it) => ({
          name: it.key,
          v: mode === 'dollar' ? it.amount : it.qty,
          val: mode === 'dollar' ? fmt(it.amount) : `${Math.round(it.qty)}×`,
        }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 5),
    [itemRaw, mode],
  )

  /* ---- line detail + notes ----
     One line per (night, employee, reason) — the finest grain the Toast pull
     stores. Notes attach to that identity and survive re-imports. */
  const noteKeyOf = (locId, date, k, empKey, reason) => `${locId}|${date}|${k}|${empKey}|${reason ?? ''}`
  const notesByLine = useMemo(() => {
    const m = new Map()
    for (const nte of notes) {
      const k = noteKeyOf(nte.location_id, nte.business_date, nte.kind, nte.employee_key, nte.reason)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(nte)
    }
    return m
  }, [notes])
  const detailLines = useMemo(
    () =>
      empRaw
        .filter((r) => !query || (r.employee_name ?? '').toLowerCase().includes(query.toLowerCase()))
        .map((r) => ({ ...r, noteList: notesByLine.get(noteKeyOf(r.location_id, r.business_date, r.kind, vdLineKey(r), r.reason ?? '')) ?? [] }))
        .sort((a, b) => (a.business_date < b.business_date ? 1 : a.business_date > b.business_date ? -1 : b.amount - a.amount)),
    [empRaw, query, notesByLine],
  )
  const modalNotes = noteModal
    ? notesByLine.get(noteKeyOf(noteModal.location_id, noteModal.business_date, noteModal.kind, vdLineKey(noteModal), noteModal.reason ?? '')) ?? []
    : []
  const saveNote = async () => {
    if (!noteModal || !noteText.trim() || savingNote) return
    setSavingNote(true)
    try {
      const saved = await addVdNote({
        locationId: noteModal.location_id,
        businessDate: noteModal.business_date,
        kind: noteModal.kind,
        employeeKey: vdLineKey(noteModal),
        reason: noteModal.reason ?? '',
        note: noteText,
        authorId: profile?.id,
        authorName: profile?.full_name || profile?.email || null,
      })
      setNotes((ns) => [...ns, saved])
      setNoteText('')
    } catch (e) {
      setError(e.message)
    }
    setSavingNote(false)
  }

  const empVal = (e, key) => (key === 'name' ? e.name.toLowerCase() : key === 'role' ? e.role.toLowerCase() : (e[key] ?? -1))
  const sortKey = empSort?.key ?? (mode === 'dollar' ? 'd' : 'q')
  const sortDir = empSort?.dir ?? 'desc'
  const sortedEmps = [...emps]
    .filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const va = empVal(a, sortKey)
      const vb = empVal(b, sortKey)
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb
      return sortDir === 'asc' ? c : -c
    })
  const overCount = emps.filter((e) => e.pct != null && e.pct > target).length
  const EmpTh = ({ k, left, wide, children }) => (
    <th
      onClick={() => setEmpSort((s) => ({ key: k, dir: s?.key === k && s.dir === 'desc' ? 'asc' : k === 'name' || k === 'role' ? 'asc' : 'desc' }))}
      style={{ textAlign: left ? 'left' : 'right', padding: wide ? '12px 18px' : '12px 12px', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {children}
      <span style={{ color: colors.brand }}>{sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )

  const statusPill = (over) => (
    <span style={{ fontSize: 11, fontWeight: 700, color: over ? colors.red : colors.greenDark, background: over ? colors.redBg : colors.greenBg, padding: '3px 9px', borderRadius: 5, whiteSpace: 'nowrap' }}>
      {over ? 'Over target' : 'Within'}
    </span>
  )

  const tabStyle = (active) => ({
    padding: '7px 16px',
    borderRadius: 6,
    background: active ? colors.brand : 'transparent',
    color: active ? '#fff' : colors.muted1,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  })

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active={loc ? 'locations' : 'company'} />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <Crumbs
          items={[
            loc ? { label: NAMES[loc], to: `/locations/${loc}` } : { label: 'Company', to: '/' },
            { label: 'Money Protected' },
            { label: 'Void & Discount Detail' },
          ]}
        />
        <PageTitle
          title="Void & Discount Detail"
          meta={<>The "why" behind the numbers · {loc ? NAMES[loc] : 'org-wide'} · {loading ? 'Loading…' : dataThrough(metrics)} · Toast</>}
          right={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <DateRangePicker />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
                  <div onClick={() => setTabOv('void')} style={tabStyle(isVoid)}>Voids</div>
                  <div onClick={() => setTabOv('discount')} style={tabStyle(!isVoid)}>Discounts</div>
                </div>
                <ModeToggle mode={mode} onChange={setMode} labels={['By $', 'By Qty']} />
              </div>
            </div>
          }
        />

        {error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 18 }}>
            Couldn't load data: {error}
          </div>
        )}
        {!loading && !error && !hasDetail && (
          <div style={{ padding: '10px 14px', background: '#FBF3DC', borderRadius: 9, color: '#8A6D1A', fontSize: 12, fontWeight: 600, marginBottom: 18 }}>
            Totals below are live, but reason / item / employee detail hasn't been imported for this range yet — re-run the
            Toast backfill (Actions → "Toast daily pull") to populate it.
          </div>
        )}

        {/* ===== SUMMARY STRIP ===== */}
        <StatRow
          size={26}
          min={170}
          style={{ marginBottom: 20 }}
          items={[
            {
              label: `Total ${noun}`,
              value: mode === 'dollar' ? fmt(totalD) : Math.round(totalQ),
              sub: (
                <span style={{ fontSize: 11, color: colors.muted3 }}>
                  {mode === 'dollar'
                    ? `${Math.round(totalQ)} ${isVoid ? 'voided items' : 'discounts applied'}`
                    : `${isVoid ? 'items voided · ' : 'discounts applied · '}${fmt(totalD)}`}
                </span>
              ),
            },
            {
              label: '% of Sales',
              value: pctVal == null ? '—' : `${pctVal.toFixed(1)}%`,
              valueColor: pctVal == null ? colors.ink : overTarget ? colors.red : colors.greenDark,
              sub: (
                <span style={{ fontSize: 11, color: overTarget ? colors.red : colors.muted3, fontWeight: 600 }}>
                  Target &lt; {isVoid ? 1 : 3}% · {pctVal == null ? 'awaiting data' : overTarget ? 'over' : 'within'}
                </span>
              ),
            },
            {
              label: 'Peak Day',
              value: peak ? peak[0] : '—',
              sub: <span style={{ fontSize: 11, color: colors.muted3 }}>{peak ? `${peak[1]} — highest of the range` : 'No data in range'}</span>,
            },
            {
              label: 'Employees Over Target',
              value: overCount,
              valueColor: overCount > 0 ? colors.red : colors.ink,
              sub: (
                <span style={{ fontSize: 11, color: overCount > 0 ? colors.red : colors.muted3, fontWeight: 600 }}>
                  {overCount > 0 ? `vs ${target}% personal target` : 'All within target'}
                </span>
              ),
            },
          ]}
        />

        {/* ===== BREAKDOWN + TOP ITEMS ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{isVoid ? 'Voids by Reason' : 'Discounts by Type'}</div>
            {reasonRows.length === 0 ? (
              <div style={{ padding: '24px 0', color: colors.muted3, fontSize: 12 }}>No {isVoid ? 'void' : 'discount'} detail in this range.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {reasonRows.map((rr) => (
                  <div key={rr.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ width: 210, fontSize: 12, color: '#3A4150' }}>{rr.label}</span>
                    <div style={{ flex: 1, height: 10, background: colors.pageBg, borderRadius: 5 }}>
                      <div style={{ width: `${rr.pct}%`, height: '100%', background: rr.color, borderRadius: 5 }} />
                    </div>
                    <span className="tnum" style={{ width: 70, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{rr.val}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
              {isVoid
                ? 'Reasons come from the Toast void-reason field at entry.'
                : 'Types come from the discount buttons configured in Toast.'}
            </div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{isVoid ? 'Most Voided Items' : 'Most Discounted Items'}</div>
            {items.length === 0 ? (
              <div style={{ padding: '24px 0', color: colors.muted3, fontSize: 12 }}>No item detail in this range.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {items.map((it, i) => (
                  <RankRow key={it.name} n={i + 1} name={it.name} val={it.val} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ===== BY EMPLOYEE ===== */}
        <SectionHeader
          title={`${isVoid ? 'Voids' : 'Discounts'} by Employee`}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employee"
                style={{ padding: '7px 11px', border: `1px solid ${colors.borderStrong}`, borderRadius: 8, fontSize: 12, fontFamily: 'inherit', width: 160 }}
              />
              <span style={{ fontSize: 12, color: colors.muted3, whiteSpace: 'nowrap' }}>Target: &lt; {target}% of own sales</span>
            </div>
          }
        />
        {sortedEmps.length === 0 ? (
          <div style={{ ...card, color: colors.muted3, fontSize: 12 }}>
            {loading ? 'Loading…' : `No per-employee ${isVoid ? 'void' : 'discount'} detail in this range.`}
          </div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sortedEmps.map((e) => {
              const over = e.pct != null && e.pct > target
              return (
                <div key={`${e.locId}|${e.name}`} style={{ ...card, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{e.name}</span>{' '}
                      <span style={{ color: colors.muted3, fontSize: 11 }}>· {e.role} · {locById[e.locId]?.name ?? ''}</span>
                    </div>
                    {statusPill(over)}
                  </div>
                  <div className="tnum" style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <span><span style={{ color: colors.muted3 }}>{noun} </span><b>{fmt(e.d)}</b></span>
                    <span><span style={{ color: colors.muted3 }}>{isVoid ? 'Items ' : 'Checks '}</span><b>{Math.round(e.q)}</b></span>
                    <span style={{ color: over ? colors.red : colors.greenDark, fontWeight: 700 }}>
                      {e.pct == null ? 'no sales recorded' : `${e.pct.toFixed(1)}% of own sales`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                    <EmpTh k="name" left wide>Employee</EmpTh>
                    <EmpTh k="role" left>Role</EmpTh>
                    <th style={{ textAlign: 'left', padding: '12px 12px', fontWeight: 600 }}>Location</th>
                    <EmpTh k="d">{noun} $</EmpTh>
                    <EmpTh k="q">{isVoid ? 'Items' : 'Checks'}</EmpTh>
                    <EmpTh k="pct">% of Own Sales</EmpTh>
                    <th style={{ padding: '12px 18px', fontWeight: 600, textAlign: 'left' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEmps.map((e) => {
                    const over = e.pct != null && e.pct > target
                    return (
                      <tr key={`${e.locId}|${e.name}`} style={{ borderTop: `1px solid ${colors.pageBg}`, textAlign: 'right' }}>
                        <td style={{ textAlign: 'left', padding: '13px 18px', fontWeight: 600 }}>{e.name}</td>
                        <td style={{ textAlign: 'left', padding: '13px 12px', color: colors.muted2 }}>{e.role}</td>
                        <td style={{ textAlign: 'left', padding: '13px 12px' }}>{locById[e.locId]?.name ?? ''}</td>
                        <td style={{ padding: '13px 12px', fontWeight: 700 }}>{fmt(e.d)}</td>
                        <td style={{ padding: '13px 12px' }}>{Math.round(e.q)}</td>
                        <td style={{ padding: '13px 12px', fontWeight: 700, color: e.pct == null ? colors.muted3 : over ? colors.red : colors.greenDark, background: over ? colors.redBg : 'transparent' }}>
                          {e.pct == null ? '—' : `${e.pct.toFixed(1)}%`}
                        </td>
                        <td style={{ padding: '13px 18px', textAlign: 'left' }}>{statusPill(over)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: colors.muted3, marginTop: 14 }}>
          % of own sales = {noun.toLowerCase()} dollars ÷ that employee's net sales for the period. Rows over the personal
          target are tinted; investigate via the exception list for check-level detail.
        </div>

        {/* ===== LINE DETAIL & NOTES ===== */}
        <SectionHeader
          style={{ marginTop: 30 }}
          title={`${isVoid ? 'Void' : 'Discount'} Lines & Notes`}
          right={<span style={{ fontSize: 12, color: colors.muted3 }}>One line per night · employee · reason — click a line to read or add notes</span>}
        />
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {detailLines.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12, color: colors.muted3 }}>
              {loading ? 'Loading…' : `No ${isVoid ? 'void' : 'discount'} lines in this range.`}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
                <thead>
                  <tr style={{ background: colors.panelGray, color: colors.muted2 }}>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600 }}>Night</th>
                    {!loc && <th style={{ textAlign: 'left', padding: '11px 12px', fontWeight: 600 }}>Location</th>}
                    <th style={{ textAlign: 'left', padding: '11px 12px', fontWeight: 600 }}>Employee</th>
                    <th style={{ textAlign: 'left', padding: '11px 12px', fontWeight: 600 }}>{isVoid ? 'Reason' : 'Discount type'}</th>
                    <th style={{ textAlign: 'right', padding: '11px 12px', fontWeight: 600 }}>Amount</th>
                    <th style={{ textAlign: 'right', padding: '11px 12px', fontWeight: 600 }}>{isVoid ? 'Items' : 'Checks'}</th>
                    <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600 }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLines.slice(0, 80).map((r, i) => (
                    <tr key={i} className="row-hover" onClick={() => { setNoteModal(r); setNoteText('') }} style={{ borderTop: `1px solid ${colors.pageBg}`, cursor: 'pointer' }}>
                      <td style={{ padding: '11px 18px', whiteSpace: 'nowrap' }}>{fmtRange(r.business_date, r.business_date)}</td>
                      {!loc && <td style={{ padding: '11px 12px' }}>{locById[r.location_id]?.name ?? ''}</td>}
                      <td style={{ padding: '11px 12px', fontWeight: 600 }}>{r.employee_name || 'Unattributed'}</td>
                      <td style={{ padding: '11px 12px', color: colors.muted1 }}>{r.reason || 'No reason recorded'}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 700 }}>{fmt(r.amount)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>{Math.round(r.qty)}</td>
                      <td style={{ padding: '11px 18px' }}>
                        {r.noteList.length > 0 ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: colors.brand, background: '#E8EEF6', padding: '3px 9px', borderRadius: 999 }}>
                            {r.noteList.length} note{r.noteList.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: colors.muted3 }}>＋ add note</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {detailLines.length > 80 && (
            <div style={{ padding: '10px 18px', fontSize: 11, color: colors.muted3, borderTop: `1px solid ${colors.pageBg}` }}>
              Showing the latest 80 of {detailLines.length} lines — narrow the date range or search an employee to see the rest.
            </div>
          )}
        </div>
      </div>

      {/* ===== LINE NOTES MODAL ===== */}
      {noteModal && (
        <div onClick={() => setNoteModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(16,44,88,0.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 15, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div className="serif" style={{ fontSize: 19, fontWeight: 600 }}>
                  {noteModal.kind === 'void' ? 'Void' : 'Discount'} · {noteModal.employee_name || 'Unattributed'}
                </div>
                <div style={{ fontSize: 12, color: colors.muted2, marginTop: 4 }}>
                  {fmtRange(noteModal.business_date, noteModal.business_date)} · {locById[noteModal.location_id]?.name ?? ''} ·{' '}
                  <b>{fmt(noteModal.amount)}</b> · {Math.round(noteModal.qty)} {noteModal.kind === 'void' ? 'items' : 'checks'}
                </div>
                <div style={{ fontSize: 12, color: '#8A6D1A', background: '#FBF3DC', padding: '4px 10px', borderRadius: 6, marginTop: 8, display: 'inline-block', fontWeight: 600 }}>
                  {noteModal.reason || 'No reason recorded'}
                </div>
              </div>
              <span onClick={() => setNoteModal(null)} style={{ fontSize: 18, color: colors.muted3, cursor: 'pointer', lineHeight: 1, padding: 4 }}>✕</span>
            </div>

            <div style={{ margin: '16px 0 10px', fontSize: 11, fontWeight: 700, color: colors.muted3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Notes</div>
            {modalNotes.length === 0 ? (
              <div style={{ fontSize: 12, color: colors.muted3, padding: '4px 0 10px' }}>No notes yet — add what you find out below.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                {modalNotes.map((nte) => (
                  <div key={nte.id} style={{ background: colors.panelGray, borderRadius: 10, padding: '10px 13px' }}>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{nte.note}</div>
                    <div style={{ fontSize: 10.5, color: colors.muted3, marginTop: 5 }}>
                      {nte.author_name || 'Unknown'} · {new Date(nte.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <textarea
              rows={2}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What happened? (kitchen error confirmed, spoke to the server, photo link from GroupMe…)"
              style={{ width: '100%', padding: '10px 12px', border: `1px solid ${colors.borderStrong}`, borderRadius: 9, fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div
              onClick={saveNote}
              style={{ marginTop: 10, padding: '10px 0', textAlign: 'center', borderRadius: 9, fontSize: 13, fontWeight: 700, background: noteText.trim() && !savingNote ? colors.brand : colors.brandTint4, color: '#fff', cursor: noteText.trim() && !savingNote ? 'pointer' : 'default' }}
            >
              {savingNote ? 'Saving…' : 'Add note'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
