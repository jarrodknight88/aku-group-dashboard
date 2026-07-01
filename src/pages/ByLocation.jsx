import { Link } from 'react-router-dom'
import StubPage from '../components/StubPage.jsx'
import { colors, fonts } from '../theme.js'

// Minimal location hub so the Location Report is reachable through real nav.
const LOCATIONS = [
  { code: 'atl', name: 'Teranga ATL', city: 'Atlanta, GA', net: '$142,300', status: 'On track', ok: true },
  { code: 'clt', name: 'Teranga CLT', city: 'Charlotte, NC', net: '$118,900', status: 'Needs attention', ok: false },
  { code: 'afro', name: 'Afro District', city: 'Atlanta, GA', net: '$96,400', status: 'On track', ok: true },
]

export default function ByLocation() {
  return (
    <StubPage
      active="locations"
      level="Level 1.5 — By Location"
      title="By Location"
      blurb="Pick a venue to open its Location Report. Teranga ATL is the fully-built report in this slice."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16, marginTop: 24 }}>
        {LOCATIONS.map((l) => (
          <Link
            key={l.code}
            to={`/locations/${l.code}`}
            style={{
              background: '#fff',
              border: `1px solid ${colors.border}`,
              borderRadius: 13,
              padding: 20,
              display: 'block',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 600 }}>{l.name}</div>
                <div style={{ fontSize: 12, color: colors.muted3, marginTop: 2 }}>{l.city}</div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: 6,
                  color: l.ok ? colors.greenDark : colors.red,
                  background: l.ok ? colors.greenBg : colors.redBg,
                }}
              >
                {l.status}
              </span>
            </div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: 28, fontWeight: 500, marginTop: 14 }}>
              {l.net}
            </div>
            <div style={{ fontSize: 12, color: colors.muted2, marginTop: 4 }}>Net sales · this week</div>
          </Link>
        ))}
        {/* R Thomas — opening soon */}
        <div
          style={{
            background: '#fff',
            border: `1px dashed ${colors.borderStrong}`,
            borderRadius: 13,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 600, color: colors.muted4 }}>R Thomas</div>
          <div style={{ fontSize: 12, color: colors.muted3, marginTop: 4 }}>Opening soon · reopening 4th venue</div>
        </div>
      </div>
    </StubPage>
  )
}
