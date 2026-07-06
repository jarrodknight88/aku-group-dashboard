import { supabase } from '../lib/supabase.js'

/* @-mention notifications (migration 37). Rows are written by the DB
   trigger when a comment/note carries mentions; RLS scopes reads and the
   read-receipt update to the signed-in user. */

/** Org roster for @ autocomplete — security-definer RPC (managers can't
    read other profiles directly). */
export async function fetchOrgUsers() {
  const { data, error } = await supabase.rpc('list_org_users')
  if (error) return []
  return data ?? []
}

/** Latest notifications for the signed-in user (unread first is the
    caller's concern — rows come newest-first). */
export async function fetchNotifications(limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, actor_name, kind, ref, preview, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return data ?? []
}

export async function markNotificationsRead(ids) {
  if (!ids?.length) return
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
}
