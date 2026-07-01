import { Routes, Route, Navigate } from 'react-router-dom'
import CompanyGlance from './pages/CompanyGlance.jsx'
import ByLocation from './pages/ByLocation.jsx'
import LocationReport from './pages/LocationReport.jsx'
import DetailDrill from './pages/DetailDrill.jsx'
import ExceptionDetail from './pages/ExceptionDetail.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CompanyGlance />} />
      <Route path="/locations" element={<ByLocation />} />
      {/* Location Report — the fully-built Level 2 screen. Scoped by code. */}
      <Route path="/locations/:loc" element={<LocationReport />} />
      <Route path="/detail-drill" element={<DetailDrill />} />
      <Route path="/exceptions" element={<ExceptionDetail />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
