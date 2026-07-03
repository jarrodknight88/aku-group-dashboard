import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { colors, fonts } from '../theme.js'
import { normalizeVendorName } from '../data/financials.js'

/* Mobile invoice intake (/submit?k=<token>) — the no-login page managers keep
   on their phone. The token in the URL is the credential (same trust model as
   the old Fillout link, revocable in invoice_intake_links); everything talks
   to the invoice-intake Edge Function, never to the database directly.
   Designed one-handed: photo first, amount, vendor, done — extras collapsed. */

const FN_URL =
  (import.meta.env.VITE_SUPABASE_URL || 'https://bvqubtromgldqnnhfeuz.supabase.co') + '/functions/v1/invoice-intake'

const fmt2 = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toLocaleDateString('en-CA')

async function callFn(payload) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Something went wrong — try again.')
  return body
}

/** Shrink photos before upload (12 MB fn limit; phone photos are huge).
    Anything canvas can't decode (some HEICs, PDFs) goes up as-is. */
async function fileToPayload(file) {
  const toB64 = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1])
      r.onerror = reject
      r.readAsDataURL(blob)
    })
  if (file.type.startsWith('image/')) {
    try {
      const bmp = await createImageBitmap(file)
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bmp.width * scale)
      canvas.height = Math.round(bmp.height * scale)
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85))
      if (blob) return { type: 'image/jpeg', data: await toB64(blob) }
    } catch {
      /* fall through to raw upload */
    }
  }
  if (file.size > 12 * 1024 * 1024) throw new Error('That file is too big — a photo of the invoice works best.')
  return { type: file.type || 'application/pdf', data: await toB64(file) }
}

export default function MobileIntake() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('k') || ''

  const [boot, setBoot] = useState(null) // { label, location, locations?, vendors, aliases, categories }
  const [dead, setDead] = useState('') // fatal: bad/expired link
  const [error, setError] = useState('')

  const [locationId, setLocationId] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [amount, setAmount] = useState('')
  const [vendorText, setVendorText] = useState('')
  const [vendorOpen, setVendorOpen] = useState(false)
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [more, setMore] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [name, setName] = useState(() => localStorage.getItem('intake_name') || '')
  const [dupes, setDupes] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(null) // { status, reasons, vendor, amount }
  const fileRef = useRef(null)
  const blurTimer = useRef(null)

  useEffect(() => {
    if (!token) { setDead('This page needs the link from the office — open it from the one they sent you.'); return }
    callFn({ token, action: 'bootstrap' })
      .then((b) => {
        setBoot(b)
        if (b.location) setLocationId(b.location.id)
        else if (b.locations?.length === 1) setLocationId(b.locations[0].id)
      })
      .catch((e) => setDead(e.message))
    return () => clearTimeout(blurTimer.current)
  }, [token])

  const vendors = boot?.vendors ?? []
  const aliasMap = useMemo(() => new Map((boot?.aliases ?? []).map((a) => [a.alias, a.vendor_id])), [boot])
  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors])

  const norm = normalizeVendorName(vendorText)
  const resolvedVendor = useMemo(() => {
    if (!norm) return null
    const viaAlias = aliasMap.get(norm)
    if (viaAlias) return vendorById.get(viaAlias) ?? null
    return vendors.find((v) => normalizeVendorName(v.name) === norm) ?? null
  }, [norm, aliasMap, vendorById, vendors])

  const vendorMatches = useMemo(() => {
    if (!norm) return []
    const starts = []
    const contains = []
    for (const v of vendors) {
      const n = normalizeVendorName(v.name)
      if (n.startsWith(norm)) starts.push(v)
      else if (n.includes(norm)) contains.push(v)
      if (starts.length >= 6) break
    }
    return [...starts, ...contains].slice(0, 6)
  }, [norm, vendors])

  // live duplicate look-ahead through the edge function
  useEffect(() => {
    if (!resolvedVendor?.id || !Number(amount) || !invoiceDate) { setDupes([]); return }
    const t = setTimeout(() => {
      callFn({ token, action: 'check', vendor_id: resolvedVendor.id, amount: Number(amount), invoice_date: invoiceDate, invoice_number: invoiceNumber })
        .then((r) => setDupes(r.duplicates ?? []))
        .catch(() => setDupes([]))
    }, 450)
    return () => clearTimeout(t)
  }, [resolvedVendor?.id, amount, invoiceDate, invoiceNumber, token])

  const pickFile = (f) => {
    setFile(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : '')
  }

  const canSubmit = locationId && vendorText.trim() && invoiceDate && Number(amount) > 0 && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      localStorage.setItem('intake_name', name.trim())
      const payload = {
        token,
        action: 'submit',
        location_id: locationId,
        vendor_name: vendorText,
        invoice_date: invoiceDate,
        amount: Number(amount),
        invoice_number: invoiceNumber,
        category_id: categoryId || null,
        notes,
        submitted_name: name,
      }
      if (file) payload.file = await fileToPayload(file)
      const r = await callFn(payload)
      setDone({ status: r.status, reasons: r.flag_reasons ?? [], vendor: r.vendor, amount: Number(amount) })
      window.scrollTo(0, 0)
    } catch (e) {
      setError(e.message)
    }
    setSubmitting(false)
  }

  const reset = () => {
    setDone(null)
    pickFile(null)
    setAmount('')
    setVendorText('')
    setInvoiceDate(today())
    setInvoiceNumber('')
    setCategoryId('')
    setNotes('')
    setDupes([])
    setMore(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  /* ---- styles: big, thumb-friendly; 17px text so iOS never zooms ---- */
  const page = { minHeight: '100vh', background: colors.pageBg, color: colors.ink, fontFamily: fonts.sans, paddingBottom: 40 }
  const shell = { maxWidth: 480, margin: '0 auto', padding: '0 16px' }
  const label = { fontSize: 12, fontWeight: 700, color: colors.muted2, letterSpacing: '0.03em', textTransform: 'uppercase', margin: '16px 0 6px' }
  const input = { width: '100%', padding: '14px 14px', border: `1px solid ${colors.borderStrong}`, borderRadius: 12, fontSize: 17, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }

  const header = (
    <div style={{ background: colors.brand, color: '#fff', padding: '18px 0 16px', marginBottom: 4 }}>
      <div style={{ ...shell, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.serif, fontWeight: 600, fontSize: 20 }}>A</div>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontFamily: fonts.serif, fontWeight: 600, fontSize: 19 }}>Invoice Drop</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{boot?.location?.name || boot?.label || 'Aku Group'}</div>
        </div>
      </div>
    </div>
  )

  if (dead) {
    return (
      <div style={page}>
        {header}
        <div style={{ ...shell, paddingTop: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}>🔒</div>
          <div style={{ fontFamily: fonts.serif, fontSize: 22, fontWeight: 600, margin: '12px 0 8px' }}>Link not working</div>
          <div style={{ fontSize: 15, color: colors.muted1, lineHeight: 1.5 }}>{dead}</div>
        </div>
      </div>
    )
  }

  if (done) {
    const approved = done.status === 'auto_approved'
    return (
      <div style={page}>
        {header}
        <div style={{ ...shell, paddingTop: 36, textAlign: 'center' }}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, background: approved ? colors.greenBg : '#FBF3DC', border: `2px solid ${approved ? colors.greenBorder : '#EAD9A8'}` }}>
            {approved ? '✓' : '👀'}
          </div>
          <div style={{ fontFamily: fonts.serif, fontSize: 24, fontWeight: 600, margin: '16px 0 8px' }}>
            {approved ? 'Got it — recorded!' : 'Got it — being reviewed'}
          </div>
          <div style={{ fontSize: 15, color: colors.muted1, lineHeight: 1.55 }}>
            {fmt2(done.amount)} to <b>{done.vendor}</b>{' '}
            {approved ? 'is in the books. Nothing else to do.' : 'was sent to the office to double-check:'}
          </div>
          {!approved && done.reasons.length > 0 && (
            <div style={{ margin: '14px auto 0', maxWidth: 380, textAlign: 'left', background: '#FBF3DC', border: '1px solid #EAD9A8', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: '#8A6D1A' }}>
              {done.reasons.map((r, i) => <div key={i} style={{ marginTop: i ? 6 : 0 }}>• {r}</div>)}
            </div>
          )}
          <div onClick={reset} style={{ margin: '26px auto 0', maxWidth: 380, padding: '16px 0', background: colors.brand, color: '#fff', borderRadius: 14, fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>
            Add another invoice
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={page}>
      {header}
      <div style={shell}>
        {!boot ? (
          <div style={{ paddingTop: 40, textAlign: 'center', color: colors.muted3, fontSize: 15 }}>Loading…</div>
        ) : (
          <>
            {error && (
              <div style={{ marginTop: 14, padding: '12px 14px', background: colors.redBg, border: `1px solid ${colors.redBorder}`, borderRadius: 12, color: colors.red, fontSize: 14, fontWeight: 600 }}>
                {error}
              </div>
            )}

            {boot.locations && (
              <>
                <div style={label}>Location</div>
                <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={input}>
                  <option value="">Pick your location…</option>
                  {boot.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </>
            )}

            {/* photo first — it's the thing they're holding */}
            <div style={label}>Invoice photo</div>
            <input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} id="camera" />
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${file ? colors.greenBorder : colors.borderStrong}`, borderRadius: 14, background: file ? colors.greenBg : '#fff',
                padding: preview ? 10 : '22px 14px', textAlign: 'center', cursor: 'pointer',
              }}
            >
              {preview ? (
                <img src={preview} alt="invoice" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8 }} />
              ) : file ? (
                <div style={{ fontSize: 15, fontWeight: 700, color: colors.greenDark }}>📎 {file.name}</div>
              ) : (
                <>
                  <div style={{ fontSize: 34 }}>📷</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>Snap the invoice</div>
                  <div style={{ fontSize: 13, color: colors.muted3, marginTop: 3 }}>tap to use the camera or pick a photo / PDF</div>
                </>
              )}
            </div>
            {file && (
              <div onClick={() => { pickFile(null); if (fileRef.current) fileRef.current.value = '' }} style={{ fontSize: 13, fontWeight: 700, color: colors.muted2, marginTop: 6, cursor: 'pointer' }}>
                ✕ remove photo
              </div>
            )}

            <div style={label}>Amount</div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 17, color: colors.muted3 }}>$</span>
              <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...input, paddingLeft: 30 }} className="tnum" />
            </div>

            <div style={label}>Vendor</div>
            <div style={{ position: 'relative' }}>
              <input
                value={vendorText}
                onChange={(e) => { setVendorText(e.target.value); setVendorOpen(true) }}
                onFocus={() => setVendorOpen(true)}
                onBlur={() => { blurTimer.current = setTimeout(() => setVendorOpen(false), 150) }}
                placeholder="Who's it from? e.g. Sysco"
                style={input}
              />
              {vendorOpen && vendorMatches.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(16,44,88,0.18)', padding: 5, zIndex: 30, maxHeight: 250, overflowY: 'auto' }}>
                  {vendorMatches.map((v) => (
                    <div key={v.id} onMouseDown={() => { clearTimeout(blurTimer.current); setVendorText(v.name); setVendorOpen(false) }} style={{ padding: '13px 12px', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
                      {v.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {vendorText.trim() && !resolvedVendor && (
              <div style={{ fontSize: 13, color: '#8A6D1A', marginTop: 6, fontWeight: 600 }}>
                First time from this vendor — the office will double-check it. That's normal.
              </div>
            )}

            <div style={label}>Invoice date</div>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={input} />

            {dupes.length > 0 && (
              <div style={{ marginTop: 14, padding: '12px 14px', background: '#FBF3DC', border: '1px solid #EAD9A8', borderRadius: 12, fontSize: 14, color: '#8A6D1A' }}>
                <div style={{ fontWeight: 700 }}>This might already be in:</div>
                {dupes.map((d) => (
                  <div key={d.id} style={{ marginTop: 4 }}>
                    {fmt2(d.amount)} on {d.invoice_date}{d.invoice_number ? ` · #${d.invoice_number}` : ''}
                  </div>
                ))}
                <div style={{ marginTop: 6 }}>You can still send it — the office will sort it out.</div>
              </div>
            )}

            <div style={label}>Your name</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="So the office knows who dropped it" style={input} autoComplete="name" />

            {!more ? (
              <div onClick={() => setMore(true)} style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>
                ＋ Add invoice #, category, or a note
              </div>
            ) : (
              <>
                <div style={label}>Invoice #</div>
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="If it's printed on the invoice" style={input} />
                <div style={label}>Category</div>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={input}>
                  <option value="">Auto — the system knows most vendors</option>
                  {(boot.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div style={label}>Note</div>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth mentioning" style={input} />
              </>
            )}

            <div
              onClick={submit}
              style={{
                marginTop: 22, padding: '17px 0', textAlign: 'center', borderRadius: 14, fontSize: 18, fontWeight: 700,
                background: canSubmit ? colors.brand : colors.brandTint4, color: '#fff', cursor: canSubmit ? 'pointer' : 'default',
              }}
            >
              {submitting ? 'Sending…' : 'Send invoice'}
            </div>
            <div style={{ fontSize: 12, color: colors.muted3, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
              Goes straight to the books — normal invoices are approved automatically, anything unusual gets a quick look from the office.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
