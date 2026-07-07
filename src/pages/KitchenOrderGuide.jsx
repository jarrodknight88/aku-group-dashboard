import { useEffect, useMemo, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle, { Crumbs } from '../components/PageTitle.jsx'
import { card } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { fetchLocations } from '../data/live.js'
import { generateOrderGuide, fetchOrderGuide, saveLinePacks, confirmOrderGuide } from '../data/kitchen.js'
import { useIsMobile, MStatGrid, MList, MLocSelect } from '../components/mobile.jsx'
import { fmtRange } from '../lib/dates.js'

/* Kitchen Order Guide (POC). Pick a delivery date, generate, adjust pack
   counts per vendor, confirm. Saturday guides forecast Saturday + Sunday
   demand combined (no Sunday deliveries — keep Depot runs to a minimum);
   the Sunday view is a top-up-only Depot list. Lines group by vendor
   (US Foods / Sysco — assignments illustrative until mapped for real). */

const ET = 'America/New_York'

function todayET() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(new Date())
}

function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Epoch ms for `dateStr` at `hour`:00 in ET (DST-aware via offset probe). */
function cutoffEpoch(dateStr, hour) {
  const probe = new Date(dateStr + 'T12:00:00Z')
  const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: ET, hour12: false, hour: '2-digit' }).format(probe))
  const offsetHours = (12 - etHour + 24) % 24
  return new Date(dateStr + 'T' + String(hour).padStart(2, '0') + ':00:00Z').getTime() + offsetHours * 3600_000
}

/** Next date (>= from+1) whose DOW is in `dows`. */
function nextDeliveryDate(fromStr, dows) {
  let d = addDaysStr(fromStr, 1)
  for (let i = 0; i < 7; i++) {
    if (dows.includes(dowOf(d))) return d
    d = addDaysStr(d, 1)
  }
  return d
}

/* Per-department behavior: the engine is shared; cadence and cutoffs differ.
   Kitchen orders daily (7 PM ET day before; Saturday covers Sunday; Sunday
   is a Depot top-up). Bar orders weekly per distributor: Thu = Georgia
   Crown + Empire (order Wed 3 PM), Fri = Republic National (order Thu 3 PM). */
const DEPTS = {
  kitchen: {
    title: 'Kitchen Order Guide',
    crumb: 'Kitchen',
    cutoffHour: 19,
    cutoffLabel: '7:00 PM ET',
    deliveryDows: null,
    meta: 'Forecast-driven ordering · rolling day-of-week demand from Toast · POC — portions are chef-verifiable estimates',
  },
  bar: {
    title: 'Bar Order Guide',
    crumb: 'Bar',
    cutoffHour: 15,
    cutoffLabel: '3:00 PM ET',
    deliveryDows: [4, 5],
    deliveryVendors: { 4: 'Georgia Crown · Empire', 5: 'Republic National' },
    meta: 'Weekly per-distributor ordering · pours estimated from your drink sales · POC — bar manager verifies specs',
  },
}

function fmtCountdown(ms) {
  if (ms <= 0) return null
  const h = Math.floor(ms / 3600_000)
  const m = Math.floor((ms % 3600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const dowOf = (dateStr) => new Date(dateStr + 'T12:00:00Z').getUTCDay() // 0 = Sunday

// US Foods and Sysco lead; anything else (house-made, unverified) trails.
const VENDOR_ORDER = ['US Foods', 'Sysco', 'Georgia Crown', 'Empire', 'Republic National']
const vendorRank = (v) => {
  const i = VENDOR_ORDER.indexOf(v)
  return i === -1 ? 99 : i
}

export default function OrderGuidePage({ department = 'kitchen' }) {
  const dept = DEPTS[department]
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [locations, setLocations] = useState([])
  const [locId, setLocId] = useState(null)
  const [target, setTarget] = useState(() => (dept.deliveryDows ? nextDeliveryDate(todayET(), dept.deliveryDows) : addDaysStr(todayET(), 1)))
  const [guide, setGuide] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(null) // vendor key or '_all'
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetchLocations()
      .then((locs) => {
        setLocations(locs)
        const atl = locs.find((l) => l.status === 'active' && l.code === 'ATL') ?? locs.find((l) => l.status === 'active')
        setLocId((id) => id ?? atl?.id ?? null)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!locId) return
    let live = true
    setLoading(true)
    fetchOrderGuide(locId, target, department)
      .then((g) => {
        if (!live) return
        setGuide(g)
        setError('')
        setLoading(false)
      })
      .catch((e) => {
        if (!live) return
        setError(e.message)
        setLoading(false)
      })
    return () => { live = false }
  }, [locId, target, working])

  const generate = async () => {
    if (working || !locId) return
    setWorking(true)
    setError('')
    try {
      await generateOrderGuide(locId, target, department)
    } catch (e) {
      setError(e.message)
    }
    setWorking(false)
  }

  const confirm = async () => {
    if (!guide || guide.status !== 'draft' || working) return
    setWorking(true)
    try {
      await confirmOrderGuide(guide.id, profile?.id)
    } catch (e) {
      setError(e.message)
    }
    setWorking(false)
  }

  const adjust = (line, packs) => {
    const v = Math.max(0, Math.round(Number(packs) || 0))
    setGuide((g) => ({ ...g, lines: g.lines.map((l) => (l.id === line.id ? { ...l, adjusted_packs: v } : l)) }))
    saveLinePacks(line.id, v).catch((e) => setError(e.message))
  }

  const isBar = department === 'bar'
  const isSat = !isBar && dowOf(target) === 6
  const isDepot = !isBar && dowOf(target) === 0 // Sunday: top-up only (Sat order covers it)
  const offDay = isBar && !dept.deliveryDows.includes(dowOf(target)) // no bar delivery this weekday
  const orderDay = addDaysStr(target, -1)
  const cutoff = cutoffEpoch(orderDay, dept.cutoffHour)
  const remaining = fmtCountdown(cutoff - now)
  const confirmed = guide && guide.status !== 'draft'
  const estCount = guide?.lines.filter((l) => l.is_estimate).length ?? 0
  const coversSunday = guide?.covers_through && guide.covers_through !== guide.target_date

  const vendorGroups = useMemo(() => {
    if (!guide) return []
    const m = new Map()
    for (const l of guide.lines) {
      const v = l.ingredients.vendor && l.ingredients.vendor !== 'Verify' ? l.ingredients.vendor : 'House / verify source'
      if (!m.has(v)) m.set(v, [])
      m.get(v).push(l)
    }
    return [...m.entries()]
      .sort((a, b) => vendorRank(a[0]) - vendorRank(b[0]) || a[0].localeCompare(b[0]))
      .map(([vendor, lines]) => ({ vendor, lines }))
  }, [guide])

  const depotQty = (l) => {
    if (l.forecast_need == null) return `${l.adjusted_packs} × ${l.ingredients.pack_label}`
    const buy = Math.ceil(Number(l.forecast_need) * (1 + Number(l.buffer_pct)))
    return `${buy} ${l.ingredients.pack_unit}`
  }

  const copyText = async (vendor) => {
    if (!guide) return
    const groups = vendor ? vendorGroups.filter((g) => g.vendor === vendor) : vendorGroups
    const span = isBar
      ? `${fmtRange(guide.target_date, guide.target_date)} (covers thru ${fmtRange(guide.covers_through, guide.covers_through)})`
      : coversSunday ? `${fmtRange(guide.target_date, guide.target_date)} + Sunday` : fmtRange(target, target)
    const header = isDepot
      ? `Restaurant Depot top-up — ${fmtRange(target, target)} (shop Saturday)`
      : `${vendor ?? 'Full'} order — deliver ${span} (order by ${dept.cutoffLabel} ${fmtRange(orderDay, orderDay)})`
    const out = [header]
    for (const g of groups) {
      if (!vendor && groups.length > 1) out.push(`\n${g.vendor}:`)
      for (const l of g.lines) {
        if (!(l.adjusted_packs > 0 || l.forecast_need != null)) continue
        out.push(isDepot ? `• ${l.ingredients.name}: ${depotQty(l)}` : `• ${l.ingredients.name}: ${l.adjusted_packs} × ${l.ingredients.pack_label}`)
      }
    }
    try {
      await navigator.clipboard.writeText(out.join('\n'))
      setCopied(vendor ?? '_all')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setError('Could not copy — select and copy manually.')
    }
  }

  const activeLocs = locations.filter((l) => l.status === 'active')
  const btn = (primary, disabled) => ({
    padding: isMobile ? '12px 0' : '10px 18px',
    flex: isMobile ? 1 : undefined,
    textAlign: 'center',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    background: primary ? (disabled ? colors.brandTint4 : colors.brand) : '#fff',
    color: primary ? '#fff' : colors.brand,
    border: primary ? 'none' : `1px solid ${colors.borderStrong}`,
    opacity: disabled && !primary ? 0.55 : 1,
  })
  const estBadge = <span style={{ marginLeft: 7, fontSize: 9.5, fontWeight: 700, color: '#8A6D1A', background: '#FBF3DC', padding: '2px 6px', borderRadius: 5 }}>EST</span>

  const vendorHeader = (g) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 8px' }}>
      <span style={{ fontFamily: fonts.serif, fontSize: 16.5, fontWeight: 600 }}>{g.vendor}</span>
      <span style={{ fontSize: 11, color: colors.muted3 }}>{g.lines.length} line{g.lines.length === 1 ? '' : 's'}</span>
      <span style={{ flex: 1 }} />
      <span onClick={() => copyText(g.vendor)} style={{ fontSize: 11.5, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>
        {copied === g.vendor ? '✓ Copied' : 'Copy list'}
      </span>
    </div>
  )

  const nextOf = (dow) => {
    let d = addDaysStr(todayET(), 1)
    for (let i = 0; i < 7; i++) {
      if (dowOf(d) === dow) return d
      d = addDaysStr(d, 1)
    }
    return d
  }

  const controls = (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: isMobile ? 'stretch' : 'center' }}>
      {isBar && (
        <div style={{ display: 'flex', gap: 6 }}>
          {dept.deliveryDows.map((dw) => {
            const d = nextOf(dw)
            const active = dowOf(target) === dw
            return (
              <div
                key={dw}
                onClick={() => setTarget(d)}
                style={{ flex: isMobile ? 1 : undefined, textAlign: 'center', padding: isMobile ? '10px 8px' : '8px 13px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: active ? colors.brand : '#fff', color: active ? '#fff' : colors.muted1, border: `1px solid ${active ? colors.brand : colors.borderStrong}` }}
              >
                {dw === 4 ? 'Thu — GA Crown · Empire' : 'Fri — Republic'}
              </div>
            )
          })}
        </div>
      )}
      <input
        type="date"
        value={target}
        onChange={(e) => e.target.value && setTarget(e.target.value)}
        min={todayET()}
        style={{ padding: isMobile ? '11px 13px' : '9px 12px', border: `1px solid ${colors.borderStrong}`, borderRadius: 10, fontSize: isMobile ? 16 : 13, fontFamily: 'inherit', background: '#fff' }}
      />
      {activeLocs.length > 1 && (
        <MLocSelect value={locId ?? ''} onChange={setLocId} options={activeLocs.map((l) => ({ value: l.id, label: l.name }))} />
      )}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="inventory" />
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <Crumbs items={[{ label: 'Company', to: '/' }, { label: 'Inventory' }, { label: dept.crumb }]} />
        <PageTitle title={dept.title} meta={<>{dept.meta}</>} right={controls} />

        {/* cutoff / coverage banner */}
        {isBar && offDay ? (
          <div style={{ padding: '11px 15px', background: '#FBF3DC', border: '1px solid #EAD9A8', borderRadius: 11, color: '#8A6D1A', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            No bar deliveries on {new Date(target + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}s — pick <b>Thursday</b> (Georgia Crown · Empire, order Wed 3 PM) or <b>Friday</b> (Republic National, order Thu 3 PM).
          </div>
        ) : isBar ? (
          <div style={{ padding: '11px 15px', background: '#E8EEF6', border: `1px solid ${colors.brandTint4}`, borderRadius: 11, color: colors.brand, fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            {dept.deliveryVendors[dowOf(target)]} delivery {fmtRange(target, target)} — <b>covers the week through {fmtRange(addDaysStr(target, 6), addDaysStr(target, 6))}</b>
            {' '}· order by <b>{dept.cutoffLabel} {fmtRange(orderDay, orderDay)}</b>
            {remaining ? <> · <span className="tnum">{remaining}</span> left</> : <> · <span style={{ color: colors.red }}>cutoff passed</span></>}
          </div>
        ) : isDepot ? (
          <div style={{ padding: '11px 15px', background: '#FBF3DC', border: '1px solid #EAD9A8', borderRadius: 11, color: '#8A6D1A', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            🛒 Sunday demand is already covered by <b>Saturday's delivery</b>. This is a <b>Restaurant Depot top-up list</b> for
            gaps only — shop Saturday; quantities in retail units.
          </div>
        ) : (
          <div style={{ padding: '11px 15px', background: '#E8EEF6', border: `1px solid ${colors.brandTint4}`, borderRadius: 11, color: colors.brand, fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            Delivery {fmtRange(target, target)}
            {isSat && <> — <b>covers Saturday + Sunday demand</b> (no Sunday deliveries)</>}
            {' '}· order by <b>{dept.cutoffLabel} {fmtRange(orderDay, orderDay)}</b>
            {remaining ? <> · <span className="tnum">{remaining}</span> left</> : <> · <span style={{ color: colors.red }}>cutoff passed</span></>}
          </div>
        )}

        {error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div onClick={confirmed || working || offDay ? undefined : generate} style={btn(true, confirmed || working || offDay)}>
            {working ? 'Working…' : guide ? (confirmed ? 'Confirmed' : 'Regenerate') : 'Generate order guide'}
          </div>
          {guide && !confirmed && (
            <div onClick={confirm} style={btn(false, working)}>
              Confirm order
            </div>
          )}
          {guide && (
            <div onClick={() => copyText(null)} style={btn(false, false)}>
              {copied === '_all' ? '✓ Copied' : isDepot ? 'Copy run list' : 'Copy all vendors'}
            </div>
          )}
          {guide && (
            <span style={{ fontSize: 11.5, color: colors.muted3 }}>
              {confirmed
                ? `Confirmed ${guide.confirmed_at ? new Date(guide.confirmed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''} — quantities frozen`
                : `Draft · generated ${new Date(guide.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
            </span>
          )}
        </div>

        {guide && (
          <MStatGrid
            style={{ marginBottom: 6, maxWidth: isMobile ? undefined : 560 }}
            items={[
              { label: isBar ? 'Order lines · full week' : coversSunday ? 'Order lines · Sat + Sun' : isDepot ? 'Run list items' : 'Order lines', value: guide.lines.length, sub: <span>buffer {Math.round(Number(guide.buffer_pct) * 100)}% while {isBar ? 'pours' : 'portions'} are estimates</span> },
              { label: 'Estimate-based lines', value: estCount, sub: <span>chef verification burns these down</span> },
            ]}
          />
        )}

        {loading ? (
          <div style={{ padding: '30px 0', color: colors.muted3, fontSize: 13 }}>Loading…</div>
        ) : !guide ? (
          <div style={{ ...card, color: colors.muted2, fontSize: 13 }}>
            No guide for {fmtRange(target, target)} yet — hit <b>Generate order guide</b> and the forecast math does the rest. Zero input needed.
          </div>
        ) : (
          vendorGroups.map((g) => (
            <div key={g.vendor}>
              {vendorHeader(g)}
              {isMobile ? (
                <MList>
                  {g.lines.map((l, i) => (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i === 0 ? 'none' : `1px solid ${colors.pageBg}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          {l.ingredients.name}
                          {l.is_estimate && estBadge}
                        </div>
                        <div style={{ fontSize: 11, color: colors.muted3, marginTop: 2 }}>
                          {l.forecast_need != null
                            ? `need ${Number(l.forecast_need).toLocaleString()} ${l.ingredients.pack_unit} +${Math.round(Number(l.buffer_pct) * 100)}% · ${l.ingredients.pack_label}`
                            : l.note ?? 'standing item'}
                        </div>
                      </div>
                      {isDepot && l.forecast_need != null ? (
                        <div className="tnum" style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{depotQty(l)}</div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          value={l.adjusted_packs}
                          disabled={confirmed}
                          onChange={(e) => adjust(l, e.target.value)}
                          className="tnum"
                          style={{ width: 64, padding: '9px 6px', border: `1px solid ${l.adjusted_packs !== l.suggested_packs ? colors.brand : colors.borderStrong}`, borderRadius: 9, fontSize: 16, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', background: confirmed ? colors.panelGray : '#fff' }}
                        />
                      )}
                    </div>
                  ))}
                </MList>
              ) : (
                <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
                      <thead>
                        <tr style={{ background: colors.panelGray, color: colors.muted2 }}>
                          <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600 }}>Ingredient</th>
                          <th style={{ textAlign: 'right', padding: '11px 12px', fontWeight: 600 }}>Forecast need</th>
                          <th style={{ textAlign: 'right', padding: '11px 12px', fontWeight: 600 }}>Buffer</th>
                          <th style={{ textAlign: 'left', padding: '11px 12px', fontWeight: 600 }}>Pack</th>
                          <th style={{ textAlign: 'right', padding: '11px 12px', fontWeight: 600 }}>Suggested</th>
                          <th style={{ textAlign: 'right', padding: '11px 12px', fontWeight: 600 }}>{isDepot ? 'Buy (retail)' : 'Order qty'}</th>
                          <th style={{ textAlign: 'left', padding: '11px 18px', fontWeight: 600 }}>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.lines.map((l) => (
                          <tr key={l.id} style={{ borderTop: `1px solid ${colors.pageBg}` }}>
                            <td style={{ padding: '11px 18px', fontWeight: 700 }}>
                              {l.ingredients.name}
                              {l.is_estimate && estBadge}
                              {l.ingredients.is_verified && <span style={{ marginLeft: 7, fontSize: 9.5, fontWeight: 700, color: colors.greenDark, background: colors.greenBg, padding: '2px 6px', borderRadius: 5 }}>VERIFIED</span>}
                            </td>
                            <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                              {l.forecast_need != null ? `${Number(l.forecast_need).toLocaleString()} ${l.ingredients.pack_unit}` : '—'}
                            </td>
                            <td style={{ padding: '11px 12px', textAlign: 'right', color: colors.muted3 }}>
                              {l.forecast_need != null ? `${Math.round(Number(l.buffer_pct) * 100)}%` : '—'}
                            </td>
                            <td style={{ padding: '11px 12px', color: colors.muted1 }}>{l.ingredients.pack_label}</td>
                            <td style={{ padding: '11px 12px', textAlign: 'right', color: colors.muted2 }}>{l.suggested_packs}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              {isDepot && l.forecast_need != null ? (
                                <span style={{ fontWeight: 700 }}>{depotQty(l)}</span>
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  value={l.adjusted_packs}
                                  disabled={confirmed}
                                  onChange={(e) => adjust(l, e.target.value)}
                                  className="tnum"
                                  style={{ width: 68, padding: '6px 6px', border: `1px solid ${l.adjusted_packs !== l.suggested_packs ? colors.brand : colors.borderStrong}`, borderRadius: 7, fontSize: 12.5, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', background: confirmed ? colors.panelGray : '#fff' }}
                                />
                              )}
                            </td>
                            <td style={{ padding: '11px 18px', fontSize: 11, color: colors.muted3, maxWidth: 260 }}>{l.note ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))
        )}

        <div style={{ fontSize: 11, color: colors.muted3, marginTop: 16, lineHeight: 1.55 }}>
          Forecast = rolling 6-week day-of-week average from the nightly Toast import.{' '}
          {isBar
            ? 'Each distributor guide covers a full week from its delivery day. Bottle-service and beer lines deplete exactly; shot and cocktail pours are estimates (1.5 oz shots, 2 oz cocktail base) until the bar manager verifies specs. Brand-to-distributor assignments are ASSUMED pending an invoice check.'
            : 'Saturday guides include Sunday demand so Depot runs stay minimal. Vendor assignments are illustrative for the POC — seafood is shown under Sysco; the real mapping is a per-ingredient edit. Portions marked EST are estimates pending chef verification.'}{' '}
          The suggested-vs-adjusted gap is what tunes the model.
        </div>
      </div>
    </div>
  )
}
