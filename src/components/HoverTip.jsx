import { useState } from 'react'
import { colors } from '../theme.js'

/* Cursor-following chart tooltip from the design handoff. One instance per
   page: spread `bind` on the page root and render `tip` inside it, then mark
   any hover target (DOM or SVG) with a `data-tip` attribute — event
   delegation picks it up, no per-chart wiring. */

export function useHoverTip() {
  const [tip, setTip] = useState(null) // { text, x, y }

  const bind = {
    onMouseOver: (e) => {
      const el = e.target.closest?.('[data-tip]')
      setTip(el ? { text: el.getAttribute('data-tip'), x: e.clientX, y: e.clientY } : null)
    },
    onMouseMove: (e) => {
      const { clientX: x, clientY: y } = e
      setTip((t) => (t ? { ...t, x, y } : t))
    },
    onMouseLeave: () => setTip(null),
  }

  const el = tip ? (
    <div
      style={{
        position: 'fixed',
        left: tip.x + 14,
        top: tip.y - 34,
        background: colors.navy,
        color: '#fff',
        padding: '6px 10px',
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 600,
        pointerEvents: 'none',
        zIndex: 1000,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(16,44,88,0.3)',
      }}
    >
      {tip.text}
    </div>
  ) : null

  return { bind, tip: el }
}
