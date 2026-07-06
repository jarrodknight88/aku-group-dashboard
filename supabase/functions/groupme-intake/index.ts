// groupme-intake — callback target for the venues' VOID & COMP GroupMe bots.
// GroupMe POSTs every group message here (sender, text, attachments) the
// moment it's sent. Photos land in groupme_photos; a follow-up TEXT from the
// same sender within 10 minutes is appended to their latest photo's caption
// (crews post the picture first, then the reason). The nightly matcher joins
// photos to specific voids/comps once the Toast pull writes the checks.
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
  if (String(msg?.group_id ?? '') !== src.group_id) return ok({ error: 'group mismatch' }, 403)

  // ignore the bots' own posts (including any future confirmations we send)
  if (msg?.sender_type === 'bot') return ok()

  const postedAt = msg?.created_at ? new Date(Number(msg.created_at) * 1000).toISOString() : new Date().toISOString()
  const images: string[] = (msg?.attachments ?? [])
    .filter((a: any) => a?.type === 'image' && typeof a.url === 'string')
    .map((a: any) => a.url)
  const text = String(msg?.text ?? '').trim()

  if (images.length === 0) {
    // text-only: append to this sender's latest photo from the last 10 min —
    // that's the "reason" message that follows the picture
    if (!text) return ok()
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

  const rows = images.map((url, i) => ({
    location_id: src.location_id,
    group_id: src.group_id,
    message_id: images.length > 1 ? `${msg.id}#${i}` : String(msg.id),
    sender_name: String(msg?.name ?? '') || null,
    posted_at: postedAt,
    business_date: businessDate(postedAt),
    caption: text || null,
    image_url: url,
  }))
  await db.from('groupme_photos').upsert(rows, { onConflict: 'message_id', ignoreDuplicates: true })
  return ok()
})
