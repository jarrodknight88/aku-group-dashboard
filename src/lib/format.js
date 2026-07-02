/** Number formatting shared by all live pages. `null`/`undefined` renders as an em dash. */

export const fmtMoney = (v) =>
  v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US')

export const fmtMoneyC = (v) =>
  v == null ? '—' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fmtK = (v) =>
  v == null ? '—' : v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + Math.round(v)

export const fmtPct = (v, digits = 1) => (v == null ? '—' : v.toFixed(digits) + '%')

export const fmtInt = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'))

/** % change vs a previous value; null when there's no meaningful base. */
export const deltaPct = (cur, prev) =>
  prev == null || prev <= 0 || cur == null ? null : ((cur - prev) / prev) * 100

export const fmtDelta = (d) => (d == null ? null : `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}%`)
