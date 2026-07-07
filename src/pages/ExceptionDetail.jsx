import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import PageTitle, { Crumbs } from '../components/PageTitle.jsx'
import DateRangePicker from '../components/DateRangePicker.jsx'
import { card, StatRow, StatusDot } from '../components/cards.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useRange } from '../state/RangeContext.jsx'
import { supabase } from '../lib/supabase.js'
import { fetchLocations } from '../data/live.js'
import { useScrollLock } from '../lib/useScrollLock.js'
import { useIsMobile, MStatGrid, MList, MRow, MPill, MSeg, MLocSelect } from '../components/mobile.jsx'
import { colors, fonts, layout } from '../theme.js'
import { TIP_HOLD_RULE, TIP_HOLD_DAYS, TIP_HOLD_THRESHOLD } from '../config.js'

/* Exception Flags — live rows from exception_flags for the selected range.
   The large-tip auto-hold rule writes real flags at import time; the other
   audit rules are still pending definition, so the list is sparse for now.
   Review actions persist (status + reviewed_by/reviewed_at) and drive the
   §8 hold flow: Approve & Release schedules the tip's release at hold end
   (it pays on the next run exported after that); Deny keeps it withheld.
   Only owners/admins — the people with payroll access — can act.
   A ?loc= deep link scopes everything and hides the location chips. */

const SEV = {
  high: { label: 'High', color: colors.red, bg: colors.redBg },
  med: { label: 'Medium', color: colors.muted1, bg: colors.pageBg },
  low: { label: 'Low', color: colors.brandTint1, bg: '#EAF0F8' },
}

const RULE_NOTES = {
  [TIP_HOLD_RULE]: `Tip exceeds $${TIP_HOLD_THRESHOLD} on a single card transaction. Auto-held for ${TIP_HOLD_DAYS} days to clear the chargeback window — excluded from the server's payroll tips until released, then added to the next exported run's check. Both movements are notated on the payroll sheet.`,
}

const RULE_PALETTE = [colors.brand, colors.brandTint1, colors.brandTint2, colors.brandTint3, colors.brandTint4]
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const money = (v) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtWhen = (ts) => {
  const d = new Date(ts)
  let h = d.getHours()
  const ap = h >= 12 ? 'p' : 'a'
  h = h % 12 || 12
  return `${MO[d.getMonth()]} ${d.getDate()} · ${h}:${String(d.getMinutes()).padStart(2, '0')}${ap}`
}
const fmtDay = (iso) => (iso ? `${MO[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}` : '')

/** Status → dot color + text; tip rows carry their release date. */
function statusView(f) {
  const rel = f.hold?.release_at
  const releaseWord = rel && rel > new Date().toISOString().slice(0, 10) ? 'Releases' : 'Released'
  switch (f.status) {
    case 'open': return { color: colors.red, text: 'Open' }
    case 'held': return { color: colors.brand, text: rel ? `Held · rel ${fmtDay(rel)}` : 'Held' }
    case 'released': return { color: colors.greenDark, text: rel ? `Released ${fmtDay(rel)}` : 'Released' }
    case 'denied': return { color: colors.red, text: 'Denied' }
    default: return { color: colors.greenDark, text: f.hold ? `${releaseWord} ${fmtDay(rel)}` : 'Approved' } // cleared
  }
}

const fieldLabel = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.muted3, fontWeight: 600 }

function ReviewModal({ flag, locName, canAct, onApprove, onDeny, onClose }) {
  useScrollLock(true)
  const sev = SEV[flag.severity] ?? SEV.med
  const sv = statusView(flag)
  const isHeldTip = !!flag.hold && flag.status === 'held'
  const field = (label, value, bold) => (
    <div>
      <div style={fieldLabel}>{label}</div>
      <div className="tnum" style={{ fontSize: 13, fontWeight: bold ? 700 : 600, marginTop: 3 }}>{value}</div>
    </div>
  )
  const stage = (label, value, flex = 1) => (
    <div style={{ flex }}>
      <div style={{ ...fieldLabel, color: colors.brand, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(16,26,42,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 660, maxWidth: '100%', maxHeight: '85vh', background: '#fff', borderRadius: 16, overflow: 'auto', boxShadow: '0 24px 60px rgba(10,20,40,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px', borderBottom: `1px solid ${colors.border}` }}>
          <div>
            <div style={{ fontFamily: fonts.serif, fontSize: 20, fontWeight: 600 }}>{flag.rule_tripped}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: sev.color, background: sev.bg, padding: '3px 9px', borderRadius: 5 }}>{sev.label}</span>
              <StatusDot color={sv.color} bold={700}>{sv.text}</StatusDot>
            </div>
          </div>
          <div onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: colors.panelGray, color: colors.muted1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>✕</div>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            {field('Date / Time', fmtWhen(flag.occurred_at))}
            {field('Location', locName)}
            {field('Check #', flag.check_number ?? '—')}
            {field('Server', flag.server_name ?? '—')}
            {field('Flagged Amount', money(flag.amount), true)}
          </div>
          {flag.hold && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 18, background: '#E8EEF6', borderRadius: 10, padding: '14px 16px' }}>
              {stage('Flagged', fmtWhen(flag.occurred_at))}
              <div style={{ color: colors.brandTint2, fontSize: 14, padding: '0 10px' }}>→</div>
              {stage(`${TIP_HOLD_DAYS}-day hold ends`, fmtDay(flag.hold.release_at))}
              <div style={{ color: colors.brandTint2, fontSize: 14, padding: '0 10px' }}>→</div>
              {stage('Payout', 'next payroll run exported after release', 1.4)}
            </div>
          )}
          <div style={{ marginTop: 16, background: colors.panelGray, borderRadius: 10, padding: '14px 16px', fontSize: 12, lineHeight: 1.6, color: '#3A4150' }}>
            {RULE_NOTES[flag.rule_tripped] || 'Review this transaction with the closing manager before approving.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: canAct ? 'flex-end' : 'space-between', gap: 10, padding: '16px 24px', borderTop: `1px solid ${colors.border}`, background: '#FAFBFC' }}>
          {!canAct && <div style={{ fontSize: 11, color: colors.muted3 }}>Only owners and admins (payroll access) can act on flags.</div>}
          {canAct && ['open', 'held'].includes(flag.status) && (
            <>
              <div onClick={onDeny} style={{ padding: '10px 18px', border: `1px solid ${colors.redBorder}`, borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 700, color: colors.red, cursor: 'pointer' }}>
                ✕ Deny
              </div>
              <div onClick={onApprove} style={{ padding: '10px 18px', background: colors.greenDark, color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                ✓ {isHeldTip ? `Approve & Release ${fmtDay(flag.hold.release_at)}` : 'Approve'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ExceptionDetail() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { range } = useRange()
  const { profile, session } = useAuth()
  const [locations, setLocations] = useState([])
  const [flags, setFlags] = useState(null)
  const [holds, setHolds] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const isMobile = useIsMobile() // all | open | cleared
  const [selected, setSelected] = useState(null)
  const [reload, setReload] = useState(0)

  const canAct = ['owner', 'admin'].includes(profile?.role)

  useEffect(() => {
    fetchLocations().then(setLocations).catch(() => setLocations([]))
  }, [])

  useEffect(() => {
    let live = true
    Promise.all([
      supabase
        .from('exception_flags')
        .select('*')
        .gte('occurred_at', range.start + 'T00:00:00Z')
        .lte('occurred_at', range.end + 'T23:59:59Z')
        .order('occurred_at', { ascending: false }),
      supabase.from('tip_holds').select('*'),
    ]).then(([f, h]) => {
      if (!live) return
      setFlags(f.data ?? [])
      setHolds(h.data ?? [])
    })
    return () => { live = false }
  }, [range.start, range.end, reload])

  const locByCode = Object.fromEntries(locations.map((l) => [l.code.toLowerCase(), l]))
  const locById = Object.fromEntries(locations.map((l) => [l.id, l]))
  let loc = (params.get('loc') || '').toLowerCase()
  if (!locByCode[loc]) loc = ''
  const scopeName = loc ? locByCode[loc]?.name : 'org-wide'

  const holdByException = useMemo(() => new Map(holds.map((h) => [h.exception_id, h])), [holds])

  const all = useMemo(
    () =>
      (flags ?? [])
        .filter((f) => (loc ? f.location_id === locByCode[loc]?.id : true))
        .map((f) => ({ ...f, hold: holdByException.get(f.id) ?? null })),
    [flags, loc, locations, holdByException],
  )

  const filtered = all.filter((f) =>
    statusFilter === 'open' ? ['open', 'held'].includes(f.status)
    : statusFilter === 'cleared' ? ['cleared', 'denied', 'released'].includes(f.status)
    : true,
  )

  const atRisk = all.filter((f) => ['open', 'held'].includes(f.status)).reduce((s, f) => s + Number(f.amount || 0), 0)
  const openCount = all.filter((f) => f.status === 'open').length
  const heldCount = all.filter((f) => f.status === 'held').length
  const resolvedCount = all.filter((f) => ['cleared', 'denied', 'released'].includes(f.status)).length

  const ruleRows = useMemo(() => {
    const counts = {}
    all.forEach((f) => { counts[f.rule_tripped] = (counts[f.rule_tripped] || 0) + 1 })
    const arr = Object.entries(counts).map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count)
    const max = arr[0]?.count ?? 1
    return arr.slice(0, 6).map((x, i) => ({ ...x, pct: Math.round((x.count / max) * 100), color: RULE_PALETTE[i % RULE_PALETTE.length] }))
  }, [all])

  const sel = all.find((f) => f.id === selected) ?? null

  const review = async (flag, approve) => {
    const { error } = await supabase
      .from('exception_flags')
      .update({ status: approve ? 'cleared' : 'denied', reviewed_by: session?.user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq('id', flag.id)
    if (!error && flag.hold) {
      // On approval, release_at becomes the approval date — the tip pays on the
      // next payroll run exported after this moment, not the scheduled window
      // end. Denied holds keep their original date for the audit trail.
      const patch = approve
        ? { status: 'released', release_at: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }
        : { status: 'denied', updated_at: new Date().toISOString() }
      await supabase.from('tip_holds').update(patch).eq('id', flag.hold.id)
    }
    setSelected(null)
    setReload((k) => k + 1)
  }

  const exportCsv = () => {
    const head = 'occurred_at,location,check,server,rule,amount,severity,status'
    const lines = filtered.map((f) =>
      [f.occurred_at, locById[f.location_id]?.name ?? '', f.check_number ?? '', f.server_name ?? '', `"${f.rule_tripped}"`, f.amount, f.severity, f.status].join(','),
    )
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `exception-flags-${range.start}-${range.end}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const btn = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 15px', border: `1px solid ${colors.borderStrong}`, borderRadius: 9, background: '#fff', fontSize: 13, fontWeight: 600, color: '#3A4150', cursor: 'pointer' }
  const chipStyle = (active) => ({ padding: '7px 14px', borderRadius: 6, background: active ? colors.brand : 'transparent', color: active ? '#fff' : colors.muted1, fontSize: 12, fontWeight: 600, cursor: 'pointer' })

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="locations" />

      <div style={{ maxWidth: layout.maxWidth, margin: '0 auto', padding: '20px 26px 48px' }}>
        <Crumbs
          items={[
            loc ? { label: locByCode[loc]?.name ?? 'Location', to: `/locations/${loc}` } : { label: 'Company', to: '/' },
            { label: 'Money Protected' },
            { label: 'Exception Flags' },
          ]}
        />
        <PageTitle
          title="Exception Flags"
          meta={
            <>
              Transactions tripping audit rules · {scopeName} ·{' '}
              <span style={{ color: colors.muted2 }}>large-tip auto-hold live · other audit rules pending definition</span>
            </>
          }
          right={
            isMobile ? (
              <DateRangePicker />
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <DateRangePicker />
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={btn} onClick={exportCsv}>Export CSV</div>
                <div style={{ ...btn, cursor: 'default', color: colors.muted3 }}>+ Manual entry</div>
              </div>
            </div>
            )
          }
        />

        {/* ===== SUMMARY STRIP ===== */}
        {isMobile ? (
          <MStatGrid
            style={{ marginBottom: 12 }}
            items={[
              { label: 'Open / Unreviewed', value: openCount + heldCount, hero: true, valueColor: openCount + heldCount > 0 ? colors.red : colors.greenDark, sub: <span>{openCount + heldCount > 0 ? 'needs attention' : 'all reviewed'} · {money(atRisk)} at risk</span> },
              { label: 'Total Flags', value: all.length, sub: <span>this period</span> },
              { label: 'Cleared', value: resolvedCount, valueColor: colors.greenDark, sub: <span>approved + denied + released</span> },
            ]}
          />
        ) : (
        <StatRow
          size={26}
          min={170}
          style={{ marginBottom: 20 }}
          items={[
            { label: 'Total Flags', value: all.length, sub: <span style={{ fontSize: 11, color: colors.muted3 }}>{heldCount > 0 ? `${heldCount} large-tip hold(s) included` : 'This period'}</span> },
            { label: '$ at Risk', value: money(atRisk), sub: <span style={{ fontSize: 11, color: colors.muted3 }}>Open + held exposure</span> },
            { label: 'Open / Unreviewed', value: openCount + heldCount, valueColor: openCount + heldCount > 0 ? colors.red : colors.ink, sub: <span style={{ fontSize: 11, color: openCount + heldCount > 0 ? colors.red : colors.muted3, fontWeight: 600 }}>{openCount + heldCount > 0 ? 'Needs attention' : 'All reviewed'}</span> },
            { label: 'Cleared', value: resolvedCount, valueColor: colors.greenDark, sub: <span style={{ fontSize: 11, color: colors.muted3 }}>Approved + denied + released</span> },
          ]}
        />
        )}

        {/* ===== RULE BREAKDOWN ===== */}
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Flags by Audit Rule</div>
          {ruleRows.length === 0 ? (
            <div style={{ color: colors.muted3, fontSize: 12 }}>No flags in this range.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {ruleRows.map((rr) => (
                <div key={rr.rule} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: isMobile ? 120 : 230, fontSize: 12, color: '#3A4150', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rr.rule}</span>
                  <div style={{ flex: 1, height: 10, background: colors.pageBg, borderRadius: 5 }}>
                    <div style={{ width: `${rr.pct}%`, height: '100%', background: rr.color, borderRadius: 5 }} />
                  </div>
                  <span className="tnum" style={{ width: 28, textAlign: 'right', fontSize: 12, fontWeight: 700 }}>{rr.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== FILTER BAR ===== */}
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {!loc && locations.filter((l) => l.status === 'active').length > 1 && (
              <MLocSelect
                value=""
                onChange={(code) => { if (code) navigate(`/exceptions?loc=${code}`) }}
                options={[{ value: '', label: 'All locations' }, ...locations.filter((l) => l.status === 'active').map((l) => ({ value: l.code.toLowerCase(), label: l.name }))]}
              />
            )}
            <MSeg
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: 'all', label: `All (${all.length})` }, { value: 'open', label: 'Open' }, { value: 'cleared', label: 'Cleared' }]}
            />
          </div>
        ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          {/* Location chips only org-wide — a scoped manager link hides them */}
          {!loc && (
            <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
              <Link to="/exceptions" style={chipStyle(true)}>All locations</Link>
              {locations.filter((l) => l.status === 'active').map((l) => (
                <Link key={l.id} to={`/exceptions?loc=${l.code.toLowerCase()}`} style={chipStyle(false)}>{l.name}</Link>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, background: '#fff', border: `1px solid ${colors.border}`, padding: 4, borderRadius: 9 }}>
            {[['all', 'All'], ['open', 'Open'], ['cleared', 'Cleared']].map(([k, label]) => (
              <div key={k} onClick={() => setStatusFilter(k)} style={chipStyle(statusFilter === k)}>{label}</div>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: colors.muted3 }}>
            Showing <span style={{ color: '#3A4150', fontWeight: 600 }}>{filtered.length}</span> flagged transactions
          </div>
        </div>
        )}

        {/* ===== EXCEPTION TABLE ===== */}
        {isMobile ? (
          <MList>
            {flags === null && <div style={{ padding: 16, color: colors.muted3, fontSize: 12 }}>Loading…</div>}
            {flags !== null && filtered.length === 0 && (
              <div style={{ padding: 16, color: colors.muted3, fontSize: 12 }}>
                No flags in this range — the large-tip auto-hold rule runs nightly at import.
              </div>
            )}
            {filtered.map((f, i) => {
              const sev = SEV[f.severity] ?? SEV.med
              const sv = statusView(f)
              return (
                <MRow
                  key={f.id}
                  first={i === 0}
                  onClick={() => setSelected(f.id)}
                  title={`${f.rule_tripped}${f.check_number ? ` · #${f.check_number}` : ''}`}
                  sub={`${fmtWhen(f.occurred_at)} · ${locById[f.location_id]?.name ?? '—'}${f.server_name ? ` · ${f.server_name}` : ''}`}
                  value={money(f.amount)}
                  valueSub={sv.text}
                  pill={<MPill tone={sev.label === 'High' ? 'red' : 'gray'}>{sev.label}</MPill>}
                />
              )
            })}
          </MList>
        ) : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 760 }}>
              <thead>
                <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'left' }}>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Date / Time</th>
                  <th style={{ padding: 12, fontWeight: 600 }}>Location</th>
                  <th style={{ padding: 12, fontWeight: 600 }}>Check #</th>
                  <th style={{ padding: 12, fontWeight: 600 }}>Server</th>
                  <th style={{ padding: 12, fontWeight: 600 }}>Rule Tripped</th>
                  <th style={{ padding: 12, fontWeight: 600, textAlign: 'right' }}>Amount</th>
                  <th style={{ padding: 12, fontWeight: 600 }}>Severity</th>
                  <th style={{ padding: '12px 18px', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {flags === null && (
                  <tr><td colSpan={8} style={{ padding: 18, color: colors.muted3 }}>Loading…</td></tr>
                )}
                {flags !== null && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 18, color: colors.muted3 }}>
                      No flags in this range — the large-tip auto-hold rule runs nightly at import; more audit rules are pending definition.
                    </td>
                  </tr>
                )}
                {filtered.map((f) => {
                  const sev = SEV[f.severity] ?? SEV.med
                  const sv = statusView(f)
                  return (
                    <tr key={f.id} className="row-hover" onClick={() => setSelected(f.id)} style={{ borderTop: `1px solid ${colors.pageBg}`, cursor: 'pointer' }}>
                      <td style={{ padding: '13px 18px', color: '#3A4150', whiteSpace: 'nowrap' }}>{fmtWhen(f.occurred_at)}</td>
                      <td style={{ padding: '13px 12px' }}>{locById[f.location_id]?.name ?? '—'}</td>
                      <td style={{ padding: '13px 12px', color: colors.muted2 }}>{f.check_number ?? '—'}</td>
                      <td style={{ padding: '13px 12px' }}>{f.server_name ?? '—'}</td>
                      <td style={{ padding: '13px 12px' }}>{f.rule_tripped}</td>
                      <td style={{ padding: '13px 12px', textAlign: 'right', fontWeight: 700 }}>{money(f.amount)}</td>
                      <td style={{ padding: '13px 12px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: sev.color, background: sev.bg, padding: '3px 9px', borderRadius: 5 }}>{sev.label}</span>
                      </td>
                      <td style={{ padding: '13px 18px', whiteSpace: 'nowrap' }}>
                        <StatusDot color={sv.color}>{sv.text}</StatusDot>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      {sel && (
        <ReviewModal
          flag={sel}
          locName={locById[sel.location_id]?.name ?? '—'}
          canAct={canAct}
          onApprove={() => review(sel, true)}
          onDeny={() => review(sel, false)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
