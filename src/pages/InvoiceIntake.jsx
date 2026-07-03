import { useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle, { Crumbs } from '../components/PageTitle.jsx'
import { card } from '../components/cards.jsx'
import { colors, fonts, layout } from '../theme.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { fetchLocations } from '../data/live.js'
import {
  fetchVendors, fetchVendorAliases, fetchCategories, fetchIntakeLinks, findLikelyDuplicates,
  normalizeVendorName, submitInvoice, uploadInvoiceFile,
} from '../data/financials.js'
import { fmtRange } from '../lib/dates.js'

/* Native invoice intake (INVOICE_SYSTEM reference §10.1) — replaces the
   Fillout form. Live vendor dropdown from the vendors table, category
   auto-fills from the vendor default, duplicates warn in real time before
   submit, and the insert goes straight to the invoices table so the rules
   engine decides auto-approve vs review on the spot. Submitter identity is
   the login (invoices.submitted_by) — no more free-text "your name" field.
   Runs in parallel with Fillout until that's retired. */

const fmt2 = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toLocaleDateString('en-CA') // yyyy-mm-dd, local

export default function InvoiceIntake() {
  const { profile } = useAuth()

  const [locations, setLocations] = useState([])
  const [vendors, setVendors] = useState([])
  const [aliasMap, setAliasMap] = useState(new Map()) // normalized alias → vendor_id
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')

  // form state
  const [locationId, setLocationId] = useState('')
  const [vendorText, setVendorText] = useState('')
  const [vendorOpen, setVendorOpen] = useState(false)
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [catTouched, setCatTouched] = useState(false) // manual pick beats vendor default
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [dupes, setDupes] = useState([])
  const [intakeLinks, setIntakeLinks] = useState([]) // admin-only (RLS): mobile /submit?k=… links
  const [copied, setCopied] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null) // { status, flag_reasons, vendor }
  const fileRef = useRef(null)
  const vendorBlurTimer = useRef(null)

  useEffect(() => {
    Promise.all([fetchLocations(), fetchVendors(), fetchVendorAliases(), fetchCategories()])
      .then(([locs, vens, aliases, cats]) => {
        setLocations(locs)
        setVendors(vens)
        setAliasMap(new Map(aliases.map((a) => [a.alias, a.vendor_id])))
        setCategories(cats)
        const active = locs.filter((l) => l.status === 'active')
        if (active.length === 1) setLocationId(active[0].id)
      })
      .catch((e) => setError(e.message))
    fetchIntakeLinks().then(setIntakeLinks).catch(() => {})
    return () => clearTimeout(vendorBlurTimer.current)
  }, [])

  const active = locations.filter((l) => l.status === 'active')
  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors])

  // resolve the typed name exactly like the DB trigger: alias table first,
  // then canonical-name match — anything else is a brand-new vendor
  const norm = normalizeVendorName(vendorText)
  const resolvedVendor = useMemo(() => {
    if (!norm) return null
    const viaAlias = aliasMap.get(norm)
    if (viaAlias) return vendorById.get(viaAlias) ?? null
    return vendors.find((v) => normalizeVendorName(v.name) === norm) ?? null
  }, [norm, aliasMap, vendorById, vendors])

  const vendorMatches = useMemo(() => {
    if (!norm) return vendors.slice(0, 8)
    const starts = []
    const contains = []
    for (const v of vendors) {
      const n = normalizeVendorName(v.name)
      if (n.startsWith(norm)) starts.push(v)
      else if (n.includes(norm)) contains.push(v)
      if (starts.length >= 8) break
    }
    return [...starts, ...contains].slice(0, 8)
  }, [norm, vendors])

  // vendor default fills the category unless the user picked one themselves
  useEffect(() => {
    if (!catTouched) setCategoryId(resolvedVendor?.default_category_id ?? '')
  }, [resolvedVendor?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // real-time duplicate look-ahead (same query shape as rule 3)
  useEffect(() => {
    if (!resolvedVendor?.id || !Number(amount) || !invoiceDate) { setDupes([]); return }
    const t = setTimeout(() => {
      findLikelyDuplicates({ vendorId: resolvedVendor.id, amount: Number(amount), invoiceDate, invoiceNumber })
        .then(setDupes)
        .catch(() => setDupes([]))
    }, 400)
    return () => clearTimeout(t)
  }, [resolvedVendor?.id, amount, invoiceDate, invoiceNumber])

  const pickVendor = (v) => {
    clearTimeout(vendorBlurTimer.current)
    setVendorText(v.name)
    setVendorOpen(false)
  }

  const canSubmit = locationId && vendorText.trim() && invoiceDate && Number(amount) > 0 && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    setResult(null)
    try {
      const locCode = locations.find((l) => l.id === locationId)?.code?.toLowerCase()
      const fileUrl = file ? await uploadInvoiceFile(file, locCode) : null
      const row = await submitInvoice({
        locationId,
        vendorName: vendorText,
        invoiceDate,
        amount: Number(amount),
        invoiceNumber,
        categoryId: categoryId || null,
        notes,
        fileUrl,
        userId: profile?.id,
      })
      setResult({ status: row.status, reasons: row.flag_reasons ?? [], vendor: row.vendors?.name ?? vendorText.trim(), amount: Number(amount) })
      // keep location + date for back-to-back entry; clear the invoice itself
      setVendorText('')
      setAmount('')
      setInvoiceNumber('')
      setCategoryId('')
      setCatTouched(false)
      setNotes('')
      setFile(null)
      setDupes([])
      if (fileRef.current) fileRef.current.value = ''
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e.message)
    }
    setSubmitting(false)
  }

  /* ---- styles ---- */
  const label = { fontSize: 11, fontWeight: 700, color: colors.muted2, letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: 6 }
  const input = { width: '100%', padding: '10px 12px', border: `1px solid ${colors.borderStrong}`, borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }
  const field = { marginBottom: 16 }
  const catsByGroup = useMemo(() => {
    const m = new Map()
    for (const c of categories) {
      if (!m.has(c.grp)) m.set(c.grp, [])
      m.get(c.grp).push(c)
    }
    return [...m.entries()]
  }, [categories])

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="financials" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <Crumbs items={[{ label: 'Financials', to: '/financials' }, { label: 'Submit invoice' }]} />
        <PageTitle
          title="Submit an Invoice"
          meta={<>Writes straight to the invoice system — normal invoices auto-approve on the spot · submitted as {profile?.full_name || profile?.email || 'you'}</>}
        />

        {error && (
          <div style={{ padding: 14, background: colors.redBg, borderRadius: 9, color: colors.red, fontSize: 13, fontWeight: 600, marginBottom: 18, maxWidth: 660 }}>
            {error}
          </div>
        )}

        {result && (
          <div
            style={{
              padding: '14px 16px', borderRadius: 10, marginBottom: 18, maxWidth: 660, fontSize: 13,
              background: result.status === 'auto_approved' ? colors.greenBg : '#FBF3DC',
              border: `1px solid ${result.status === 'auto_approved' ? colors.greenBorder : '#EAD9A8'}`,
              color: result.status === 'auto_approved' ? colors.greenDark : '#8A6D1A',
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {result.status === 'auto_approved'
                ? `Recorded — ${fmt2(result.amount)} to ${result.vendor} auto-approved and already counted in Financials.`
                : `Submitted — ${fmt2(result.amount)} to ${result.vendor} was flagged for admin review:`}
            </div>
            {result.reasons.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {result.reasons.map((r, i) => <li key={i} style={{ marginTop: 2 }}>{r}</li>)}
              </ul>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* ===== FORM ===== */}
          <div style={{ ...card, padding: 24, flex: '1 1 420px', maxWidth: 660 }}>
            <div style={field}>
              <div style={label}>Location</div>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={input}>
                <option value="">Select location…</option>
                {active.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            <div style={{ ...field, position: 'relative' }}>
              <div style={label}>Vendor</div>
              <input
                value={vendorText}
                onChange={(e) => { setVendorText(e.target.value); setVendorOpen(true) }}
                onFocus={() => setVendorOpen(true)}
                onBlur={() => { vendorBlurTimer.current = setTimeout(() => setVendorOpen(false), 150) }}
                placeholder="Start typing — Sysco, Restaurant Depot…"
                style={input}
              />
              {vendorOpen && vendorMatches.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(16,44,88,0.16)', padding: 5, zIndex: 30, maxHeight: 280, overflowY: 'auto' }}>
                  {vendorMatches.map((v) => (
                    <div key={v.id} className="menu-item" onMouseDown={() => pickVendor(v)} style={{ padding: '8px 11px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span>{v.name}</span>
                      <span style={{ color: colors.muted3, fontWeight: 500 }}>{categories.find((c) => c.id === v.default_category_id)?.name ?? ''}</span>
                    </div>
                  ))}
                </div>
              )}
              {vendorText.trim() && !resolvedVendor && (
                <div style={{ fontSize: 11, color: '#8A6D1A', marginTop: 6, fontWeight: 600 }}>
                  New vendor — the first invoice from "{vendorText.trim()}" will be flagged for a one-time review.
                </div>
              )}
              {resolvedVendor?.is_recurring && resolvedVendor.expected_amount > 0 && (
                <div style={{ fontSize: 11, color: colors.muted2, marginTop: 6 }}>
                  Recurring vendor — usually about {fmt2(resolvedVendor.expected_amount)} {resolvedVendor.expected_frequency === 'weekly' ? 'weekly' : 'monthly'}.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ ...field, flex: '1 1 150px' }}>
                <div style={label}>Invoice date</div>
                <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={input} />
              </div>
              <div style={{ ...field, flex: '1 1 130px' }}>
                <div style={label}>Amount</div>
                <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" style={{ ...input, textAlign: 'right' }} className="tnum" />
              </div>
              <div style={{ ...field, flex: '1 1 130px' }}>
                <div style={label}>Invoice # <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
                <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="—" style={input} />
              </div>
            </div>

            {dupes.length > 0 && (
              <div style={{ padding: '11px 13px', background: '#FBF3DC', border: '1px solid #EAD9A8', borderRadius: 9, marginBottom: 16, fontSize: 12, color: '#8A6D1A' }}>
                <div style={{ fontWeight: 700, marginBottom: 5 }}>Heads up — this looks like it may already be in the system:</div>
                {dupes.map((d) => (
                  <div key={d.id} style={{ marginTop: 3 }}>
                    {fmt2(d.amount)} on {fmtRange(d.invoice_date, d.invoice_date)}
                    {d.invoice_number ? ` · #${d.invoice_number}` : ''} · {d.locations?.name ?? ''} · {d.status.replace('_', ' ')}
                  </div>
                ))}
                <div style={{ marginTop: 6 }}>You can still submit — it will be flagged for admin review instead of auto-approving.</div>
              </div>
            )}

            <div style={field}>
              <div style={label}>Category</div>
              <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setCatTouched(true) }} style={input}>
                <option value="">Auto — use the vendor's usual category</option>
                {catsByGroup.map(([grp, cats]) => (
                  <optgroup key={grp} label={grp || 'Other'}>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
              {!catTouched && resolvedVendor?.default_category_id && (
                <div style={{ fontSize: 11, color: colors.muted3, marginTop: 6 }}>
                  Auto-filled from {resolvedVendor.name}'s usual category — change it if this invoice is different.
                </div>
              )}
            </div>

            <div style={field}>
              <div style={label}>Invoice photo / PDF <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional but encouraged)</span></div>
              <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ ...input, padding: '8px 10px' }} />
            </div>

            <div style={field}>
              <div style={label}>Notes <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the reviewer should know" style={{ ...input, resize: 'vertical' }} />
            </div>

            <div
              onClick={submit}
              style={{
                marginTop: 4, padding: '12px 0', textAlign: 'center', borderRadius: 9, fontSize: 13, fontWeight: 700,
                background: canSubmit ? colors.brand : colors.brandTint4, color: '#fff',
                cursor: canSubmit ? 'pointer' : 'default',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit invoice'}
            </div>
          </div>

          {/* ===== HOW IT WORKS ===== */}
          <div style={{ ...card, padding: 22, flex: '0 1 320px', fontSize: 12, color: colors.muted1, lineHeight: 1.55 }}>
            <div style={{ fontFamily: fonts.serif, fontSize: 16, fontWeight: 600, color: colors.ink, marginBottom: 10 }}>How this works</div>
            <p style={{ margin: '0 0 10px' }}>Submissions go straight into the invoice system — no more Fillout form or spreadsheet.</p>
            <p style={{ margin: '0 0 10px' }}><b>Normal invoices auto-approve instantly</b> and count in Financials right away. The rules only hold something back when it looks off:</p>
            <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
              <li>first invoice from a new vendor</li>
              <li>possible duplicate (same vendor &amp; amount within a week, or same invoice #)</li>
              <li>much higher than the vendor's usual amount</li>
              <li>a recurring bill that's way off its expected amount</li>
            </ul>
            <p style={{ margin: '0 0 10px' }}>Flagged ones land in the <b>Review Queue</b> on the Financials page for an admin to approve or decline.</p>
            <p style={{ margin: 0 }}>Your login is recorded as the submitter, so there's no name field to fill in.</p>

            {intakeLinks.length > 0 && (
              <>
                <div style={{ height: 1, background: colors.border, margin: '16px 0' }} />
                <div style={{ fontFamily: fonts.serif, fontSize: 16, fontWeight: 600, color: colors.ink, marginBottom: 8 }}>Phone links for managers</div>
                <p style={{ margin: '0 0 10px' }}>
                  No login needed — managers open their location's link, snap the invoice, done. Text it to them once and they can keep it on their home screen.
                </p>
                {intakeLinks.map((l) => {
                  const url = `${window.location.origin}/submit?k=${l.token}`
                  return (
                    <div key={l.token} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 0' }}>
                      <span style={{ fontWeight: 700, color: colors.ink }}>{l.label}</span>
                      <span
                        onClick={() => {
                          navigator.clipboard?.writeText(url)
                          setCopied(l.token)
                          setTimeout(() => setCopied(''), 1500)
                        }}
                        style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: copied === l.token ? colors.greenBg : colors.brand, color: copied === l.token ? colors.greenDark : '#fff', whiteSpace: 'nowrap' }}
                      >
                        {copied === l.token ? 'Copied ✓' : 'Copy link'}
                      </span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
