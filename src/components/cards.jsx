import { Link } from 'react-router-dom'
import { colors, fonts } from '../theme.js'
import { fmtMoney } from '../lib/format.js'
import { fromStr } from '../lib/dates.js'

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

/**
 * Joined KPI stat row (§11): 1px-gap auto-fit grid inside one bordered
 * container. `items` = { label, value, valueColor?, sub? (JSX) }.
 */
export function StatRow({ items, size = 28, min = 200, style }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 1,
        background: colors.border,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        ...style,
      }}
    >
      {items.map((it, i) => (
        <div key={i} style={{ background: '#fff', padding: size >= 28 ? '16px 18px' : '14px 16px' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.muted2, fontWeight: 700 }}>
            {it.label}
          </div>
          <div
            className="tnum"
            style={{ fontFamily: fonts.serif, fontSize: size, fontWeight: 600, letterSpacing: '-0.01em', marginTop: size >= 28 ? 5 : 4, color: it.valueColor ?? colors.ink }}
          >
            {it.value}
          </div>
          {it.sub && <div style={{ marginTop: size >= 28 ? 8 : 2 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/** Green/red delta chip + note, for StatRow subs and stat tiles. */
export function DeltaChip({ delta, up = true, note = 'vs prior period' }) {
  if (delta == null) return <span style={{ fontSize: 12, color: colors.muted3 }}>no comparison data</span>
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
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
    </span>
  )
}

/** 6px status dot + text (§11 — replaces emoji status glyphs). */
export function StatusDot({ color, children, bold = 700 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: bold, color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {children}
    </span>
  )
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
        {delta == null ? (
          <span style={{ fontSize: 12, color: colors.muted3 }}>no comparison data</span>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

/**
 * KPI tile measured against a target.
 * status: 'good' (green border/dot/figure) | 'bad' (red wash) | 'neutral'.
 * `sub` is the line under the figure (string or JSX).
 * `to` makes the whole tile a link (drill-down tiles carry a Details → tail).
 */
export function KpiTile({ label, value, sub, status = 'neutral', size = 32, padding = 20, subTop, style, to }) {
  const border =
    status === 'good' ? colors.greenBorder : status === 'bad' ? colors.redBorder : colors.border
  const bg = status === 'bad' ? colors.redBg : colors.white
  const figColor =
    status === 'good' ? colors.greenDark : status === 'bad' ? colors.red : colors.ink
  const Tag = to ? Link : 'div'

  return (
    <Tag
      to={to}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 13,
        padding,
        display: 'flex',
        flexDirection: 'column',
        cursor: to ? 'pointer' : undefined,
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
    </Tag>
  )
}

/** "within" tail for a target line, e.g. `Target < 1% · within`. */
export function Within() {
  return <span style={{ color: colors.greenDark, fontWeight: 600 }}>within</span>
}

/** Drill-down tail for a linked KPI tile, e.g. `Target < 1% · within · Details →`. */
export function DetailsTail() {
  return <span style={{ color: colors.brand, fontWeight: 600 }}>Details →</span>
}

/** Single ranked row: serif rank numeral, name, bold value.
    `rankColor` overrides the numeral color (muted on Bottom lists). */
export function RankRow({ n, name, val, rankColor = colors.brand }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontFamily: fonts.serif, fontSize: 14, color: rankColor, width: 16 }}>{n}</span>
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

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Aggregate daily rows into Mon–Sun bars for DayBarsCard. Each bar carries a
 * hover tip like `Fri · $460 voided — peak` (`— peak` on the max day only);
 * `peakColor` optionally recolors the peak bar (red spike on Company voids).
 */
export function weekdayBars(rows, field, verb, peakColor) {
  const sums = [0, 0, 0, 0, 0, 0, 0]
  for (const r of rows) sums[(fromStr(r.business_date).getDay() + 6) % 7] += Number(r[field]) || 0
  const max = Math.max(...sums)
  return DAY_LABELS.map((day, i) => {
    const peak = max > 0 && sums[i] === max
    return {
      h: max > 0 ? Math.max(4, (sums[i] / max) * 100) : 0,
      tip: `${day} · ${fmtMoney(sums[i])} ${verb}${peak ? ' — peak' : ''}`,
      color: peak ? peakColor : undefined,
    }
  })
}

/**
 * By-day sparkline card (Voids by Day / Discounts by Day).
 * `bars` = [{h, color?, tip?}] — per-bar color override lets a spike day read
 * red; `tip` feeds the shared hover tooltip. `labels` renders the x-axis
 * (Mon–Sun) plus the `Day of week` caption under the bars.
 */
export function DayBarsCard({ title, bars, color, labels }) {
  return (
    <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 54 }}>
        {bars.map((b, i) => (
          <div
            key={i}
            data-tip={b.tip}
            style={{ flex: 1, height: `${b.h ?? b}%`, background: b.color ?? color, borderRadius: 2 }}
          />
        ))}
      </div>
      {labels && (
        <>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {labels.map((l) => (
              <span key={l} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: colors.muted3 }}>
                {l}
              </span>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: colors.muted4, marginTop: 4 }}>Day of week</div>
        </>
      )}
    </div>
  )
}

/**
 * SVG donut ring — each segment is its own hover target via `data-tip`
 * (replaces the conic-gradient donuts). `segments` = [{value, color, tip}];
 * `center` renders an absolutely-centered overlay inside the hole
 * (pointer-events: none so it never blocks segment hovers).
 */
export function DonutRing({ segments, center, size = 108 }) {
  const C = 2 * Math.PI * 50 // circumference at r=50 in the 120×120 viewBox ≈ 314.16
  const total = segments.reduce((s, x) => s + x.value, 0)
  let acc = 0
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" style={{ width: size, height: size, transform: 'rotate(-90deg)' }}>
        {segments.map((s, i) => {
          const len = total > 0 ? (s.value / total) * C : 0
          const off = acc
          acc += len
          return (
            <circle
              key={i}
              data-tip={s.tip}
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke={s.color}
              strokeWidth="20"
              strokeDasharray={`${len} ${C}`}
              strokeDashoffset={-off}
            />
          )
        })}
      </svg>
      {center && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          {center}
        </div>
      )}
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

/** $ / Qty segmented toggle. Static (visual) when no onChange.
    `labels` swaps the captions (e.g. Bottom by $ / Bottom by Qty). */
export function ModeToggle({ mode = 'dollar', onChange, labels = ['Top by $', 'Top by Qty'] }) {
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
        {labels[0]}
      </div>
      <div onClick={onChange ? () => onChange('qty') : undefined} style={tab(mode === 'qty')}>
        {labels[1]}
      </div>
    </div>
  )
}
