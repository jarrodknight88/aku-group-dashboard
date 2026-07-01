import { createClient } from '@supabase/supabase-js'

// Publishable key — safe to ship to the browser; RLS enforces all access.
// Env vars override for other environments (e.g. a future staging project).
const url = import.meta.env.VITE_SUPABASE_URL || 'https://bvqubtromgldqnnhfeuz.supabase.co'
const key = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_gzGIw9Oy1DqEHURUsqEqZg_F47qomM5'

export const supabase = createClient(url, key)
