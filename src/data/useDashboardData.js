import { useEffect, useState } from 'react'
import { useRange } from '../state/RangeContext.jsx'
import {
  fetchDaily,
  fetchDim,
  fetchOrgTargets,
  fetchChargebackTotals,
  fetchExceptionCount,
} from './live.js'

/**
 * One-stop range-scoped bundle for a location (uuid) or the whole org (null).
 * Pass `undefined` while the location uuid is still resolving to defer the fetch.
 * Refetches when the global date range changes.
 */
export function useDashboardData(locationId) {
  const { range, compare } = useRange()
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    if (locationId === undefined) return
    let live = true
    setState({ loading: true })
    ;(async () => {
      try {
        const [cur, prev, cats, items, pays, servers, targets, chargebacks, exceptionCount] = await Promise.all([
          fetchDaily(locationId, range.start, range.end),
          fetchDaily(locationId, compare.start, compare.end),
          fetchDim('daily_sales_categories', locationId, range.start, range.end),
          fetchDim('daily_menu_items', locationId, range.start, range.end),
          fetchDim('daily_payments', locationId, range.start, range.end),
          fetchDim('daily_server_sales', locationId, range.start, range.end),
          fetchOrgTargets(),
          fetchChargebackTotals(locationId ?? null, range.start, range.end),
          fetchExceptionCount(locationId, range.start, range.end),
        ])
        if (live) setState({ loading: false, cur, prev, cats, items, pays, servers, targets, chargebacks, exceptionCount })
      } catch (err) {
        if (live) setState({ loading: false, error: err.message })
      }
    })()
    return () => {
      live = false
    }
  }, [locationId, range.start, range.end, compare.start, compare.end])

  return state
}
