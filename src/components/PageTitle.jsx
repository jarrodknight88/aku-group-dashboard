import { Link } from 'react-router-dom'
import { colors, fonts } from '../theme.js'
import { fmtRange } from '../lib/dates.js'

/** "Data through Jul 2" tail for title metadata lines (latest business date in the loaded rows). */
export function dataThrough(rows) {
  const last = (rows ?? []).reduce((m, r) => (r.business_date > m ? r.business_date : m), '')
  return last ? `Data through ${fmtRange(last, last)}` : 'Awaiting data'
}

/** Breadcrumb trail (§11) — replaces "← Back" links on drill pages. */
export function Crumbs({ items }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.muted3, marginBottom: 10, flexWrap: 'wrap' }}>
      {items.map((it, i) => {
        const last = i === items.length - 1
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span>/</span>}
            {last || !it.to ? (
              <span style={{ color: last ? colors.ink : colors.muted3, fontWeight: last ? 600 : 400 }}>{it.label}</span>
            ) : (
              <Link to={it.to} style={{ color: colors.muted2, fontWeight: 600 }}>{it.label}</Link>
            )}
          </span>
        )
      })}
    </div>
  )
}

/** Page title row (§11): 26px serif title, metadata line, right-side controls
    (usually the date-range picker). */
export default function PageTitle({ title, meta, right, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16, ...style }}>
      <div>
        <div style={{ fontFamily: fonts.serif, fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.05 }}>{title}</div>
        {meta && <div style={{ fontSize: 12, color: colors.muted3, marginTop: 5 }}>{meta}</div>}
      </div>
      {right}
    </div>
  )
}
