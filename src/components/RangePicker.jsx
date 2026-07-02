import { useEffect, useRef, useState } from 'react'
import { useRange } from '../state/RangeContext.jsx'
import { PRESETS, fmtRange } from '../lib/dates.js'
import { colors } from '../theme.js'

/** The global date-range control — presets plus a custom range. */
export default function RangePicker() {
  const { range, compare, presetKey, setPresetKey, custom, setCustom } = useRange()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({ start: '', end: '' })
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (key) => {
    if (key === 'custom') {
      setDraft({ start: custom?.start || range.start, end: custom?.end || range.end })
      setPresetKey('custom')
      return // stay open for the date inputs
    }
    setPresetKey(key)
    setOpen(false)
  }

  const applyCustom = () => {
    if (!draft.start || !draft.end || draft.start > draft.end) return
    setCustom({ start: draft.start, end: draft.end })
    setPresetKey('custom')
    setOpen(false)
  }

  const inputStyle = {
    padding: '7px 9px',
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: 7,
    fontSize: 12,
    fontFamily: 'inherit',
  }

  return (
    <div ref={ref} style={{ position: 'relative', textAlign: 'right' }}>
      <div
        onClick={() => setOpen((o) => !o)}
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
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{ color: colors.muted2 }}>📅</span> {range.label}
        <span style={{ color: colors.muted3 }}>{open ? '▴' : '▾'}</span>
      </div>
      <div style={{ fontSize: 11, color: colors.muted3, marginTop: 6 }}>
        {fmtRange(range.start, range.end)} · Compared to:{' '}
        <span style={{ color: colors.muted1, fontWeight: 600 }}>{fmtRange(compare.start, compare.end)}</span>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 44,
            zIndex: 30,
            background: '#fff',
            border: `1px solid ${colors.border}`,
            borderRadius: 11,
            boxShadow: '0 10px 30px rgba(20,32,48,0.14)',
            padding: 6,
            width: 230,
            textAlign: 'left',
          }}
        >
          {PRESETS.map((p) => (
            <div
              key={p.key}
              onClick={() => pick(p.key)}
              style={{
                padding: '8px 12px',
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                color: presetKey === p.key ? '#fff' : colors.inkSoft,
                background: presetKey === p.key ? colors.brand : 'transparent',
              }}
            >
              {p.label}
            </div>
          ))}
          {presetKey === 'custom' && (
            <div style={{ padding: '10px 12px', borderTop: `1px solid ${colors.pageBg}`, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="date" value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} style={inputStyle} />
              <input type="date" value={draft.end} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} style={inputStyle} />
              <div
                onClick={applyCustom}
                style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#fff', background: colors.brand, padding: '8px 0', borderRadius: 7, cursor: 'pointer' }}
              >
                Apply
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
