import { Link } from 'react-router-dom'
import { colors, fonts, layout } from '../theme.js'

/**
 * Global top bar — persists across every level of the dashboard.
 * `active` highlights the current nav tab: 'company' | 'locations' | 'settings'.
 * `comparedTo` sets the comparison-window label under the date picker.
 */
export default function AppHeader({
  active = 'company',
  comparedTo = 'Sep 8–14',
  maxWidth = layout.maxWidth,
  showDatePicker = true,
}) {
  const tabBase = {
    padding: '8px 18px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
  }
  const tab = (isActive) => ({
    ...tabBase,
    color: isActive ? '#fff' : colors.muted1,
    background: isActive ? colors.brand : 'transparent',
  })

  return (
    <div
      style={{
        background: colors.white,
        borderBottom: `1px solid ${colors.border}`,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 26px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: colors.brand,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: fonts.serif,
                fontWeight: 600,
                fontSize: 20,
              }}
            >
              A
            </div>
            <div style={{ lineHeight: 1.08 }}>
              <div
                style={{
                  fontFamily: fonts.serif,
                  fontWeight: 600,
                  fontSize: 19,
                  letterSpacing: '-0.01em',
                }}
              >
                Aku Group
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: colors.muted3,
                  fontWeight: 500,
                  letterSpacing: '0.03em',
                }}
              >
                OPERATIONS DASHBOARD
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: colors.panelGray,
              padding: 4,
              borderRadius: 9,
            }}
          >
            <Link to="/" style={tab(active === 'company')}>
              Company
            </Link>
            <Link to="/locations" style={tab(active === 'locations')}>
              By Location
            </Link>
            <Link to="/settings" style={tab(active === 'settings')}>
              Settings
            </Link>
          </div>
        </div>
        {showDatePicker && (
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '9px 15px',
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: 9,
              background: '#fff',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span style={{ color: colors.muted2 }}>📅</span> This Week{' '}
            <span style={{ color: colors.muted3 }}>▾</span>
          </div>
          <div style={{ fontSize: 11, color: colors.muted3, marginTop: 6 }}>
            Compared to:{' '}
            <span style={{ color: colors.muted1, fontWeight: 600 }}>{comparedTo}</span>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
