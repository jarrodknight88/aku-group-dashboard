import { useEffect, useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import { supabase } from '../lib/supabase.js'
import { colors, fonts } from '../theme.js'

/* ----------
   All three tabs are wired to Supabase:
   - KPI Targets ⇄ kpi_targets (org rows) + reset_kpi_targets()
   - Period History ⇄ get_period_snapshots() / clear_period_snapshots()
   - Expense Mapping ⇄ expense_categories + expense_category_keywords,
     match_expense_category() tester, export_expense_mapping_json()
   Writes are owner/admin-only via RLS; the UI surfaces a denial rather than
   pretending the save landed.
---------- */

const METRIC_ROWS = [
  { key: 'void_pct', label: 'Void % of Sales', hint: 'Flag when voids exceed this share of sales' },
  { key: 'discount_pct', label: 'Discount % of Sales', hint: 'Flag when discounts exceed this share of sales' },
  { key: 'food_pct', label: 'Food Cost %', hint: 'Target ceiling for cost of food vs food sales' },
  { key: 'labor_pct', label: 'Labor %', hint: 'Target ceiling for labor vs net sales' },
  { key: 'liquor_pct', label: 'Liquor Cost %', hint: 'Target ceiling for cost of liquor vs liquor sales' },
]

const panel = {
  background: '#fff',
  border: `1px solid ${colors.border}`,
  borderRadius: 13,
  padding: 24,
}

const inputStyle = {
  padding: '9px 12px',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtPeriod(start, end) {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  const sm = MONTHS[s.getMonth()]
  const em = MONTHS[e.getMonth()]
  const range = sm === em ? `${sm} ${s.getDate()} – ${e.getDate()}` : `${sm} ${s.getDate()} – ${em} ${e.getDate()}`
  return `${range}, ${e.getFullYear()}`
}

const fmtMoney = (v) => (v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }))
const fmtPct = (v) => (v == null ? '—' : Number(v).toFixed(1) + '%')

function ErrorNote({ msg }) {
  if (!msg) return null
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: colors.red, background: colors.redBg, padding: '9px 12px', borderRadius: 8, marginBottom: 14 }}>
      {msg}
    </div>
  )
}

export default function Settings() {
  const [tab, setTab] = useState('targets') // 'targets' | 'history' | 'mapping'

  /* ---- KPI targets ---- */
  const [targets, setTargets] = useState({}) // metric -> threshold (string/number)
  const [targetsError, setTargetsError] = useState('')
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved

  const loadTargets = () =>
    supabase
      .from('kpi_targets')
      .select('metric, threshold')
      .is('location_id', null)
      .then(({ data }) => {
        const next = {}
        for (const r of data ?? []) next[r.metric] = Number(r.threshold)
        setTargets(next)
      })

  useEffect(() => {
    loadTargets()
  }, [])

  const saveTargets = async () => {
    setSaveState('saving')
    setTargetsError('')
    for (const m of METRIC_ROWS) {
      const val = Number(targets[m.key])
      if (Number.isNaN(val)) continue
      const { data, error } = await supabase
        .from('kpi_targets')
        .update({ threshold: val, updated_at: new Date().toISOString() })
        .is('location_id', null)
        .eq('metric', m.key)
        .select()
      if (error || !data?.length) {
        setTargetsError('Save failed — only an owner or admin can edit targets.')
        setSaveState('idle')
        return
      }
    }
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1600)
  }

  const resetTargets = async () => {
    setTargetsError('')
    const { error } = await supabase.rpc('reset_kpi_targets')
    if (error) {
      setTargetsError('Reset failed — only an owner or admin can edit targets.')
      return
    }
    await loadTargets()
  }

  /* ---- period history ---- */
  const [snapshots, setSnapshots] = useState([])
  const [historyError, setHistoryError] = useState('')

  const loadHistory = () =>
    supabase.rpc('get_period_snapshots', { p_scope: 'org' }).then(({ data }) => setSnapshots(data ?? []))

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab])

  const clearHistory = async () => {
    setHistoryError('')
    const { error } = await supabase.rpc('clear_period_snapshots')
    if (error) {
      setHistoryError('Clear failed — only an owner or admin can clear history.')
      return
    }
    await loadHistory()
  }

  /* ---- expense mapping ---- */
  const [categories, setCategories] = useState([])
  const [mappings, setMappings] = useState([]) // {id, keyword, category_id, name}
  const [mappingError, setMappingError] = useState('')
  const [newKeyword, setNewKeyword] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [testValue, setTestValue] = useState('Sysco Atlanta LLC')
  const [testResult, setTestResult] = useState(null) // {category_name, matched_keyword} | null
  const [jsonExport, setJsonExport] = useState('{}')
  const [copied, setCopied] = useState(false)

  const loadMapping = async () => {
    const [{ data: cats }, { data: kws }, { data: json }] = await Promise.all([
      supabase.from('expense_categories').select('id, name, sort_order').order('sort_order'),
      supabase.from('expense_category_keywords').select('id, keyword, category_id, expense_categories(name)'),
      supabase.rpc('export_expense_mapping_json'),
    ])
    setCategories(cats ?? [])
    setMappings(
      (kws ?? [])
        .map((k) => ({ id: k.id, keyword: k.keyword, category_id: k.category_id, name: k.expense_categories?.name ?? '' }))
        .sort((a, b) => a.keyword.localeCompare(b.keyword)),
    )
    setJsonExport(JSON.stringify(json ?? {}, null, 2))
  }

  useEffect(() => {
    if (tab === 'mapping') loadMapping()
  }, [tab])

  // Vendor tester — server-side longest-keyword-wins, debounced.
  useEffect(() => {
    if (tab !== 'mapping') return
    const t = setTimeout(() => {
      supabase
        .rpc('match_expense_category', { p_vendor: testValue })
        .then(({ data }) => setTestResult(data?.[0] ?? null))
    }, 250)
    return () => clearTimeout(t)
  }, [testValue, mappings, tab])

  const addMapping = async () => {
    const kw = newKeyword.trim().toLowerCase()
    const catName = newCategory.trim()
    if (!kw || !catName) return
    setMappingError('')

    let cat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase())
    if (!cat) {
      const { data, error } = await supabase
        .from('expense_categories')
        .insert({ name: catName, sort_order: (categories.at(-1)?.sort_order ?? 0) + 1 })
        .select()
        .single()
      if (error) {
        setMappingError('Add failed — only an owner or admin can edit the mapping.')
        return
      }
      cat = data
    }
    const { error } = await supabase
      .from('expense_category_keywords')
      .upsert({ keyword: kw, category_id: cat.id }, { onConflict: 'keyword' })
    if (error) {
      setMappingError('Add failed — only an owner or admin can edit the mapping.')
      return
    }
    setNewKeyword('')
    setNewCategory('')
    await loadMapping()
  }

  const removeMapping = async (id) => {
    setMappingError('')
    const { data, error } = await supabase.from('expense_category_keywords').delete().eq('id', id).select()
    if (error || !data?.length) {
      setMappingError('Delete failed — only an owner or admin can edit the mapping.')
      return
    }
    await loadMapping()
  }

  const copyJson = () => {
    navigator.clipboard?.writeText(jsonExport).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const tabStyle = (active) => ({
    padding: '9px 18px',
    borderRadius: 7,
    background: active ? colors.brand : 'transparent',
    color: active ? '#fff' : colors.muted1,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  })

  return (
    <div style={{ minHeight: '100vh', background: colors.pageBg, color: colors.ink }}>
      <AppHeader active="settings" maxWidth={1200} showDatePicker={false} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 26px 48px' }}>
        <div style={{ fontFamily: fonts.serif, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>
          Settings
        </div>
        <div style={{ fontSize: 13, color: colors.muted3, marginBottom: 22 }}>
          Configure targets, history, and expense mapping for the whole group
        </div>

        {/* ===== TAB BAR ===== */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            background: '#fff',
            border: `1px solid ${colors.border}`,
            padding: 5,
            borderRadius: 11,
            marginBottom: 24,
            width: 'fit-content',
          }}
        >
          <div onClick={() => setTab('targets')} style={tabStyle(tab === 'targets')}>KPI Targets</div>
          <div onClick={() => setTab('history')} style={tabStyle(tab === 'history')}>Period History</div>
          <div onClick={() => setTab('mapping')} style={tabStyle(tab === 'mapping')}>Expense Category Mapping</div>
        </div>

        {/* ===== KPI TARGETS ===== */}
        {tab === 'targets' && (
          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: 600 }}>KPI Targets</div>
              <div
                onClick={resetTargets}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: colors.brand,
                  cursor: 'pointer',
                  padding: '8px 14px',
                  border: '1px solid #C4D2E6',
                  borderRadius: 8,
                }}
              >
                ↺ Reset to Defaults
              </div>
            </div>
            <div style={{ fontSize: 12, color: colors.muted3, marginBottom: 20 }}>
              Cells and tiles across the dashboard color green when within target, red when out. Targets are shared org-wide.
            </div>
            <ErrorNote msg={targetsError} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {METRIC_ROWS.map((r) => (
                <div
                  key={r.key}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: '1px solid #F0F2F5' }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: colors.muted3, marginTop: 2 }}>{r.hint}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: colors.muted2, fontWeight: 600 }}>&lt;</span>
                    <input
                      type="number"
                      step="0.1"
                      value={targets[r.key] ?? ''}
                      onChange={(e) =>
                        setTargets((prev) => ({ ...prev, [r.key]: e.target.value === '' ? '' : Number(e.target.value) }))
                      }
                      style={{
                        width: 78,
                        padding: '8px 10px',
                        border: `1px solid ${colors.borderStrong}`,
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 700,
                        textAlign: 'right',
                        color: colors.brand,
                        fontFamily: 'inherit',
                      }}
                    />
                    <span style={{ fontSize: 13, color: colors.muted2, fontWeight: 600, width: 14 }}>%</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <div
                onClick={saveState === 'saving' ? undefined : saveTargets}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  background: saveState === 'saved' ? colors.green : colors.brand,
                  padding: '10px 20px',
                  borderRadius: 9,
                  cursor: 'pointer',
                  opacity: saveState === 'saving' ? 0.7 : 1,
                }}
              >
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : 'Save Targets'}
              </div>
            </div>
          </div>
        )}

        {/* ===== PERIOD HISTORY ===== */}
        {tab === 'history' && (
          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: 600 }}>Period History</div>
              <div
                onClick={clearHistory}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: colors.red,
                  cursor: 'pointer',
                  padding: '8px 14px',
                  border: `1px solid ${colors.redBorder}`,
                  borderRadius: 8,
                }}
              >
                Clear All
              </div>
            </div>
            <div style={{ fontSize: 12, color: colors.muted3, marginBottom: 18 }}>
              Weekly snapshots auto-save in the background (Mondays 12:00 UTC) for trend &amp; delta history, independent of the
              displayed range. Keeps the most recent{' '}
              <span style={{ fontWeight: 600, color: colors.muted1 }}>24 periods</span> ·{' '}
              <span style={{ fontWeight: 600, color: colors.muted1 }}>{snapshots.length} stored</span>.
            </div>
            <ErrorNote msg={historyError} />
            <div style={{ border: `1px solid ${colors.pageBg}`, borderRadius: 11, overflow: 'hidden' }}>
              <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: colors.panelGray, color: colors.muted2, textAlign: 'right' }}>
                    <th style={{ textAlign: 'left', padding: '11px 16px', fontWeight: 600 }}>Period</th>
                    <th style={{ padding: '11px 12px', fontWeight: 600 }}>Net Sales</th>
                    <th style={{ padding: '11px 12px', fontWeight: 600 }}>Covers</th>
                    <th style={{ padding: '11px 12px', fontWeight: 600 }}>Food %</th>
                    <th style={{ padding: '11px 12px', fontWeight: 600 }}>Labor %</th>
                    <th style={{ padding: '11px 16px', fontWeight: 600 }}>Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id} style={{ borderTop: `1px solid ${colors.panelGray}`, textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '11px 16px', fontWeight: 600 }}>
                        {fmtPeriod(s.period_start, s.period_end)}
                      </td>
                      <td style={{ padding: '11px 12px' }}>{fmtMoney(s.net_sales)}</td>
                      <td style={{ padding: '11px 12px' }}>{s.covers?.toLocaleString('en-US') ?? '—'}</td>
                      <td style={{ padding: '11px 12px' }}>{fmtPct(s.food_pct)}</td>
                      <td style={{ padding: '11px 12px' }}>{fmtPct(s.labor_pct)}</td>
                      <td style={{ padding: '11px 16px', color: colors.muted3 }}>auto</td>
                    </tr>
                  ))}
                  {snapshots.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '18px 16px', color: colors.muted3, fontSize: 12 }}>
                        No snapshots stored yet. The weekly job writes the first one next Monday — or once daily metrics
                        start flowing from the Toast import.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== EXPENSE MAPPING ===== */}
        {tab === 'mapping' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, alignItems: 'start' }}>
            <div style={panel}>
              <div style={{ fontFamily: fonts.serif, fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                Vendor → Category Mapping
              </div>
              <div style={{ fontSize: 12, color: colors.muted3, marginBottom: 18 }}>
                Keyword-based, case-insensitive. The most specific (longest) matching keyword wins.
              </div>
              <ErrorNote msg={mappingError} />
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: colors.muted2, textAlign: 'left', borderBottom: `1px solid ${colors.pageBg}` }}>
                    <th style={{ padding: '9px 6px', fontWeight: 600 }}>Keyword</th>
                    <th style={{ padding: '9px 6px', fontWeight: 600 }}>Category</th>
                    <th style={{ padding: '9px 6px', fontWeight: 600 }} />
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id} style={{ borderBottom: `1px solid ${colors.panelGray}` }}>
                      <td style={{ padding: '10px 6px', fontWeight: 600, fontFamily: 'monospace', color: colors.brand }}>
                        {m.keyword}
                      </td>
                      <td style={{ padding: '10px 6px' }}>{m.name}</td>
                      <td
                        onClick={() => removeMapping(m.id)}
                        style={{ padding: '10px 6px', textAlign: 'right', color: '#C4C9D1', cursor: 'pointer' }}
                      >
                        ✕
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <input
                  placeholder="keyword (e.g. sysco)"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  placeholder="category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  list="category-options"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <datalist id="category-options">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                <div
                  onClick={addMapping}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#fff',
                    background: colors.brand,
                    padding: '9px 16px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  + Add
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Vendor tester */}
              <div style={{ ...panel, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Vendor-name Tester</div>
                <div style={{ fontSize: 11, color: colors.muted3, marginBottom: 14 }}>
                  Type a vendor name to see how it maps.
                </div>
                <input
                  value={testValue}
                  onChange={(e) => setTestValue(e.target.value)}
                  placeholder="e.g. Sysco Atlanta LLC"
                  style={{ ...inputStyle, width: '100%', padding: '10px 12px', marginBottom: 14 }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 14,
                    background: testResult ? colors.greenBg : colors.redBg,
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontSize: 11, color: colors.muted2, fontWeight: 600 }}>→ maps to</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: testResult ? colors.greenDark : colors.red }}>
                    {testResult ? testResult.category_name : 'Other (no match)'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: colors.muted3, marginTop: 10 }}>
                  {testResult
                    ? `Matched on keyword “${testResult.matched_keyword}”`
                    : 'No keyword found — would fall back to “Other”.'}
                </div>
              </div>

              {/* Categories */}
              <div style={{ ...panel, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Category List</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {categories.map((c) => (
                    <span
                      key={c.id}
                      style={{ fontSize: 12, fontWeight: 600, color: '#3A4150', background: colors.panelGray, padding: '6px 11px', borderRadius: 7 }}
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* JSON export */}
              <div style={{ ...panel, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>JSON Export</div>
                  <div onClick={copyJson} style={{ fontSize: 12, fontWeight: 700, color: colors.brand, cursor: 'pointer' }}>
                    {copied ? '✓ Copied' : '⤓ Copy'}
                  </div>
                </div>
                <pre
                  style={{
                    margin: 0,
                    maxHeight: 200,
                    overflow: 'auto',
                    background: '#102C58',
                    color: colors.brandTint4,
                    padding: 14,
                    borderRadius: 9,
                    fontSize: 11,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {jsonExport}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
