import { Link } from 'react-router-dom'
import { colors, fonts } from '../theme.js'

/* Shared card building blocks, ported from the Claude Design handoff.
   Used by Company Glance and Location Report (and later levels). */

export const card = {
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: 13,
  padding: 20,
}

export const labelUpper = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: colors.muted2,
  fontWeight: 600,
}

/** Headline-strip tile: label, big serif figure, green/red delta chip. */
export function StatTile({ label, value, delta, up = true, note = 'vs last week' }) {
  return (
    <div style={card}>
      <div style={labelUpper}>{label}</div>
      <div
        className="tnum"
        style={{
          fontFamily: fonts.serif,
          fontSize: 36,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          marginTop: 6,
        }}
      >
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: up ? colors.greenDark : colors.red,
            background: up ? colors.greenBg : colors.redBg,
            padding: '2px 8px',
            borderRadius: 5,
          }}
        >
          {delta}
        </span>
        <span style={{ fontSize: 12, color: colors.muted3 }}>{note}</span>
      </div>
    </div>
  )
}

/**
 * KPI tile measured against a target.
 * status: 'good' (green border/dot/figure) | 'bad' (red wash) | 'neutral'.
 * `sub` is the line under the figure (string or JSX).
 */
export function KpiTile({ label, value, sub, status = 'neutral', size = 32, padding = 20, subTop, style }) {
  const border =
    status === 'good' ? colors.greenBorder : status === 'bad' ? colors.redBorder : colors.border
  const bg = status === 'bad' ? colors.redBg : colors.white
  const figColor =
    status === 'good' ? colors.greenDark : status === 'bad' ? colors.red : colors.ink

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 13,
        padding,
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div style={labelUpper}>{label}</div>
        {status !== 'neutral' && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: status === 'good' ? colors.green : colors.redBright,
            }}
          />
        )}
      </div>
      <div
        className="tnum"
        style={{ fontFamily: fonts.serif, fontSize: size, fontWeight: 500, marginTop: 6, color: figColor }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: status === 'bad' ? colors.red : colors.muted3,
          marginTop: subTop ?? (status === 'neutral' ? 5 : 4),
          fontWeight: status === 'bad' ? 600 : 400,
        }}
      >
        {sub}
      </div>
    </div>
  )
}

/** "within" tail for a target line, e.g. `Target < 1% · within`. */
export function Within() {
  return <span style={{ color: colors.greenDark, fontWeight: 600 }}>within</span>
}

/** Single ranked row: serif rank numeral, name, bold value. */
export function RankRow({ n, name, val }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontFamily: fonts.serif, fontSize: 14, color: colors.brand, width: 16 }}>{n}</span>
      <span style={{ flex: 1, fontSize: 12 }}>{name}</span>
      <span className="tnum" style={{ fontSize: 12, fontWeight: 700 }}>
        {val}
      </span>
    </div>
  )
}

/** Top-5 ranked mini-list card. `rows` = [[name, val], ...]. */
export function RankedCard({ title, rows }) {
  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {rows.map((r, i) => (
          <RankRow key={i} n={i + 1} name={r[0]} val={r[1]} />
        ))}
      </div>
    </div>
  )
}

/** Labeled horizontal bars: `items` = {label, val, w (0-100), color}. */
export function BarList({ items, gap = 12 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {items.map((it) => (
        <div key={it.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span>{it.label}</span>
            <span style={{ fontWeight: 700 }}>{it.val}</span>
          </div>
          <div style={{ height: 8, background: colors.pageBg, borderRadius: 4 }}>
            <div style={{ width: `${it.w}%`, height: '100%', background: it.color, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * By-day sparkline card (Voids by Day / Discounts by Day).
 * `bars` = [{h, color?}] — per-bar color override lets a spike day read red.
 */
export function DayBarsCard({ title, bars, color }) {
  return (
    <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 54 }}>
        {bars.map((b, i) => (
          <div
            key={i}
            style={{ flex: 1, height: `${b.h ?? b}%`, background: b.color ?? color, borderRadius: 2 }}
          />
        ))}
      </div>
    </div>
  )
}

/** Won / In Progress / Lost three-stage chargebacks card. */
export function ChargebacksCard({ won, inProgress, lost }) {
  const stage = (bg, labelColor, figColor, noteColor, label, s) => (
    <div style={{ background: bg, borderRadius: 10, padding: 13, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: labelColor, fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600, color: figColor, marginTop: 4 }}>{s.amt}</div>
      <div style={{ fontSize: 11, color: noteColor }}>{s.note}</div>
    </div>
  )
  return (
    <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 13 }}>Chargebacks by Stage</div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {stage(colors.greenBg, colors.greenDark, colors.greenDark, colors.greenDark, 'Won', won)}
        {stage(colors.panelGray, colors.muted1, colors.inkSoft, colors.muted2, 'In Progress', inProgress)}
        {stage(colors.redBg, colors.red, colors.red, colors.red, 'Lost', lost)}
      </div>
    </div>
  )
}

/** Solid-navy Exception Flags tile linking into the exception list. */
export function ExceptionTile({ count, to }) {
  return (
    <Link
      to={to}
      style={{
        background: colors.brand,
        borderRadius: 13,
        padding: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
      }}
    >
      <div>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.brandTint3, fontWeight: 600 }}>
          Exception Flags
        </div>
        <div style={{ fontSize: 11, color: colors.brandTint4, marginTop: 3 }}>Transactions tripping audit rules</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ fontFamily: fonts.serif, fontSize: 38, fontWeight: 600, color: '#fff', lineHeight: 1 }}>{count}</div>
        <div style={{ background: '#fff', color: colors.brand, fontSize: 12, fontWeight: 700, padding: '7px 13px', borderRadius: 8 }}>
          Review →
        </div>
      </div>
    </Link>
  )
}

/** Top-by-$ / Top-by-Qty segmented toggle. Static (visual) when no onChange. */
export function ModeToggle({ mode = 'dollar', onChange }) {
  const tab = (active) => ({
    padding: '5px 12px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: active ? 700 : 600,
    color: active ? '#fff' : colors.muted3,
    background: active ? colors.brand : 'transparent',
    cursor: onChange ? 'pointer' : 'default',
  })
  return (
    <div style={{ display: 'flex', gap: 3, background: '#fff', border: `1px solid ${colors.border}`, padding: 3, borderRadius: 7 }}>
      <div onClick={onChange ? () => onChange('dollar') : undefined} style={tab(mode === 'dollar')}>
        Top by $
      </div>
      <div onClick={onChange ? () => onChange('qty') : undefined} style={tab(mode === 'qty')}>
        Top by Qty
      </div>
    </div>
  )
}
