/**
 * Date-range presets and the comparison window.
 * All dates are local-time YYYY-MM-DD strings (business dates, not timestamps).
 */

const pad = (n) => String(n).padStart(2, '0')
export const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromStr = (s) => new Date(s + 'T00:00:00')

export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtRange(startStr, endStr) {
  const s = fromStr(startStr)
  const e = fromStr(endStr)
  const sM = MONTHS[s.getMonth()]
  const eM = MONTHS[e.getMonth()]
  if (startStr === endStr) return `${sM} ${s.getDate()}`
  return sM === eM && s.getFullYear() === e.getFullYear()
    ? `${sM} ${s.getDate()}–${e.getDate()}`
    : `${sM} ${s.getDate()} – ${eM} ${e.getDate()}`
}

export const PRESETS = [
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisWeek', label: 'This Week' },
  { key: 'lastWeek', label: 'Last Week' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'last90', label: 'Last 90 Days' },
  { key: 'custom', label: 'Custom Range' },
]

export function presetRange(key, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dow = (t.getDay() + 6) % 7 // Monday = 0
  const monday = addDays(t, -dow)

  switch (key) {
    case 'yesterday': {
      const y = toStr(addDays(t, -1))
      return { start: y, end: y, label: 'Yesterday' }
    }
    case 'thisWeek':
      return { start: toStr(monday), end: toStr(t), label: 'This Week' }
    case 'lastWeek':
      return { start: toStr(addDays(monday, -7)), end: toStr(addDays(monday, -1)), label: 'Last Week' }
    case 'thisMonth':
      return { start: toStr(new Date(t.getFullYear(), t.getMonth(), 1)), end: toStr(t), label: 'This Month' }
    case 'lastMonth': {
      const first = new Date(t.getFullYear(), t.getMonth() - 1, 1)
      const last = new Date(t.getFullYear(), t.getMonth(), 0)
      return { start: toStr(first), end: toStr(last), label: 'Last Month' }
    }
    case 'last7':
      return { start: toStr(addDays(t, -6)), end: toStr(t), label: 'Last 7 Days' }
    case 'last90':
      return { start: toStr(addDays(t, -89)), end: toStr(t), label: 'Last 90 Days' }
    case 'last30':
    default:
      return { start: toStr(addDays(t, -29)), end: toStr(t), label: 'Last 30 Days' }
  }
}

/** The immediately-preceding window of equal length. */
export function compareRange({ start, end }) {
  const s = fromStr(start)
  const e = fromStr(end)
  const len = Math.round((e - s) / 86_400_000) + 1
  const compEnd = addDays(s, -1)
  const compStart = addDays(compEnd, -(len - 1))
  return { start: toStr(compStart), end: toStr(compEnd) }
}

/** Inclusive list of YYYY-MM-DD between start and end. */
export function eachDay(start, end) {
  const out = []
  let d = fromStr(start)
  const e = fromStr(end)
  while (d <= e) {
    out.push(toStr(d))
    d = addDays(d, 1)
  }
  return out
}
