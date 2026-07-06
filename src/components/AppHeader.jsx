import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { fetchLocations } from '../data/live.js'
import { fetchNotifications, markNotificationsRead } from '../data/notifications.js'
import { colors, fonts, layout } from '../theme.js'

/**
 * Global top bar (enterprise pass, §11) — compact: brand left, nav right, no
 * date control (the range picker lives in each page's title row).
 * `active` highlights the current tab: 'company' | 'locations' | 'payroll' | 'settings'.
 * Nav dropdowns: By Location lists venues (deep links to their reports);
 * Settings lists Config / Account / Log out — managers see only Account.
 */
// Phones swap the tab bar for a hamburger + right slide-out drawer.
// matchMedia keeps it live across rotation / resize.
function useIsMobile(maxWidth = 760) {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidth}px)`).matches)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = (e) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [maxWidth])
  return mobile
}

export default function AppHeader({ active = 'company' }) {
  const { profile, signOut } = useAuth()
  const [locations, setLocations] = useState([])
  const [menu, setMenu] = useState(null) // 'loc' | 'set' | null
  const mobile = useIsMobile()
  const [drawer, setDrawer] = useState(false)

  // Lock page scroll while the drawer is open.
  useEffect(() => {
    if (!drawer) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [drawer])
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
        {mobile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotificationBell mobile locations={locations} />
            <div
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
              style={{ width: 40, height: 40, borderRadius: 9, border: `1px solid ${colors.border}`, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4.5, cursor: 'pointer' }}
            >
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 17, height: 2, borderRadius: 2, background: colors.ink }} />
              ))}
            </div>
          </div>
        ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: '100%' }}>
        <NotificationBell locations={locations} />
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
        )}
      </div>

      {mobile && drawer && (
        <MobileDrawer
          active={active}
          locations={locations}
          isAdmin={isAdmin}
          signOut={signOut}
          onClose={() => setDrawer(false)}
        />
      )}
    </div>
  )
}

/* @-mention notifications — bell with unread badge; the panel lists who
   tagged you where and deep-links back into the exact thread (expense
   modal, or the void/discount check on its night). Polls every minute. */
function NotificationBell({ locations, mobile = false }) {
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    const load = () => fetchNotifications().then((ns) => live && setNotifs(ns))
    load()
    const t = setInterval(load, 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])

  const unread = notifs.filter((n) => !n.read_at)
  const locCode = (id) => locations.find((l) => l.id === id)?.code?.toLowerCase()

  const openItem = (n) => {
    if (!n.read_at) {
      markNotificationsRead([n.id])
      setNotifs((ns) => ns.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
    }
    setOpen(false)
    if (n.kind === 'invoice_comment' && n.ref?.invoice_id) {
      navigate(`/financials?invoice=${n.ref.invoice_id}`)
    } else if (n.kind === 'vd_note') {
      const q = new URLSearchParams()
      if (n.ref?.kind) q.set('tab', n.ref.kind)
      const code = n.ref?.location_id ? locCode(n.ref.location_id) : null
      if (code) q.set('loc', code)
      if (n.ref?.business_date) q.set('date', n.ref.business_date)
      if (n.ref?.check_guid) q.set('check', n.ref.check_guid)
      navigate(`/void-discount?${q.toString()}`)
    }
  }

  const markAll = () => {
    const ids = unread.map((n) => n.id)
    if (!ids.length) return
    markNotificationsRead(ids)
    const now = new Date().toISOString()
    setNotifs((ns) => ns.map((x) => (x.read_at ? x : { ...x, read_at: now })))
  }

  const when = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        style={{ position: 'relative', width: 40, height: 40, borderRadius: 9, border: `1px solid ${colors.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={colors.muted1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread.length > 0 && (
          <div style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: colors.red, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unread.length > 9 ? '9+' : unread.length}
          </div>
        )}
      </div>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 80 }} />}
      {open && (
        <div
          style={
            mobile
              ? { position: 'fixed', left: 8, right: 8, top: 64, zIndex: 81, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, boxShadow: '0 16px 40px rgba(16,44,88,0.22)', maxHeight: 'calc(100vh - 90px)', overflowY: 'auto' }
              : { position: 'absolute', right: 0, top: 46, zIndex: 81, width: 340, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, boxShadow: '0 16px 40px rgba(16,44,88,0.18)', maxHeight: 440, overflowY: 'auto' }
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: `1px solid ${colors.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Notifications</div>
            {unread.length > 0 && (
              <div onClick={markAll} style={{ fontSize: 11, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>
                Mark all read
              </div>
            )}
          </div>
          {notifs.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12, color: colors.muted3 }}>Nothing yet — you'll see it here when someone @mentions you.</div>
          ) : (
            notifs.map((n) => (
              <div key={n.id} onClick={() => openItem(n)} className="menu-item" style={{ display: 'flex', gap: 10, padding: '11px 14px', borderTop: `1px solid ${colors.pageBg}`, cursor: 'pointer' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: n.read_at ? 'transparent' : colors.brand }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: n.read_at ? 500 : 700, color: colors.ink }}>
                    {n.actor_name || 'Someone'} mentioned you {n.kind === 'invoice_comment' ? 'on an expense' : 'on a void/discount'}
                  </div>
                  {n.preview && (
                    <div style={{ fontSize: 11.5, color: colors.muted2, marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {n.preview}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: colors.muted3, marginTop: 3 }}>{when(n.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* Right slide-out menu (phones) — dim backdrop, full-height panel, grouped
   links mirroring the desktop dropdowns. Any navigation closes it. */
function MobileDrawer({ active, locations, isAdmin, signOut, onClose }) {
  const groupLabel = (text) => (
    <div style={{ padding: '14px 18px 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: colors.muted3, textTransform: 'uppercase' }}>{text}</div>
  )
  const link = (isActive, indent) => ({
    display: 'block',
    padding: `12px 18px 12px ${indent ? 30 : 18}px`,
    fontSize: 14.5,
    fontWeight: isActive ? 700 : 600,
    color: isActive ? colors.brand : colors.ink,
    background: isActive ? '#EDF2F9' : 'transparent',
    borderLeft: isActive ? `3px solid ${colors.brand}` : '3px solid transparent',
  })
  const divider = <div style={{ height: 1, background: '#F0F2F5', margin: '6px 0' }} />

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(16,44,88,0.42)', animation: 'fade-in 0.18s ease' }} />
      <div
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 91, width: 'min(320px, 86vw)', background: '#fff', boxShadow: '-16px 0 40px rgba(16,44,88,0.25)', display: 'flex', flexDirection: 'column', animation: 'drawer-in 0.22s ease' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontFamily: fonts.serif, fontWeight: 600, fontSize: 17 }}>Menu</div>
          <div onClick={onClose} aria-label="Close menu" style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: colors.muted1, cursor: 'pointer' }}>
            ✕
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
          <Link to="/" onClick={onClose} style={{ ...link(active === 'company'), marginTop: 6 }}>
            Company
          </Link>
          {groupLabel('By Location')}
          <Link to="/locations" onClick={onClose} style={link(active === 'locations')}>
            All locations
          </Link>
          {locations.map((l) =>
            l.status === 'active' ? (
              <Link key={l.id} to={`/locations/${l.code.toLowerCase()}`} onClick={onClose} style={link(false, true)}>
                {l.name}
              </Link>
            ) : (
              <div key={l.id} style={{ ...link(false, true), color: colors.muted4 }}>{l.name} · coming soon</div>
            ),
          )}
          {divider}
          <Link to="/payroll" onClick={onClose} style={link(active === 'payroll')}>
            Payroll
          </Link>
          {groupLabel('Financials')}
          <Link to="/financials" onClick={onClose} style={link(active === 'financials')}>
            All locations
          </Link>
          {locations.map(
            (l) =>
              l.status === 'active' && (
                <Link key={l.id} to={`/financials?loc=${l.code.toLowerCase()}`} onClick={onClose} style={link(false, true)}>
                  {l.name}
                </Link>
              ),
          )}
          <Link to="/financials/submit" onClick={onClose} style={{ ...link(false, true), color: colors.brand, fontWeight: 700 }}>
            ＋ Submit invoice
          </Link>
          {groupLabel('Settings')}
          {isAdmin && (
            <Link to="/settings" onClick={onClose} style={link(active === 'settings', true)}>
              Config
            </Link>
          )}
          <Link to="/settings?tab=account" onClick={onClose} style={link(false, true)}>
            Account
          </Link>
        </div>
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: 10 }}>
          <div
            onClick={() => {
              onClose()
              signOut()
            }}
            style={{ padding: '12px 8px', borderRadius: 8, textAlign: 'center', fontSize: 14, fontWeight: 700, color: colors.red, cursor: 'pointer' }}
          >
            Log out
          </div>
        </div>
      </div>
    </>
  )
}
