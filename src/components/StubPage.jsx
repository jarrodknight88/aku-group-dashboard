import { Link } from 'react-router-dom'
import AppHeader from './AppHeader.jsx'
import { colors, fonts, layout } from '../theme.js'

/**
 * Placeholder shell for the dashboard levels not yet built out. Keeps the
 * global chrome + navigation consistent so the whole flow is traversable
 * while these screens are stubbed. `children` lets a stub add real content
 * (e.g. the By Location hub's clickable cards).
 */
export default function StubPage({ active, title, blurb, level, children }) {
  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active={active} />
      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '32px 26px 48px' }}>
        {level && (
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', color: colors.muted3, textTransform: 'uppercase' }}>
            {level}
          </div>
        )}
        <div style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 6 }}>
          {title}
        </div>
        {blurb && <div style={{ fontSize: 14, color: colors.muted2, marginTop: 8, maxWidth: 640 }}>{blurb}</div>}

        {children}

        <div
          style={{
            marginTop: 28,
            background: '#fff',
            border: `1px dashed ${colors.borderStrong}`,
            borderRadius: 13,
            padding: '22px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 13, color: colors.muted2 }}>
            This screen is stubbed. The <strong>Location Report</strong> is the fully-built page in this build.
          </div>
          <Link
            to="/locations/atl"
            style={{
              padding: '10px 16px',
              background: colors.brand,
              color: '#fff',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Open Location Report →
          </Link>
        </div>
      </div>
    </div>
  )
}
