import { Link, useSearchParams } from 'react-router-dom'
import StubPage from '../components/StubPage.jsx'
import { colors } from '../theme.js'

const LOC_NAMES = { atl: 'Teranga ATL', clt: 'Teranga CLT', afro: 'Afro District' }

export default function ExceptionDetail() {
  const [params] = useSearchParams()
  const loc = params.get('loc')
  const scoped = loc && LOC_NAMES[loc]

  return (
    <StubPage
      active="locations"
      level="Exception Flags"
      title={scoped ? `Exception Flags · ${scoped}` : 'Exception Flags · Org-wide'}
      blurb={
        scoped
          ? `Flagged transactions tripping audit rules for ${scoped}. A location-scoped view like this is what each manager receives via their own ?loc= deep link. Stubbed in this slice.`
          : 'All flagged transactions across every location. Stubbed in this slice — open it scoped from a Location Report to see the per-location view.'
      }
    >
      {scoped && (
        <Link
          to="/locations/atl"
          style={{ display: 'inline-flex', marginTop: 20, fontSize: 13, fontWeight: 600, color: colors.muted2 }}
        >
          ← Back to {scoped}
        </Link>
      )}
    </StubPage>
  )
}
