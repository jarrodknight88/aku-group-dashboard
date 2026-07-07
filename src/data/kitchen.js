import { supabase } from '../lib/supabase.js'

/* Kitchen Order Guide data layer (migration 38). Forecast-driven ordering:
   generate_order_guide() forecasts dish sales for the target date (rolling
   DOW average from the Toast pull once >=3 observations exist, June seed
   otherwise), maps to ingredient needs, buffers, and rounds to vendor packs.
   Confirmed guides are frozen — suggested vs adjusted is the tuning signal. */

const LINE_COLS =
  'id, ingredient_id, forecast_need, buffer_pct, suggested_packs, adjusted_packs, is_estimate, note, ' +
  'ingredients(name, pack_label, pack_qty, pack_unit, vendor, is_verified)'

export async function generateOrderGuide(locationId, targetDate, department = 'kitchen') {
  const { data, error } = await supabase.rpc('generate_order_guide', {
    p_location_id: locationId,
    p_target: targetDate,
    p_department: department,
  })
  if (error) throw new Error(error.message)
  return data // guide id
}

export async function fetchOrderGuide(locationId, targetDate, department = 'kitchen') {
  const { data: guide, error } = await supabase
    .from('order_guides')
    .select('id, location_id, target_date, covers_through, generated_at, buffer_pct, status, confirmed_at')
    .eq('location_id', locationId)
    .eq('department', department)
    .eq('target_date', targetDate)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!guide) return null
  const { data: lines, error: e2 } = await supabase
    .from('order_guide_lines')
    .select(LINE_COLS)
    .eq('order_guide_id', guide.id)
  if (e2) throw new Error(e2.message)
  const sorted = (lines ?? []).sort((a, b) => (b.forecast_need ?? -1) - (a.forecast_need ?? -1))
  return { ...guide, lines: sorted }
}

export async function saveLinePacks(lineId, packs) {
  const { error } = await supabase
    .from('order_guide_lines')
    .update({ adjusted_packs: packs })
    .eq('id', lineId)
  if (error) throw new Error(error.message)
}

export async function confirmOrderGuide(guideId, profileId) {
  const { error } = await supabase
    .from('order_guides')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: profileId ?? null })
    .eq('id', guideId)
  if (error) throw new Error(error.message)
}
