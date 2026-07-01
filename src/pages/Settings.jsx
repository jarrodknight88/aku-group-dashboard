import StubPage from '../components/StubPage.jsx'

export default function Settings() {
  return (
    <StubPage
      active="settings"
      level="Settings"
      title="Settings"
      blurb="KPI Targets (with Reset to Defaults), Period History (weekly snapshots, keep 24, Clear All), and Expense Category Mapping (keyword rules, vendor tester, JSON export). These map directly onto the Supabase tables in /supabase. Stubbed in this slice."
    />
  )
}
