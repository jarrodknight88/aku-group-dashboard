import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { fetchLocations } from '../data/live.js'
import { colors, fonts, layout } from '../theme.js'

/**
 * Global top bar (enterprise pass, §11) — compact: brand left, nav right, no
 * date control (the range picker lives in each page's title row).
 * `active` highlights the current tab: 'company' | 'locations' | 'payroll' | 'settings'.
 * Nav dropdowns: By Location lists venues (deep links to their reports);
 * Settings lists Config / Account / Log out — managers see only Account.
 */
export default function AppHeader({ active = 'company' }) {
  const { profile, signOut } = useAuth()
  const [locations, setLocations] = useState([])
  const [menu, setMenu] = useState(null) // 'loc' | 'set' | null
  // Small close delay so the menu survives the cursor briefly leaving the
  // hover area (e.g. crossing between trigger and panel, or overshooting).
  const closeTimer = useRef(null)
  const openMenu = (name) => {
    clearTimeout(closeTimer.current)
    setMenu(name)
  }
  const closeSoon = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setMenu(null), 200)
  }
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  useEffect(() => {
    fetchLocations().then(setLocations).catch(() => setLocations([]))
  }, [])

  const isAdmin = ['owner', 'admin'].includes(profile?.role)

  const tab = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '7px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: isActive ? 700 : 600,
    color: isActive ? '#fff' : colors.muted1,
    background: isActive ? colors.brand : 'transparent',
    whiteSpace: 'nowrap',
  })
  const caret = <span style={{ fontSize: 9, color: colors.muted3 }}>▾</span>
  // The wrapper starts flush at the trigger's bottom edge (top: '100%') and
  // carries the visual gap as PADDING, so the cursor never crosses dead space
  // between trigger and panel — that gap is what made the menus flicker away.
  const menuWrap = (side) => ({ position: 'absolute', [side]: 0, top: '100%', paddingTop: 6, zIndex: 70 })
  const menuBox = (side) => ({
    minWidth: side === 'left' ? 200 : 180,
    background: '#fff',
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    boxShadow: '0 12px 32px rgba(16,44,88,0.16)',
    padding: 6,
    display: 'flex',
    flexDirection: 'column',
  })
  const item = (bold, color) => ({
    padding: '8px 12px',
    borderRadius: 7,
    fontSize: 12,
    fontWeight: bold ? 700 : 600,
    color: color ?? '#3A4150',
  })
  const divider = <div style={{ height: 1, background: '#F0F2F5', margin: '4px 6px' }} />

  return (
    <div style={{ background: colors.white, borderBottom: `1px solid ${colors.border}`, position: 'sticky', top: 0, zIndex: 10 }}>
      <div
        style={{
          maxWidth: layout.maxWidth,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px 16px',
          padding: '12px 26px',
          flexWrap: 'wrap',
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: colors.brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.serif, fontWeight: 600, fontSize: 18 }}>
            A
          </div>
          <div style={{ lineHeight: 1.08 }}>
            <div style={{ fontFamily: fonts.serif, fontWeight: 600, fontSize: 17, letterSpacing: '-0.01em' }}>Aku Group</div>
            <div style={{ fontSize: 10, color: colors.muted3, fontWeight: 500, letterSpacing: '0.03em' }}>OPERATIONS</div>
          </div>
        </Link>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, background: colors.panelGray, padding: 3, borderRadius: 8, maxWidth: '100%' }}>
          <Link to="/" style={tab(active === 'company')}>
            Company
          </Link>
          <div style={{ position: 'relative' }} onMouseEnter={() => openMenu('loc')} onMouseLeave={closeSoon}>
            <Link to="/locations" style={tab(active === 'locations')}>
              By Location {caret}
            </Link>
            {menu === 'loc' && (
              <div style={menuWrap('left')}>
                <div style={menuBox('left')}>
                  <Link to="/locations" className="menu-item" style={item(true, colors.ink)}>All locations</Link>
                  {divider}
                  {locations.map((l) =>
                    l.status === 'active' ? (
                      <Link key={l.id} to={`/locations/${l.code.toLowerCase()}`} className="menu-item" style={item(false)}>
                        {l.name}
                      </Link>
                    ) : (
                      <div key={l.id} style={{ ...item(false, colors.muted4), cursor: 'default' }}>{l.name} · coming soon</div>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
          <Link to="/payroll" style={tab(active === 'payroll')}>
            Payroll
          </Link>
          <div style={{ position: 'relative' }} onMouseEnter={() => openMenu('fin')} onMouseLeave={closeSoon}>
            <Link to="/financials" style={tab(active === 'financials')}>
              Financials {caret}
            </Link>
            {menu === 'fin' && (
              <div style={menuWrap('left')}>
                <div style={menuBox('left')}>
                  <Link to="/financials" className="menu-item" style={item(true, colors.ink)}>All locations</Link>
                  {divider}
                  {locations.map((l) =>
                    l.status === 'active' ? (
                      <Link key={l.id} to={`/financials?loc=${l.code.toLowerCase()}`} className="menu-item" style={item(false)}>
                        {l.name}
                      </Link>
                    ) : (
                      <div key={l.id} style={{ ...item(false, colors.muted4), cursor: 'default' }}>{l.name} · coming soon</div>
                    ),
                  )}
                  {divider}
                  <Link to="/financials/submit" className="menu-item" style={item(true, colors.brand)}>＋ Submit invoice</Link>
                </div>
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }} onMouseEnter={() => openMenu('set')} onMouseLeave={closeSoon}>
            <Link to={isAdmin ? '/settings' : '/settings?tab=account'} style={tab(active === 'settings')}>
              Settings {caret}
            </Link>
            {menu === 'set' && (
              <div style={menuWrap('right')}>
                <div style={menuBox('right')}>
                  {isAdmin && (
                    <Link to="/settings" className="menu-item" style={item(false)}>Config</Link>
                  )}
                  <Link to="/settings?tab=account" className="menu-item" style={item(false)}>Account</Link>
                  {divider}
                  <div onClick={signOut} className="menu-item menu-item-danger" style={{ ...item(true, colors.red), cursor: 'pointer' }}>
                    Log out
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
