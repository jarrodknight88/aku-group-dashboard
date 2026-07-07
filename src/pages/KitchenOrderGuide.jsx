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

/** Epoch ms for `dateStr` 19:00 in ET (DST-aware via offset probe). */
function cutoffEpoch(dateStr) {
  const probe = new Date(dateStr + 'T12:00:00Z')
  const etHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: ET, hour12: false, hour: '2-digit' }).format(probe))
  const offsetHours = (12 - etHour + 24) % 24
  return new Date(dateStr + 'T19:00:00Z').getTime() + offsetHours * 3600_000
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
const VENDOR_ORDER = ['US Foods', 'Sysco']
const vendorRank = (v) => {
  const i = VENDOR_ORDER.indexOf(v)
  return i === -1 ? 99 : i
}

export default function KitchenOrderGuide() {
  const { profile } = useAuth()
  const isMobile = useIsMobile()
  const [locations, setLocations] = useState([])
  const [locId, setLocId] = useState(null)
  const [target, setTarget] = useState(() => addDaysStr(todayET(), 1))
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
    fetchOrderGuide(locId, target)
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
      await generateOrderGuide(locId, target)
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

  const isSat = dowOf(target) === 6
  const isDepot = dowOf(target) === 0 // Sunday: top-up only (Sat order covers it)
  const orderDay = addDaysStr(target, -1)
  const cutoff = cutoffEpoch(orderDay)
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
    const span = coversSunday ? `${fmtRange(guide.target_date, guide.target_date)} + Sunday` : fmtRange(target, target)
    const header = isDepot
      ? `Restaurant Depot top-up — ${fmtRange(target, target)} (shop Saturday)`
      : `${vendor ?? 'Full'} order — deliver ${span} (order by 7pm ${fmtRange(orderDay, orderDay)})`
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

  const controls = (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: isMobile ? 'stretch' : 'center' }}>
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
        <Crumbs items={[{ label: 'Company', to: '/' }, { label: 'Inventory' }, { label: 'Kitchen' }]} />
        <PageTitle
          title="Kitchen Order Guide"
          meta={<>Forecast-driven ordering · rolling day-of-week demand from Toast · POC — portions are chef-verifiable estimates</>}
          right={controls}
        />

        {/* cutoff / coverage banner */}
        {isDepot ? (
          <div style={{ padding: '11px 15px', background: '#FBF3DC', border: '1px solid #EAD9A8', borderRadius: 11, color: '#8A6D1A', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            🛒 Sunday demand is already covered by <b>Saturday's delivery</b>. This is a <b>Restaurant Depot top-up list</b> for
            gaps only — shop Saturday; quantities in retail units.
          </div>
        ) : (
          <div style={{ padding: '11px 15px', background: '#E8EEF6', border: `1px solid ${colors.brandTint4}`, borderRadius: 11, color: colors.brand, fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
            Delivery {fmtRange(target, target)}
            {isSat && <> — <b>covers Saturday + Sunday demand</b> (no Sunday deliveries)</>}
            {' '}· order by <b>7:00 PM ET {fmtRange(orderDay, orderDay)}</b>
            {remaining ? <> · <span className="tnum">{remaining}</span> left</> : <> · <span style={{ color: colors.red }}>cutoff passed</span></>}
          </div>
        )}

        {error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div onClick={confirmed || working ? undefined : generate} style={btn(true, confirmed || working)}>
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
              { label: coversSunday ? 'Order lines · Sat + Sun' : isDepot ? 'Run list items' : 'Order lines', value: guide.lines.length, sub: <span>buffer {Math.round(Number(guide.buffer_pct) * 100)}% while portions are estimates</span> },
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
          Forecast = rolling 6-week day-of-week average from the nightly Toast import (June seed as fallback). Saturday
          guides include Sunday demand so Depot runs stay minimal. Vendor assignments are illustrative for the POC —
          seafood is shown under Sysco; the real mapping is a per-ingredient edit. Portions marked <b>EST</b> are
          estimates pending chef verification; the suggested-vs-adjusted gap is what tunes the model.
        </div>
      </div>
    </div>
  )
}
