import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { supabase } from '../lib/supabase.js'
import { colors, fonts, layout } from '../theme.js'

/* ----------
   The location list is live from Supabase (RLS-scoped: a manager sees only
   their venue). The per-card metrics below stay demo data until the Toast
   import pipeline lands — keyed by location code.
   Chips ordered Food · Liquor · Labor · Void · Disc (per the design brief);
   status: 'good' | 'bad' | 'none' (liquor has no fixed target → neutral).
---------- */

const DEMO_METRICS = {
  ATL: {
    onTrack: true,
    net: '$142,300',
    delta: '▲ 6.8%',
    covers: '3,180',
    avg: '$44.75 avg',
    chips: [
      { label: 'Food 29.4%', status: 'good' },
      { label: 'Liquor 22.0%', status: 'none' },
      { label: 'Labor 26.5%', status: 'good' },
      { label: 'Void 0.7%', status: 'good' },
      { label: 'Disc 2.8%', status: 'good' },
    ],
  },
  CLT: {
    onTrack: false,
    net: '$98,600',
    delta: '▲ 4.1%',
    covers: '2,420',
    avg: '$40.74 avg',
    chips: [
      { label: 'Food 31.2%', status: 'bad' },
      { label: 'Liquor 23.6%', status: 'none' },
      { label: 'Labor 29.4%', status: 'bad' },
      { label: 'Void 0.9%', status: 'good' },
      { label: 'Disc 3.9%', status: 'bad' },
    ],
  },
  AFRO: {
    onTrack: true,
    net: '$76,400',
    delta: '▲ 9.2%',
    covers: '2,050',
    avg: '$37.27 avg',
    chips: [
      { label: 'Food 28.1%', status: 'good' },
      { label: 'Liquor 21.8%', status: 'none' },
      { label: 'Labor 27.8%', status: 'good' },
      { label: 'Void 0.8%', status: 'good' },
      { label: 'Disc 2.6%', status: 'good' },
    ],
  },
}

const CITY_LABELS = { Atlanta: 'Atlanta, GA', Charlotte: 'Charlotte, NC' }

/* ---------- pieces ---------- */

function TargetChip({ label, status }) {
  const dot = status === 'good' ? colors.green : status === 'bad' ? colors.redBright : colors.muted4
  const text = status === 'bad' ? colors.red : status === 'none' ? colors.muted2 : '#3A4150'
  const bg = status === 'bad' ? colors.redBg : colors.panelGray
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        color: text,
        background: bg,
        padding: '4px 9px',
        borderRadius: 6,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />
      {label}
    </span>
  )
}

function StatusPill({ onTrack }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 700,
        color: onTrack ? colors.greenDark : colors.red,
        background: onTrack ? colors.greenBg : colors.redBg,
        padding: '5px 10px',
        borderRadius: 20,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: onTrack ? colors.green : colors.redBright,
        }}
      />
      {onTrack ? 'On track' : 'Needs attention'}
    </span>
  )
}

function LocationCard({ loc }) {
  return (
    <Link
      to={`/locations/${loc.code.toLowerCase()}`}
      className="loc-card"
      style={{
        display: 'block',
        background: '#fff',
        border: `1px solid ${colors.border}`,
        borderRadius: 15,
        padding: 22,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600 }}>{loc.name}</div>
          <div style={{ fontSize: 12, color: colors.muted3, marginTop: 2 }}>{loc.city}</div>
        </div>
        <StatusPill onTrack={loc.onTrack} />
      </div>
      <div style={{ display: 'flex', gap: 18, margin: '20px 0 18px' }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.muted3, fontWeight: 600 }}>
            Net Sales
          </div>
          <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 23, fontWeight: 600, marginTop: 3 }}>
            {loc.net}
          </div>
          <div style={{ fontSize: 11, color: colors.greenDark, fontWeight: 600, marginTop: 2 }}>{loc.delta}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.muted3, fontWeight: 600 }}>
            Covers
          </div>
          <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 23, fontWeight: 600, marginTop: 3 }}>
            {loc.covers}
          </div>
          <div style={{ fontSize: 11, color: colors.muted3, marginTop: 2 }}>{loc.avg}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingTop: 16, borderTop: `1px solid ${colors.pageBg}` }}>
        {loc.chips.map((c) => (
          <TargetChip key={c.label} {...c} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.brand }}>View report →</span>
      </div>
    </Link>
  )
}

/* ---------- page ---------- */

const NO_DATA_METRICS = {
  onTrack: true,
  net: '—',
  delta: 'no data yet',
  covers: '—',
  avg: '',
  chips: [],
}

export default function ByLocation() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('locations')
      .select('id, name, code, city, status')
      .order('created_at')
      .then(({ data }) => {
        setRows(data ?? [])
        setLoading(false)
      })
  }, [])

  const active = rows.filter((r) => r.status === 'active')
  const comingSoon = rows.filter((r) => r.status === 'coming_soon')

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="locations" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '30px 26px 48px' }}>
        {/* Title row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 20,
            marginBottom: 24,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.05 }}>
              Locations
            </div>
            <div style={{ fontSize: 13, color: colors.muted3, marginTop: 5 }}>
              {loading ? 'Loading…' : `${active.length} active`} · $317,300 net this week ·{' '}
              <span style={{ color: colors.greenDark, fontWeight: 600 }}>▲ 6.2%</span> vs last week
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: 9,
              background: '#fff',
              fontSize: 13,
              fontWeight: 700,
              color: colors.brand,
            }}
          >
            + Add Location
          </div>
        </div>

        {/* Location cards — live list, RLS-scoped to what this user can see */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {active.map((row) => (
            <LocationCard
              key={row.id}
              loc={{
                code: row.code,
                name: row.name,
                city: CITY_LABELS[row.city] || row.city || '',
                ...(DEMO_METRICS[row.code] || NO_DATA_METRICS),
              }}
            />
          ))}

          {/* Opening-soon venues */}
          {comingSoon.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'flex-start',
                background: '#F7F8FA',
                border: '1px dashed #CDD4DE',
                borderRadius: 15,
                padding: 22,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                <div>
                  <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600, color: colors.muted2 }}>{row.name}</div>
                  <div style={{ fontSize: 12, color: '#A6ADB8', marginTop: 2 }}>
                    {CITY_LABELS[row.city] || row.city || ''}
                  </div>
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              border: '1px dashed #CDD4DE',
              borderRadius: 15,
              padding: 22,
              minHeight: 150,
              color: colors.muted2,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: '#fff',
                border: `1px solid ${colors.borderStrong}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: colors.brand,
                fontWeight: 400,
              }}
            >
              +
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.brand }}>Add Location</div>
            <div style={{ fontSize: 11, color: colors.muted3 }}>Connect a venue's Toast exports</div>
          </div>
        </div>
      </div>
    </div>
  )
}
