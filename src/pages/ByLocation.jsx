import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle from '../components/PageTitle.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import { colors, fonts, layout } from '../theme.js'
import { useRange } from '../state/RangeContext.jsx'
import { fetchLocations, fetchDaily, fetchOrgTargets, sumDaily } from '../data/live.js'
import { fmtMoney, fmtMoneyC, fmtInt, fmtPct, deltaPct, fmtDelta } from '../lib/format.js'

/* Live location hub: real totals per venue for the selected range. Venues
   with no data yet (credentials pending) show an awaiting state instead of
   numbers. Chips ordered Food · Liquor · Labor · Void · Disc per the brief —
   food/labor chips stay neutral until invoice/labor sources exist; liquor
   colors against its editable target once cost data flows. */

const CITY_LABELS = { Atlanta: 'Atlanta, GA', Charlotte: 'Charlotte, NC' }

function TargetChip({ label, status }) {
  const dot = status === 'good' ? colors.green : status === 'bad' ? colors.redBright : colors.muted4
  const text = status === 'bad' ? colors.red : status === 'none' ? colors.muted2 : '#3A4150'
  const bg = status === 'bad' ? colors.redBg : colors.panelGray
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: text, background: bg, padding: '4px 9px', borderRadius: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />
      {label}
    </span>
  )
}

function StatusPill({ status }) {
  // status: 'good' | 'bad' | 'pending'
  const cfg =
    status === 'bad'
      ? { fg: colors.red, bg: colors.redBg, dot: colors.redBright, label: 'Needs attention' }
      : status === 'pending'
        ? { fg: colors.muted2, bg: '#E7EAEF', dot: colors.muted4, label: 'Awaiting data' }
        : { fg: colors.greenDark, bg: colors.greenBg, dot: colors.green, label: 'On track' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: cfg.fg, background: cfg.bg, padding: '5px 10px', borderRadius: 20 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot }} />
      {cfg.label}
    </span>
  )
}

export default function ByLocation() {
  const { range, compare } = useRange()
  const [locations, setLocations] = useState([])
  const [rows, setRows] = useState([])
  const [prevRows, setPrevRows] = useState([])
  const [targets, setTargets] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setLoading(true)
    Promise.all([
      fetchLocations(),
      fetchDaily(null, range.start, range.end),
      fetchDaily(null, compare.start, compare.end),
      fetchOrgTargets(),
    ])
      .then(([locs, cur, prev, tg]) => {
        if (!live) return
        setLocations(locs)
        setRows(cur)
        setPrevRows(prev)
        setTargets(tg)
        setLoading(false)
      })
      .catch((e) => {
        if (!live) return
        setError(e.message)
        setLoading(false)
      })
    return () => {
      live = false
    }
  }, [range.start, range.end, compare.start, compare.end])

  const perLocation = useMemo(() => {
    const m = new Map()
    for (const l of locations) {
      const cur = sumDaily(rows.filter((r) => r.location_id === l.id))
      const prev = sumDaily(prevRows.filter((r) => r.location_id === l.id))
      m.set(l.id, { cur, prev })
    }
    return m
  }, [locations, rows, prevRows])

  const active = locations.filter((l) => l.status === 'active')
  const comingSoon = locations.filter((l) => l.status === 'coming_soon')
  const orgTotals = useMemo(() => sumDaily(rows), [rows])
  const orgPrev = useMemo(() => sumDaily(prevRows), [prevRows])
  const orgDelta = deltaPct(orgTotals.net, orgPrev.net)

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="locations" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <PageTitle
          title="Locations"
          meta={
            loading ? 'Loading…' : (
              <>
                {active.length} active · {fmtMoney(orgTotals.net)} net this period
                {orgDelta != null && (
                  <>
                    {' · '}
                    <span style={{ color: orgDelta >= 0 ? colors.greenDark : colors.red, fontWeight: 600 }}>{fmtDelta(orgDelta)}</span>{' '}
                    vs prior period
                  </>
                )}
              </>
            )
          }
          right={
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <DateRangePicker />
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', border: `1px solid ${colors.borderStrong}`, borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 700, color: colors.brand }}>
                + Add Location
              </div>
            </div>
          }
        />

        {error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 18 }}>
            Couldn't load data: {error}
          </div>
        )}

        {/* Location cards */}
        <div className="grid-collapse" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {active.map((l) => {
            const d = perLocation.get(l.id)
            const t = d?.cur
            const hasData = (t?.days ?? 0) > 0
            const delta = hasData ? deltaPct(t.net, d.prev.net) : null
            const voidBad = t?.voidPct != null && t.voidPct >= (targets.void_pct ?? 1)
            const discBad = t?.discountPct != null && t.discountPct >= (targets.discount_pct ?? 3)
            const liqBad = t?.liquorPct != null && t.liquorPct >= (targets.liquor_pct ?? 24)
            const status = !hasData ? 'pending' : voidBad || discBad ? 'bad' : 'good'

            return (
              <Link
                key={l.id}
                to={`/locations/${l.code.toLowerCase()}`}
                className="loc-card"
                style={{ display: 'block', background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 15, padding: 22 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600 }}>{l.name}</div>
                    <div style={{ fontSize: 12, color: colors.muted3, marginTop: 2 }}>{CITY_LABELS[l.city] || l.city || ''}</div>
                  </div>
                  <StatusPill status={status} />
                </div>

                <div style={{ display: 'flex', gap: 18, margin: '20px 0 18px' }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.muted3, fontWeight: 600 }}>Net Sales</div>
                    <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 23, fontWeight: 600, marginTop: 3 }}>
                      {hasData ? fmtMoney(t.net) : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: delta == null ? colors.muted3 : delta >= 0 ? colors.greenDark : colors.red, fontWeight: 600, marginTop: 2 }}>
                      {delta == null ? (hasData ? 'no comparison' : 'connect Toast to activate') : fmtDelta(delta)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.muted3, fontWeight: 600 }}>Covers</div>
                    <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 23, fontWeight: 600, marginTop: 3 }}>
                      {hasData ? fmtInt(t.covers) : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: colors.muted3, marginTop: 2 }}>{hasData && t.avgCheck != null ? `${fmtMoneyC(t.avgCheck)} avg` : ''}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingTop: 16, borderTop: `1px solid ${colors.pageBg}` }}>
                  <TargetChip label={`Food ${fmtPct(t?.foodPct)}`} status="none" />
                  <TargetChip label={`Liquor ${fmtPct(t?.liquorPct)}`} status={t?.liquorPct == null ? 'none' : liqBad ? 'bad' : 'good'} />
                  <TargetChip label={`Labor ${fmtPct(t?.laborPct)}`} status="none" />
                  <TargetChip label={`Void ${fmtPct(t?.voidPct)}`} status={!hasData ? 'none' : voidBad ? 'bad' : 'good'} />
                  <TargetChip label={`Disc ${fmtPct(t?.discountPct)}`} status={!hasData ? 'none' : discBad ? 'bad' : 'good'} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: colors.brand }}>View report →</span>
                </div>
              </Link>
            )
          })}

          {/* Opening-soon venues */}
          {comingSoon.map((l) => (
            <div key={l.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', background: '#F7F8FA', border: '1px dashed #CDD4DE', borderRadius: 15, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                <div>
                  <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600, color: colors.muted2 }}>{l.name}</div>
                  <div style={{ fontSize: 12, color: '#A6ADB8', marginTop: 2 }}>{CITY_LABELS[l.city] || l.city || ''}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.muted2, background: '#E7EAEF', padding: '5px 10px', borderRadius: 20 }}>
                  Opening soon
                </span>
              </div>
              <div style={{ fontSize: 12, color: colors.muted3, marginTop: 18, lineHeight: 1.5 }}>
                Reporting will activate automatically once Toast exports begin flowing on reopening.
              </div>
            </div>
          ))}

          {/* Add location card */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, background: 'transparent', border: '1px dashed #CDD4DE', borderRadius: 15, padding: 22, minHeight: 150, color: colors.muted2, cursor: 'pointer' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', border: `1px solid ${colors.borderStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: colors.brand, fontWeight: 400 }}>
              +
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.brand }}>Add Location</div>
            <div style={{ fontSize: 11, color: colors.muted3 }}>Connect a venue's Toast credentials</div>
          </div>
        </div>
      </div>
    </div>
  )
}
