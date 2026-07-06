import { useMemo, useRef, useState } from 'react'
import { colors } from '../theme.js'

/**
 * Textarea with @-mention autocomplete over the org roster (list_org_users).
 * Typing "@" opens a picker; picking inserts "@Full Name". On submit, call
 * extractMentions(text, users) to get the profile ids still present in the
 * text — that array rides along on the comment/note insert and drives the
 * notifications fan-out.
 */

const display = (u) => u.full_name || u.email || 'Unknown'

/** The "@fragment" being typed at the caret, or null. */
function fragmentAt(text, caret) {
  const upto = text.slice(0, caret)
  const at = upto.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && /[\w@]/.test(upto[at - 1])) return null // mid-word @ (emails)
  const frag = upto.slice(at + 1)
  if (frag.length > 28 || frag.includes('\n')) return null
  return { start: at, query: frag }
}

/** Profile ids whose "@Full Name" survives in the final text. */
export function extractMentions(text, users) {
  const low = text.toLowerCase()
  return (users ?? []).filter((u) => low.includes('@' + display(u).toLowerCase())).map((u) => u.id)
}

/** Render comment text with @Full Name occurrences highlighted. */
export function MentionText({ text, users }) {
  const names = (users ?? []).map(display).filter(Boolean)
  if (!names.length || !text?.includes('@')) return text
  const pattern = new RegExp(`@(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = []
  let last = 0
  let m
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <span key={m.index} style={{ color: colors.brand, fontWeight: 700 }}>
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (!parts.length) return text
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function MentionInput({ value, onChange, users, placeholder, rows = 2, style }) {
  const ref = useRef(null)
  const [frag, setFrag] = useState(null) // {start, query} while the picker is open
  const [hi, setHi] = useState(0)

  const options = useMemo(() => {
    if (!frag) return []
    const q = frag.query.toLowerCase()
    return (users ?? [])
      .filter((u) => {
        const name = display(u).toLowerCase()
        return !q || name.includes(q) || (u.email ?? '').toLowerCase().startsWith(q)
      })
      .slice(0, 6)
  }, [frag, users])

  const sync = (e) => {
    onChange(e.target.value)
    setFrag(fragmentAt(e.target.value, e.target.selectionStart))
    setHi(0)
  }

  const pick = (u) => {
    const el = ref.current
    const caret = el ? el.selectionStart : value.length
    const f = fragmentAt(value, caret) ?? frag
    if (!f) return
    const insert = '@' + display(u) + ' '
    const next = value.slice(0, f.start) + insert + value.slice(f.start + 1 + f.query.length)
    onChange(next)
    setFrag(null)
    const pos = f.start + insert.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  const onKeyDown = (e) => {
    if (!frag || !options.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((h) => (h + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => (h - 1 + options.length) % options.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      pick(options[hi])
    } else if (e.key === 'Escape') {
      setFrag(null)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={sync}
        onKeyDown={onKeyDown}
        onClick={(e) => setFrag(fragmentAt(e.target.value, e.target.selectionStart))}
        onBlur={() => setTimeout(() => setFrag(null), 150)}
        placeholder={placeholder}
        style={style}
      />
      {frag && options.length > 0 && (
        <div style={{ position: 'absolute', left: 8, right: 8, bottom: 'calc(100% + 4px)', zIndex: 95, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, boxShadow: '0 10px 28px rgba(16,44,88,0.18)', padding: 4, maxHeight: 220, overflowY: 'auto' }}>
          <div style={{ padding: '4px 10px 2px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: colors.muted3, textTransform: 'uppercase' }}>Tag a teammate</div>
          {options.map((u, i) => (
            <div
              key={u.id}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(u)
              }}
              onMouseEnter={() => setHi(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', background: i === hi ? '#EDF2F9' : 'transparent' }}
            >
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: colors.brand, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {display(u).slice(0, 1).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{display(u)}</div>
                <div style={{ fontSize: 10.5, color: colors.muted3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
