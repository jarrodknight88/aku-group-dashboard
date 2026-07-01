import { Link } from 'react-router-dom'
import StubPage from '../components/StubPage.jsx'
import { colors } from '../theme.js'

export default function DetailDrill() {
  return (
    <StubPage
      active="locations"
      level="Level 3 — Detail Drill"
      title="Detail Drill · Teranga ATL"
      blurb="Top-sellers detail with $/Qty toggle, payment-methods detail, the void/exception transaction list, and the monthly P&L summary. Stubbed in this slice."
    >
      <Link
        to="/locations/atl"
        style={{ display: 'inline-flex', marginTop: 20, fontSize: 13, fontWeight: 600, color: colors.muted2 }}
      >
        ← Back to Location Report
      </Link>
    </StubPage>
  )
}
