import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { colors, fonts } from '../theme.js'

/* Mobile-first building blocks. Pages keep their desktop layouts and render
   these instead when useIsMobile() — same live data, phone-native shapes:
   a hero stat + compact chip grid up top, tappable card lists instead of
   wide tables, and collapsible sections so the page isn't one endless
   scroll. */

export function useIsMobile(maxWidth = 700) {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidth}px)`).matches)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const onChange = (e) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [maxWidth])
  return mobile
}

/**
 * Compact KPI chips in a 2-up grid. First item can be a hero (spans both
 * columns, bigger figure). items: { label, value, sub?, valueColor?, hero?,
 * to? }.
 */
export function MStatGrid({ items, style }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, ...style }}>
      {items.filter(Boolean).map((it, i) => {
        const Tag = it.to ? Link : 'div'
        return (
          <Tag
            key={i}
            to={it.to}
            style={{
              gridColumn: it.hero ? '1 / -1' : undefined,
              background: '#fff',
              border: `1px solid ${it.alert ? colors.redBorder : colors.border}`,
              borderRadius: 12,
              padding: it.hero ? '15px 16px' : '11px 13px',
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.muted2, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {it.label}
            </div>
            <div className="tnum" style={{ fontFamily: fonts.serif, fontSize: it.hero ? 32 : 21, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 3, color: it.valueColor ?? colors.ink }}>
              {it.value}
            </div>
            {it.sub && <div style={{ marginTop: 4, fontSize: 10.5, color: colors.muted3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{it.sub}</div>}
          </Tag>
        )
      })}
    </div>
  )
}

/** Small green/red delta pill for MStatGrid subs. */
export function MDelta({ delta, up = true }) {
  if (delta == null) return <span style={{ fontSize: 10.5, color: colors.muted3 }}>no comparison</span>
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: up ? colors.greenDark : colors.red, background: up ? colors.greenBg : colors.redBg, padding: '1px 7px', borderRadius: 5 }}>
      {delta}
    </span>
  )
}

/**
 * Collapsible section — tap the header to open/close. Keeps mobile pages
 * short: lead sections open, depth collapsed. `badge` renders next to the
 * title (e.g. a count or an over-target pill).
 */
export function MSection({ title, sub, badge, right, defaultOpen = false, children, style }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 13, marginBottom: 12, overflow: 'hidden', ...style }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 15px', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: fonts.serif, fontSize: 16.5, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</span>
          {sub && <span style={{ marginLeft: 8, fontSize: 11, color: colors.muted3 }}>{sub}</span>}
        </div>
        {badge}
        {right}
        <span style={{ color: colors.muted3, fontSize: 12, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </div>
      {open && <div style={{ padding: '0 15px 15px' }}>{children}</div>}
    </div>
  )
}

/** Count/status pill for MSection badges and MRow tails. */
export function MPill({ children, tone = 'gray' }) {
  const tones = {
    gray: { color: colors.muted2, background: colors.panelGray },
    red: { color: colors.red, background: colors.redBg },
    green: { color: colors.greenDark, background: colors.greenBg },
    brand: { color: colors.brand, background: '#E8EEF6' },
  }
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', ...tones[tone] }}>
      {children}
    </span>
  )
}

/** Card-list container: rows divided by hairlines inside one rounded card. */
export function MList({ children, style }) {
  return <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 13, overflow: 'hidden', ...style }}>{children}</div>
}

/**
 * Tappable list row — the mobile replacement for a table row.
 * left: title (+sub under it) · right: value (+valueSub) · optional pill,
 * chevron when tappable.
 */
export function MRow({ title, sub, value, valueSub, pill, onClick, to, first }) {
  const Tag = to ? Link : 'div'
  const tappable = !!(onClick || to)
  return (
    <Tag
      to={to}
      onClick={onClick}
      className={tappable ? 'row-hover' : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: first ? 'none' : `1px solid ${colors.pageBg}`, cursor: tappable ? 'pointer' : 'default' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: colors.muted3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      {pill}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="tnum" style={{ fontSize: 13.5, fontWeight: 700 }}>{value}</div>
        {valueSub && <div style={{ fontSize: 10.5, color: colors.muted3, marginTop: 1 }}>{valueSub}</div>}
      </div>
      {tappable && <span style={{ color: colors.muted4, fontSize: 14, flexShrink: 0 }}>›</span>}
    </Tag>
  )
}

/**
 * Location dropdown for phones — replaces the desktop tab rows that force
 * horizontal scroll once every venue is listed. Native <select> so the OS
 * picker does the work; 16px font stops iOS from zooming the page.
 */
export function MLocSelect({ value, onChange, options, style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', padding: '12px 38px 12px 14px', border: `1px solid ${colors.borderStrong}`, borderRadius: 11, background: '#fff', fontSize: 16, fontWeight: 600, color: colors.ink, fontFamily: 'inherit', appearance: 'none', WebkitAppearance: 'none' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: colors.muted3, fontSize: 11 }}>▾</span>
    </div>
  )
}

/** Wrap desktop sections in a collapsible on phones; pass-through on desktop. */
export function MWrap({ on, title, sub, defaultOpen = false, children }) {
  if (!on) return children
  return (
    <MSection title={title} sub={sub} defaultOpen={defaultOpen}>
      {children}
    </MSection>
  )
}

/** Full-width segmented control (Voids/Discounts, All/Open/Cleared…). */
export function MSeg({ options, value, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: '#fff', border: `1px solid ${colors.border}`, padding: 3, borderRadius: 9, ...style }}>
      {options.map((o) => (
        <div
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 6, fontSize: 12, fontWeight: value === o.value ? 700 : 600, color: value === o.value ? '#fff' : colors.muted1, background: value === o.value ? colors.brand : 'transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {o.label}
        </div>
      ))}
    </div>
  )
}
