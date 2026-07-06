// groupme-intake — callback target for the venues' VOID & COMP GroupMe bots,
// plus a history backfill. GroupMe POSTs every new message here (sender,
// text, attachments); photos land in groupme_photos and a follow-up TEXT
// from the same sender within 10 minutes becomes the photo's caption (crews
// post the picture first, then the reason). The nightly matcher joins
// photos to specific voids/comps once the Toast pull writes the checks.
//
// Backfill: POST {backfill:true, access_token:"<GroupMe user token>", days?}
// to the same URL — pages through the group's message history (callbacks
// never deliver history), builds captions chronologically, inserts
// idempotently, then runs the matcher. The access token is used for the
// GroupMe reads only and never stored.
//
// Auth: GroupMe callbacks carry no signature, so the callback URL includes
// ?k=<token> validated against groupme_sources — plus the group_id in the
// payload must match that token's group. Deployed with verify_jwt = false.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// business day rolls at 5am venue-local (matches the Toast pull convention);
// venues are US/Eastern
const businessDate = (iso: string): string => {
  const t = new Date(new Date(iso).getTime() - 5 * 3600 * 1000)
  return t.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

type PhotoRow = {
  location_id: string
  group_id: string
  message_id: string
  sender_name: string | null
  posted_at: string
  business_date: string
  caption: string | null
  image_url: string
}

/** One GroupMe message → photo rows (with in-memory caption threading for
    chronological batches). Returns rows to insert; for text-only messages
    updates the sender's most recent in-batch photo instead. */
const messageRows = (msg: any, src: { group_id: string; location_id: string }, lastPhotoBySender: Map<string, PhotoRow>): PhotoRow[] => {
  if (msg?.sender_type === 'bot') return []
  const postedAt = msg?.created_at ? new Date(Number(msg.created_at) * 1000).toISOString() : new Date().toISOString()
  const images: string[] = (msg?.attachments ?? [])
    .filter((a: any) => a?.type === 'image' && typeof a.url === 'string')
    .map((a: any) => a.url)
  const text = String(msg?.text ?? '').trim()
  const sender = String(msg?.name ?? '')

  if (images.length === 0) {
    const last = lastPhotoBySender.get(sender)
    if (text && last && Date.parse(postedAt) - Date.parse(last.posted_at) < 10 * 60 * 1000) {
      last.caption = last.caption ? `${last.caption} · ${text}` : text
    }
    return []
  }
  const rows = images.map((url, i) => ({
    location_id: src.location_id,
    group_id: src.group_id,
    message_id: images.length > 1 ? `${msg.id}#${i}` : String(msg.id),
    sender_name: sender || null,
    posted_at: postedAt,
    business_date: businessDate(postedAt),
    caption: text || null,
    image_url: url,
  }))
  lastPhotoBySender.set(sender, rows[rows.length - 1])
  return rows
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405)

  const token = new URL(req.url).searchParams.get('k') ?? ''
  if (!/^[0-9a-f]{32,80}$/.test(token)) return ok({ error: 'bad link' }, 403)

  let msg: any
  try {
    msg = await req.json()
  } catch {
    return ok({ error: 'invalid JSON' }, 400)
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: src } = await db
    .from('groupme_sources')
    .select('group_id, location_id, active')
    .eq('token', token)
    .maybeSingle()
  if (!src || !src.active) return ok({ error: 'unknown source' }, 403)

  /* ---- history backfill ---- */
  if (msg?.backfill === true) {
    const accessToken = String(msg?.access_token ?? '')
    if (!accessToken) return ok({ error: 'access_token required' }, 400)
    const days = Math.min(Number(msg?.days) || 90, 365)
    const cutoff = Date.now() / 1000 - days * 86400
    const history: any[] = []
    let beforeId = ''
    for (let page = 0; page < 60; page++) {
      const url =
        `https://api.groupme.com/v3/groups/${src.group_id}/messages?limit=100` +
        (beforeId ? `&before_id=${beforeId}` : '') +
        `&token=${encodeURIComponent(accessToken)}`
      const res = await fetch(url)
      if (res.status === 304) break // no more history
      if (!res.ok) return ok({ error: `GroupMe API ${res.status} — check the access token` }, 502)
      const batch = (await res.json())?.response?.messages ?? []
      if (batch.length === 0) break
      history.push(...batch)
      beforeId = batch[batch.length - 1].id
      if (Number(batch[batch.length - 1].created_at) < cutoff) break
    }
    // oldest → newest so follow-up texts attach to the photo before them
    history.sort((a, b) => Number(a.created_at) - Number(b.created_at))
    const lastPhotoBySender = new Map<string, PhotoRow>()
    const rows: PhotoRow[] = []
    for (const m of history) {
      if (Number(m.created_at) < cutoff) continue
      rows.push(...messageRows(m, src, lastPhotoBySender))
    }
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from('groupme_photos').upsert(rows.slice(i, i + 200), { onConflict: 'message_id', ignoreDuplicates: true })
      if (error) return ok({ error: error.message }, 500)
    }
    const { data: matched } = await db.rpc('match_groupme_photos')
    return ok({ ok: true, scanned: history.length, photos: rows.length, auto_matched: matched ?? 0 })
  }

  /* ---- live callback ---- */
  if (String(msg?.group_id ?? '') !== src.group_id) return ok({ error: 'group mismatch' }, 403)
  if (msg?.sender_type === 'bot') return ok()

  const lastPhotoBySender = new Map<string, PhotoRow>()
  const rows = messageRows(msg, src, lastPhotoBySender)

  if (rows.length === 0) {
    // text-only: append to this sender's latest stored photo from the last
    // 10 minutes — that's the "reason" message that follows the picture
    const text = String(msg?.text ?? '').trim()
    const postedAt = msg?.created_at ? new Date(Number(msg.created_at) * 1000).toISOString() : new Date().toISOString()
    if (!text || msg?.sender_type === 'bot') return ok()
    const { data: recent } = await db
      .from('groupme_photos')
      .select('id, caption')
      .eq('group_id', src.group_id)
      .eq('sender_name', String(msg?.name ?? ''))
      .gte('posted_at', new Date(Date.parse(postedAt) - 10 * 60 * 1000).toISOString())
      .order('posted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (recent) {
      await db
        .from('groupme_photos')
        .update({ caption: recent.caption ? `${recent.caption} · ${text}` : text })
        .eq('id', recent.id)
    }
    return ok()
  }

  await db.from('groupme_photos').upsert(rows, { onConflict: 'message_id', ignoreDuplicates: true })
  return ok()
})
