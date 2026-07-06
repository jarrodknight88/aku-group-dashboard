import { useEffect } from 'react'

/**
 * Lock page scroll while an overlay (drawer, sheet, modal) is open.
 * `overflow: hidden` alone doesn't stop touch scrolling on iOS Safari, so
 * this pins the body with position: fixed at the current scroll offset and
 * restores the offset on unlock.
 */
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    const y = window.scrollY
    const b = document.body.style
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, width: b.width, overflow: b.overflow }
    b.position = 'fixed'
    b.top = `-${y}px`
    b.left = '0'
    b.right = '0'
    b.width = '100%'
    b.overflow = 'hidden'
    return () => {
      Object.assign(b, prev)
      window.scrollTo(0, y)
    }
  }, [active])
}
