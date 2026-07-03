import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { colors, fonts } from '../theme.js'
import { normalizeVendorName } from '../data/financials.js'

/* Mobile invoice intake (/submit?k=<token>) — the no-login page managers keep
   on their phone. The token in the URL is the credential (same trust model as
   the old Fillout link, revocable in invoice_intake_links); everything talks
   to the invoice-intake Edge Function, never to the database directly.

   Design: the dashboard's enterprise language (Aku blue, Newsreader headings,
   hairline-divided white card) at touch scale. The attach input carries NO
   `capture` attribute on purpose — that's what lets iOS offer its native
   sheet (Photo Library / Take Photo / Choose File) instead of jumping
   straight into the camera. */

const FN_URL =
  (import.meta.env.VITE_SUPABASE_URL || 'https://bvqubtromgldqnnhfeuz.supabase.co') + '/functions/v1/invoice-intake'

const fmt2 = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toLocaleDateString('en-CA')
const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB')
const fmtDateLong = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

async function callFn(payload) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Something went wrong — please try again.')
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
  if (file.size > 12 * 1024 * 1024) throw new Error('That file is too large — a photo of the invoice works best.')
  return { type: file.type || 'application/pdf', data: await toB64(file) }
}

/* ---- inline icons (stroke inherits currentColor) ---- */
const Icon = {
  camera: (s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  ),
  doc: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4M9.5 12h5M9.5 15.5h5" />
    </svg>
  ),
  check: (s = 30) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  ),
  alert: (s = 15) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4L2.8 20h18.4L12 4zM12 10v4.4M12 17.4v.2" />
    </svg>
  ),
  clock: (s = 30) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  lock: (s = 26) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
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
  const [done, setDone] = useState(null) // { status, reasons, vendor, amount, date, locationName, name }
  const fileRef = useRef(null)
  const blurTimer = useRef(null)

  useEffect(() => {
    if (!token) { setDead('This page only works from the link the office shared with you. Open it from that message.'); return }
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
      const locationName = boot?.location?.name ?? boot?.locations?.find((l) => l.id === locationId)?.name ?? ''
      setDone({ status: r.status, reasons: r.flag_reasons ?? [], vendor: r.vendor, amount: Number(amount), date: invoiceDate, locationName, name: name.trim() })
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

  /* ---- design tokens at touch scale ---- */
  const page = { minHeight: '100vh', background: colors.pageBg, color: colors.ink, fontFamily: fonts.sans, paddingBottom: 44 }
  const shell = { maxWidth: 480, margin: '0 auto', padding: '0 14px' }
  const cardStyle = { background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(16,44,88,0.05), 0 8px 24px rgba(16,44,88,0.06)', overflow: 'hidden' }
  const section = { padding: '18px 18px 20px' }
  const hairline = { height: 1, background: colors.pageBg }
  const sectionTitle = { fontSize: 11, fontWeight: 700, color: colors.muted3, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }
  const label = { fontSize: 12, fontWeight: 600, color: colors.muted1, margin: '14px 0 6px' }
  const input = { width: '100%', padding: '13px 14px', border: `1px solid ${colors.borderStrong}`, borderRadius: 10, fontSize: 16, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', color: colors.ink }
  const footer = (
    <div style={{ textAlign: 'center', fontSize: 11, color: colors.muted3, marginTop: 18, letterSpacing: '0.02em' }}>
      Aku Group Operations · Secure invoice intake
    </div>
  )

  const header = (
    <div style={{ background: `linear-gradient(160deg, ${colors.brand} 0%, ${colors.navy} 100%)`, color: '#fff', padding: '16px 0 42px', marginBottom: -28 }}>
      <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.serif, fontWeight: 600, fontSize: 17 }}>A</div>
          <div style={{ lineHeight: 1.12 }}>
            <div style={{ fontFamily: fonts.serif, fontWeight: 600, fontSize: 16, letterSpacing: '-0.01em' }}>Aku Group</div>
            <div style={{ fontSize: 9, opacity: 0.75, fontWeight: 600, letterSpacing: '0.09em' }}>OPERATIONS</div>
          </div>
        </div>
        {(boot?.location?.name || boot?.label) && (
          <div style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', whiteSpace: 'nowrap' }}>
            {boot?.location?.name || boot?.label}
          </div>
        )}
      </div>
    </div>
  )

  if (dead) {
    return (
      <div style={page}>
        {header}
        <div style={shell}>
          <div style={{ ...cardStyle, padding: '38px 24px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: colors.panelGray, color: colors.muted2 }}>
              {Icon.lock()}
            </div>
            <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600, margin: '14px 0 8px' }}>This link isn't active</div>
            <div style={{ fontSize: 14, color: colors.muted1, lineHeight: 1.55 }}>{dead}</div>
          </div>
          {footer}
        </div>
      </div>
    )
  }

  if (done) {
    const approved = done.status === 'auto_approved'
    const summaryRow = (k, v) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: `1px solid ${colors.pageBg}`, fontSize: 14 }}>
        <span style={{ color: colors.muted2 }}>{k}</span>
        <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
      </div>
    )
    return (
      <div style={page}>
        {header}
        <div style={shell}>
          <div style={cardStyle}>
            <div style={{ padding: '30px 22px 22px', textAlign: 'center' }}>
              <div style={{ width: 62, height: 62, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: approved ? colors.greenBg : '#FBF3DC', color: approved ? colors.greenDark : '#8A6D1A' }}>
                {approved ? Icon.check() : Icon.clock()}
              </div>
              <div style={{ fontFamily: fonts.serif, fontSize: 23, fontWeight: 600, margin: '14px 0 6px' }}>
                {approved ? 'Invoice recorded' : 'Submitted for review'}
              </div>
              <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '4px 11px', borderRadius: 999, background: approved ? colors.greenBg : '#FBF3DC', color: approved ? colors.greenDark : '#8A6D1A' }}>
                {approved ? 'Approved automatically' : 'Pending office review'}
              </div>
            </div>
            <div style={{ padding: '0 22px 6px' }}>
              {summaryRow('Amount', fmt2(done.amount))}
              {summaryRow('Vendor', done.vendor)}
              {summaryRow('Invoice date', fmtDateLong(done.date))}
              {done.locationName && summaryRow('Location', done.locationName)}
              {done.name && summaryRow('Submitted by', done.name)}
            </div>
            {!approved && done.reasons.length > 0 && (
              <div style={{ margin: '10px 22px 18px', background: '#FBF3DC', border: '1px solid #EAD9A8', borderRadius: 10, padding: '11px 13px', fontSize: 13, color: '#8A6D1A', textAlign: 'left', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Why it's being reviewed</div>
                {done.reasons.map((r, i) => <div key={i} style={{ marginTop: i ? 4 : 0 }}>• {r}</div>)}
              </div>
            )}
            <div style={{ padding: '6px 18px 18px' }}>
              <div onClick={reset} className="mi-press" style={{ padding: '15px 0', textAlign: 'center', background: colors.brand, color: '#fff', borderRadius: 11, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                Submit another invoice
              </div>
              {approved && <div style={{ fontSize: 12.5, color: colors.muted3, textAlign: 'center', marginTop: 10 }}>Nothing else to do — it's already in the books.</div>}
            </div>
          </div>
          {footer}
        </div>
      </div>
    )
  }

  return (
    <div style={page}>
      {header}
      <div style={shell}>
        <div style={cardStyle}>
          <div style={{ padding: '18px 18px 14px' }}>
            <div style={{ fontFamily: fonts.serif, fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em' }}>Submit an invoice</div>
            <div style={{ fontSize: 13, color: colors.muted2, marginTop: 3 }}>Takes under a minute — attach it, enter the amount, send.</div>
          </div>
          <div style={hairline} />

          {!boot ? (
            <div style={{ padding: '36px 0 40px', textAlign: 'center', color: colors.muted3, fontSize: 14 }}>Loading…</div>
          ) : (
            <>
              {error && (
                <div style={{ margin: '14px 18px 0', padding: '11px 13px', background: colors.redBg, border: `1px solid ${colors.redBorder}`, borderRadius: 10, color: colors.red, fontSize: 13.5, fontWeight: 600 }}>
                  {error}
                </div>
              )}

              {/* ---- document ---- */}
              <div style={section}>
                <div style={sectionTitle}>Invoice document</div>
                {/* no `capture` attr → iOS shows Photo Library / Take Photo / Choose File */}
                <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                {!file ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="mi-press"
                    style={{ border: `1px solid ${colors.borderStrong}`, borderRadius: 12, background: colors.panelGray, padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: '#E8EEF6', color: colors.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {Icon.camera()}
                    </div>
                    <div style={{ lineHeight: 1.35 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>Add photo or PDF</div>
                      <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 2 }}>Take a photo, choose from your library, or attach a file</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ border: `1px solid ${colors.greenBorder}`, borderRadius: 12, background: colors.greenBg, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                    {preview ? (
                      <img src={preview} alt="invoice" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: `1px solid ${colors.greenBorder}` }} />
                    ) : (
                      <div style={{ width: 52, height: 52, borderRadius: 8, background: '#fff', color: colors.brand, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${colors.greenBorder}` }}>
                        {Icon.doc()}
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1, lineHeight: 1.35 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.greenDark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                      <div style={{ fontSize: 12, color: colors.muted2 }}>{fmtBytes(file.size)} · attached</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                      <span onClick={() => fileRef.current?.click()} style={{ fontSize: 12, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>Replace</span>
                      <span onClick={() => { pickFile(null); if (fileRef.current) fileRef.current.value = '' }} style={{ fontSize: 12, fontWeight: 700, color: colors.muted2, cursor: 'pointer' }}>Remove</span>
                    </div>
                  </div>
                )}
              </div>
              <div style={hairline} />

              {/* ---- details ---- */}
              <div style={section}>
                <div style={sectionTitle}>Invoice details</div>

                {boot.locations && (
                  <>
                    <div style={{ ...label, marginTop: 0 }}>Location</div>
                    <select className="mi-input" value={locationId} onChange={(e) => setLocationId(e.target.value)} style={input}>
                      <option value="">Select location…</option>
                      {boot.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </>
                )}

                <div style={{ ...label, marginTop: boot.locations ? 14 : 0 }}>Amount</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: colors.muted3 }}>$</span>
                  <input className="mi-input tnum" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...input, paddingLeft: 30 }} />
                </div>

                <div style={label}>Vendor</div>
                <div style={{ position: 'relative' }}>
                  <input
                    className="mi-input"
                    value={vendorText}
                    onChange={(e) => { setVendorText(e.target.value); setVendorOpen(true) }}
                    onFocus={() => setVendorOpen(true)}
                    onBlur={() => { blurTimer.current = setTimeout(() => setVendorOpen(false), 150) }}
                    placeholder="e.g. Sysco, Restaurant Depot"
                    style={input}
                  />
                  {vendorOpen && vendorMatches.length > 0 && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 11, boxShadow: '0 12px 32px rgba(16,44,88,0.18)', padding: 5, zIndex: 30, maxHeight: 250, overflowY: 'auto' }}>
                      {vendorMatches.map((v) => (
                        <div key={v.id} onMouseDown={() => { clearTimeout(blurTimer.current); setVendorText(v.name); setVendorOpen(false) }} style={{ padding: '12px 12px', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                          {v.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {vendorText.trim() && !resolvedVendor && (
                  <div style={{ fontSize: 12.5, color: colors.muted2, marginTop: 6, lineHeight: 1.45 }}>
                    New vendor — first submissions are routed to the office for a one-time review.
                  </div>
                )}

                <div style={label}>Invoice date</div>
                <input className="mi-input" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={input} />

                {dupes.length > 0 && (
                  <div style={{ marginTop: 14, padding: '11px 13px', background: '#FBF3DC', border: '1px solid #EAD9A8', borderRadius: 10, fontSize: 13, color: '#8A6D1A', lineHeight: 1.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                      {Icon.alert()} Possible duplicate
                    </div>
                    {dupes.map((d) => (
                      <div key={d.id} style={{ marginTop: 4 }}>
                        {fmt2(d.amount)} on {fmtDateLong(d.invoice_date)}{d.invoice_number ? ` · #${d.invoice_number}` : ''} is already recorded.
                      </div>
                    ))}
                    <div style={{ marginTop: 4 }}>You can still submit — it will be routed to review rather than posted twice.</div>
                  </div>
                )}

                {!more ? (
                  <div onClick={() => setMore(true)} style={{ marginTop: 16, fontSize: 13.5, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>
                    ＋ Invoice number, category, or note
                  </div>
                ) : (
                  <>
                    <div style={label}>Invoice number <span style={{ fontWeight: 500, color: colors.muted3 }}>(optional)</span></div>
                    <input className="mi-input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="As printed on the invoice" style={input} />
                    <div style={label}>Category <span style={{ fontWeight: 500, color: colors.muted3 }}>(optional)</span></div>
                    <select className="mi-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={input}>
                      <option value="">Automatic — based on the vendor</option>
                      {(boot.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div style={label}>Note <span style={{ fontWeight: 500, color: colors.muted3 }}>(optional)</span></div>
                    <input className="mi-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the office should know" style={input} />
                  </>
                )}
              </div>
              <div style={hairline} />

              {/* ---- submitted by ---- */}
              <div style={section}>
                <div style={sectionTitle}>Submitted by</div>
                <input className="mi-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={input} autoComplete="name" />
                <div style={{ fontSize: 12, color: colors.muted3, marginTop: 6 }}>Remembered on this phone for next time.</div>
              </div>

              <div style={{ padding: '2px 18px 18px' }}>
                <div
                  onClick={submit}
                  className="mi-press"
                  style={{
                    padding: '16px 0', textAlign: 'center', borderRadius: 11, fontSize: 16.5, fontWeight: 700,
                    background: canSubmit ? colors.brand : colors.brandTint4, color: '#fff', cursor: canSubmit ? 'pointer' : 'default',
                  }}
                >
                  {submitting ? 'Submitting…' : 'Submit invoice'}
                </div>
                <div style={{ fontSize: 12, color: colors.muted3, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
                  Posts directly to the books. Routine invoices are approved automatically; anything unusual is reviewed by the office.
                </div>
              </div>
            </>
          )}
        </div>
        {footer}
      </div>
    </div>
  )
}
