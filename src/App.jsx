import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { RangeProvider } from './state/RangeContext.jsx'
import Login from './pages/Login.jsx'
import CompanyGlance from './pages/CompanyGlance.jsx'
import ByLocation from './pages/ByLocation.jsx'
import LocationReport from './pages/LocationReport.jsx'
import DetailDrill from './pages/DetailDrill.jsx'
import ExceptionDetail from './pages/ExceptionDetail.jsx'
import VoidDiscountDetail from './pages/VoidDiscountDetail.jsx'
import Payroll from './pages/Payroll.jsx'
import KitchenOrderGuide from './pages/KitchenOrderGuide.jsx'
import Financials from './pages/Financials.jsx'
import InvoiceIntake from './pages/InvoiceIntake.jsx'
import MobileIntake from './pages/MobileIntake.jsx'
import Settings from './pages/Settings.jsx'
import { colors } from './theme.js'

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: colors.pageBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.muted3,
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <RangeProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* public, no-login mobile intake — the ?k= token is the credential */}
        <Route path="/submit" element={<MobileIntake />} />
        <Route path="/" element={<RequireAuth><CompanyGlance /></RequireAuth>} />
        <Route path="/locations" element={<RequireAuth><ByLocation /></RequireAuth>} />
        {/* Location Report — the fully-built Level 2 screen. Scoped by code. */}
        <Route path="/locations/:loc" element={<RequireAuth><LocationReport /></RequireAuth>} />
        <Route path="/detail-drill" element={<RequireAuth><DetailDrill /></RequireAuth>} />
        <Route path="/exceptions" element={<RequireAuth><ExceptionDetail /></RequireAuth>} />
        <Route path="/void-discount" element={<RequireAuth><VoidDiscountDetail /></RequireAuth>} />
        <Route path="/payroll" element={<RequireAuth><Payroll /></RequireAuth>} />
        <Route path="/kitchen" element={<RequireAuth><KitchenOrderGuide /></RequireAuth>} />
        <Route path="/financials" element={<RequireAuth><Financials /></RequireAuth>} />
        <Route path="/financials/submit" element={<RequireAuth><InvoiceIntake /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </RangeProvider>
    </AuthProvider>
  )
}
