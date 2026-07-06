import { useState } from 'react'
import { useRange } from '../state/RangeContext.jsx'
import { presetRange, compareRange, fromStr, toStr, PRESETS } from '../lib/dates.js'
import { useScrollLock } from '../lib/useScrollLock.js'
import { colors } from '../theme.js'

/* Date-range picker (enterprise pass, §11 — Company reference is canonical).
   Lives in each page's title row: trigger shows preset + committed range with
   a "Compared to:" line; the panel is a preset rail + two month calendars
   (‹ › nav, two-click custom range) + live compare footer + Cancel/Apply.
   Commits into the global RangeContext, so every delta follows it. */

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Sep 15 – 21, 2025" · "Sep 15 – Oct 2, 2025" · single day "Jul 11, 2025". */
export function fmtRangeYear(aStr, bStr) {
  const a = fromStr(aStr)
  const b = fromStr(bStr)
  if (aStr === bStr) return `${MO[a.getMonth()]} ${a.getDate()}, ${a.getFullYear()}`
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${MO[a.getMonth()]} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
  return `${MO[a.getMonth()]} ${a.getDate()} – ${MO[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`
}

// Jan-1-anchored ranges compare year-over-year; everything else to the
// preceding window of equal length (compareRange decides).
const isYoY = ({ start, end }) => start.slice(5) === '01-01' && end.slice(0, 4) === start.slice(0, 4)

// Panel opens on the month before the range's end month (reference behavior).
const anchorFor = (endStr) => {
  const e = fromStr(endStr)
  return new Date(e.getFullYear(), e.getMonth() - 1, 1)
}

export default function DateRangePicker() {
  const { range, compare, presetKey, setPresetKey, setCustom } = useRange()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null) // { preset, start, end, picking, anchor }

  const committedLabel = PRESETS.find((p) => p.key === presetKey)?.label ?? 'Custom Range'
  const committedCompare = compare

  const openPanel = () =>
    setDraft({ preset: presetKey, start: range.start, end: range.end, picking: 0, anchor: anchorFor(range.end) })

  const apply = () => {
    if (draft.preset === 'custom') {
      setCustom({ start: draft.start, end: draft.end })
      setPresetKey('custom')
    } else {
      setPresetKey(draft.preset)
    }
    setOpen(false)
  }

  const d = draft ?? { preset: presetKey, start: range.start, end: range.end, anchor: anchorFor(range.end) }
  const draftCompare = compareRange({ start: d.start, end: d.end })

  const pickPreset = (key) => {
    if (key === 'custom') return setDraft({ ...d, preset: 'custom', picking: 0 })
    const r = presetRange(key)
    setDraft({ preset: key, start: r.start, end: r.end, picking: 0, anchor: anchorFor(r.end) })
  }

  const pickDay = (iso) => {
    if (d.picking === 1 && iso >= d.start) setDraft({ ...d, preset: 'custom', end: iso, picking: 0 })
    else setDraft({ ...d, preset: 'custom', start: iso, end: iso, picking: 1 })
  }

  const month = (mo) => {
    const first = new Date(mo.getFullYear(), mo.getMonth(), 1)
    const dim = new Date(mo.getFullYear(), mo.getMonth() + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < first.getDay(); i++) cells.push(null)
    for (let n = 1; n <= dim; n++) cells.push(toStr(new Date(mo.getFullYear(), mo.getMonth(), n)))
    return { label: `${MO[mo.getMonth()]} ${mo.getFullYear()}`, cells }
  }
  const m1 = d.anchor
  const months = [month(m1), month(new Date(m1.getFullYear(), m1.getMonth() + 1, 1))]
  const shiftAnchor = (n) => setDraft({ ...d, anchor: new Date(m1.getFullYear(), m1.getMonth() + n, 1) })

  const navBtn = (side, n, glyph) => (
    <div
      onClick={() => shiftAnchor(n)}
      style={{ position: 'absolute', [side]: 14, top: 12, width: 24, height: 24, borderRadius: 6, border: `1px solid ${colors.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: colors.muted1, cursor: 'pointer', zIndex: 1 }}
    >
      {glyph}
    </div>
  )

  // Phones get a fixed, screen-anchored panel (the absolute dropdown can
  // land off-screen when the title row wraps) — decided when the panel opens.
  const mobile = typeof window !== 'undefined' && window.innerWidth < 700
  useScrollLock(open && mobile)

  return (
    <div style={{ position: 'relative', maxWidth: '100%' }}>
      <div
        onClick={() => {
          if (!open) openPanel()
          setOpen(!open)
        }}
        style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '2px 9px', padding: '9px 14px', border: `1px solid ${colors.borderStrong}`, borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', maxWidth: '100%' }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>{committedLabel}</span>
        <span style={{ color: colors.muted3, fontWeight: 500, whiteSpace: 'nowrap' }}>{fmtRangeYear(range.start, range.end)}</span>
        <span style={{ color: colors.muted3 }}>▾</span>
      </div>
      <div style={{ fontSize: 11, color: colors.muted3, marginTop: 6, textAlign: 'right' }}>
        Compared to: <span style={{ color: colors.muted1, fontWeight: 600 }}>{fmtRangeYear(committedCompare.start, committedCompare.end)}</span>
      </div>

      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 59, background: mobile ? 'rgba(16,44,88,0.35)' : 'transparent' }} />}
      {open && (
        <div
          style={
            mobile
              ? { position: 'fixed', left: 8, right: 8, top: 64, zIndex: 60, maxHeight: 'calc(100vh - 90px)', overflowY: 'auto', background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, boxShadow: '0 16px 40px rgba(16,44,88,0.28)' }
              : { position: 'absolute', right: 0, top: 44, zIndex: 60, width: 680, maxWidth: 'calc(100vw - 48px)', background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, boxShadow: '0 16px 40px rgba(16,44,88,0.18)', overflow: 'hidden' }
          }
        >
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <div
              style={
                mobile
                  ? { flex: '1 1 100%', borderBottom: '1px solid #F0F2F5', padding: 8, display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 4 }
                  : { flex: '1 0 150px', maxWidth: 190, borderRight: '1px solid #F0F2F5', padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }
              }
            >
              {PRESETS.map((p) => (
                <div
                  key={p.key}
                  onClick={() => pickPreset(p.key)}
                  style={{ padding: '8px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', ...(d.preset === p.key ? { background: colors.brand, color: '#fff', fontWeight: 700 } : { color: '#3A4150', fontWeight: 600 }) }}
                >
                  {p.label}
                </div>
              ))}
            </div>
            <div style={{ flex: '2 1 320px', padding: 14, position: 'relative' }}>
              {navBtn('left', -1, '‹')}
              {navBtn('right', 1, '›')}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {months.map((m) => (
                  <div key={m.label}>
                    <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{m.label}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
                        <div key={i} style={{ textAlign: 'center', fontSize: 10, color: colors.muted3 }}>{w}</div>
                      ))}
                    </div>
                    <div className="tnum" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
                      {m.cells.map((iso, i) => {
                        if (!iso) return <div key={i} style={{ padding: '6px 0' }} />
                        const isEnd = iso === d.start || iso === d.end
                        const inR = iso > d.start && iso < d.end
                        return (
                          <div
                            key={i}
                            onClick={() => pickDay(iso)}
                            style={{ textAlign: 'center', padding: '6px 0', fontSize: 11, borderRadius: 6, cursor: 'pointer', ...(isEnd ? { background: colors.brand, color: '#fff', fontWeight: 700 } : inR ? { background: '#E8EEF6', color: colors.brand } : {}) }}
                          >
                            {Number(iso.slice(8, 10))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: `1px solid ${colors.border}`, background: '#FAFBFC', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, color: colors.muted3 }}>
              Compared to: <span style={{ color: colors.muted1, fontWeight: 600 }}>{fmtRangeYear(draftCompare.start, draftCompare.end)}</span> · {isYoY({ start: d.start, end: d.end }) ? 'same period last year' : 'preceding period of equal length'}
            </div>
            <div style={{ flex: 1 }} />
            <div onClick={() => setOpen(false)} style={{ padding: '8px 14px', border: `1px solid ${colors.borderStrong}`, borderRadius: 8, background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </div>
            <div onClick={apply} style={{ padding: '8px 16px', background: colors.brand, color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Apply
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
