import { createContext, useContext, useMemo, useState } from 'react'
import { presetRange, compareRange } from '../lib/dates.js'

/**
 * Global date-range state — the picker in the header drives every page.
 * `range`/`compare` are {start, end} YYYY-MM-DD business-date windows;
 * compare is always the immediately-preceding window of equal length.
 */
const RangeCtx = createContext(null)

export function RangeProvider({ children }) {
  const [presetKey, setPresetKey] = useState('last30')
  const [custom, setCustom] = useState(null) // {start, end} when presetKey === 'custom'

  const range = useMemo(() => {
    if (presetKey === 'custom' && custom?.start && custom?.end) {
      return { ...custom, label: 'Custom Range' }
    }
    return presetRange(presetKey === 'custom' ? 'last30' : presetKey)
  }, [presetKey, custom])

  const compare = useMemo(() => compareRange(range), [range])

  return (
    <RangeCtx.Provider value={{ range, compare, presetKey, setPresetKey, custom, setCustom }}>
      {children}
    </RangeCtx.Provider>
  )
}

export function useRange() {
  return useContext(RangeCtx)
}
