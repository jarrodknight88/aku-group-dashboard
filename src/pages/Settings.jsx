import { useState } from 'react'
import AppHeader from '../components/AppHeader.jsx'
import { colors, fonts } from '../theme.js'

/* ---------- config data (ported from Settings.dc.html) ---------- */
// These map 1:1 onto the Supabase tables in /supabase (kpi_targets,
// period_snapshots, expense_categories + expense_category_keywords);
// local state stands in until the backend is wired.

const DEFAULT_TARGETS = { void: 1, discount: 3, food: 30, labor: 28, liquor: 24 }

const TARGET_ROWS = [
  { key: 'void', label: 'Void % of Sales', hint: 'Flag when voids exceed this share of sales' },
  { key: 'discount', label: 'Discount % of Sales', hint: 'Flag when discounts exceed this share of sales' },
  { key: 'food', label: 'Food Cost %', hint: 'Target ceiling for cost of food vs food sales' },
  { key: 'labor', label: 'Labor %', hint: 'Target ceiling for labor vs net sales' },
  { key: 'liquor', label: 'Liquor Cost %', hint: 'Target ceiling for cost of liquor vs liquor sales' },
]

const INITIAL_MAPPINGS = [
  { keyword: 'sysco', category: 'COGS – Food' },
  { keyword: 'us foods', category: 'COGS – Food' },
  { keyword: 'restaurant depot', category: 'COGS – Food' },
  { keyword: 'southern glazer', category: 'COGS – Liquor' },
  { keyword: 'republic national', category: 'COGS – Liquor' },
  { keyword: 'georgia power', category: 'Utilities' },
  { keyword: 'comcast', category: 'Utilities' },
  { keyword: 'realty', category: 'Rent' },
  { keyword: 'google ads', category: 'Marketing' },
  { keyword: 'ecolab', category: 'Repairs & Maintenance' },
]

const CATEGORIES = [
  'COGS – Food', 'COGS – Liquor', 'Utilities', 'Rent',
  'Repairs & Maintenance', 'Marketing', 'Payroll Services', 'Supplies', 'Other',
]

const SNAPSHOTS = [
  { period: 'Sep 15 – 21, 2025', sales: '$317,300', covers: '7,650', food: '29.6%', labor: '27.2%', saved: 'auto' },
  { period: 'Sep 8 – 14, 2025', sales: '$298,700', covers: '7,420', food: '30.1%', labor: '27.8%', saved: 'auto' },
  { period: 'Sep 1 – 7, 2025', sales: '$305,100', covers: '7,510', food: '29.2%', labor: '26.9%', saved: 'auto' },
  { period: 'Aug 25 – 31, 2025', sales: '$288,400', covers: '7,180', food: '30.4%', labor: '28.3%', saved: 'auto' },
  { period: 'Aug 18 – 24, 2025', sales: '$294,900', covers: '7,290', food: '29.8%', labor: '27.5%', saved: 'auto' },
  { period: 'Aug 11 – 17, 2025', sales: '$281,600', covers: '7,040', food: '30.7%', labor: '28.1%', saved: 'auto' },
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

/* ---------- page ---------- */

export default function Settings() {
  const [tab, setTab] = useState('targets') // 'targets' | 'history' | 'mapping'
  const [targets, setTargets] = useState({ ...DEFAULT_TARGETS })
  const [snapshots, setSnapshots] = useState(SNAPSHOTS)
  const [mappings, setMappings] = useState(INITIAL_MAPPINGS)
  const [newKeyword, setNewKeyword] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [testValue, setTestValue] = useState('Sysco Atlanta LLC')
  const [copied, setCopied] = useState(false)

  // Vendor tester — case-insensitive; the longest matching keyword wins.
  const v = testValue.toLowerCase()
  let match = null
  mappings.forEach((m) => {
    if (v.includes(m.keyword) && (!match || m.keyword.length > match.keyword.length)) match = m
  })

  const jsonExport = JSON.stringify(
    {
      categories: CATEGORIES,
      mappings: mappings.reduce((o, m) => ({ ...o, [m.keyword]: m.category }), {}),
    },
    null,
    2,
  )

  const addMapping = () => {
    const kw = newKeyword.trim().toLowerCase()
    const cat = newCategory.trim()
    if (!kw || !cat) return
    setMappings((prev) => [...prev.filter((m) => m.keyword !== kw), { keyword: kw, category: cat }])
    setNewKeyword('')
    setNewCategory('')
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
                onClick={() => setTargets({ ...DEFAULT_TARGETS })}
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
              Cells and tiles across the dashboard color green when within target, red when out. Liquor cost is shown without a fixed target.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {TARGET_ROWS.map((r) => (
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
                      value={targets[r.key]}
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
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: colors.brand, padding: '10px 20px', borderRadius: 9, cursor: 'pointer' }}>
                Save Targets
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
                onClick={() => setSnapshots([])}
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
              Weekly snapshots auto-save in the background for trend &amp; delta history, independent of the displayed range. Keeps the most recent{' '}
              <span style={{ fontWeight: 600, color: colors.muted1 }}>24 periods</span> ·{' '}
              <span style={{ fontWeight: 600, color: colors.muted1 }}>{snapshots.length} stored</span>.
            </div>
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
                    <tr key={s.period} style={{ borderTop: `1px solid ${colors.panelGray}`, textAlign: 'right' }}>
                      <td style={{ textAlign: 'left', padding: '11px 16px', fontWeight: 600 }}>{s.period}</td>
                      <td style={{ padding: '11px 12px' }}>{s.sales}</td>
                      <td style={{ padding: '11px 12px' }}>{s.covers}</td>
                      <td style={{ padding: '11px 12px' }}>{s.food}</td>
                      <td style={{ padding: '11px 12px' }}>{s.labor}</td>
                      <td style={{ padding: '11px 16px', color: colors.muted3 }}>{s.saved}</td>
                    </tr>
                  ))}
                  {snapshots.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '18px 16px', color: colors.muted3, fontSize: 12 }}>
                        No snapshots stored. Weekly auto-save will repopulate this list.
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
                    <tr key={m.keyword} style={{ borderBottom: `1px solid ${colors.panelGray}` }}>
                      <td style={{ padding: '10px 6px', fontWeight: 600, fontFamily: 'monospace', color: colors.brand }}>
                        {m.keyword}
                      </td>
                      <td style={{ padding: '10px 6px' }}>{m.category}</td>
                      <td
                        onClick={() => setMappings((prev) => prev.filter((x) => x.keyword !== m.keyword))}
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
                  style={{ ...inputStyle, flex: 1 }}
                />
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
                    background: match ? colors.greenBg : colors.redBg,
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontSize: 11, color: colors.muted2, fontWeight: 600 }}>→ maps to</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: match ? colors.greenDark : colors.red }}>
                    {match ? match.category : 'Other (no match)'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: colors.muted3, marginTop: 10 }}>
                  {match ? `Matched on keyword “${match.keyword}”` : 'No keyword found — would fall back to “Other”.'}
                </div>
              </div>

              {/* Categories */}
              <div style={{ ...panel, padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Category List</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CATEGORIES.map((c) => (
                    <span
                      key={c}
                      style={{ fontSize: 12, fontWeight: 600, color: '#3A4150', background: colors.panelGray, padding: '6px 11px', borderRadius: 7 }}
                    >
                      {c}
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
