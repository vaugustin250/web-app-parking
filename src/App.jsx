import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import SyncEngine from './lib/syncEngine'
import Login from './pages/Login'
import WatchmanHome from './pages/watchman/WatchmanHome'
import ManagerLayout from './layouts/ManagerLayout'
import Dashboard from './pages/manager/Dashboard'
import Records from './pages/manager/Records'
import PaymentSettings from './pages/manager/PaymentSettings'
import Reports from './pages/manager/Reports'
import Staff from './pages/manager/Staff'
import Settings from './pages/manager/Settings'
import ParkingPasses from './pages/manager/ParkingPasses'
import ZoneManagementPage from './pages/manager/ZoneManagementPage'
import SuperAdminLayout from './layouts/SuperAdminLayout'
import TenantsPage from './pages/superadmin/TenantsPage'
import CompanyDetail from './pages/superadmin/CompanyDetail'
import AddCompany from './pages/superadmin/AddCompany'
import './index.css'

function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/><span>Loading VBills...</span></div>
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(profile?.role)) return <Navigate to="/" replace />
  return children
}

function RoleRouter() {
  const { role, user, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner"/><span>Loading...</span></div>
  if (role === 'WATCHMAN') return <Navigate to="/watchman" replace />
  if (role === 'MANAGER') return <Navigate to="/manager/dashboard" replace />
  if (role === 'SUPER_ADMIN') return <Navigate to="/superadmin/companies" replace />
  
  if (user && !role) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>
        <h2>Account Setup Incomplete</h2>
        <p>Your login was successful, but your account hasn't been assigned a role or linked to a parking business.</p>
        <p>Please contact your Super Admin, or run the SQL setup script to link your account.</p>
      </div>
    )
  }
  
  return <Navigate to="/login" replace />
}

export default function App() {
  // Always fullscreen on load
  if (typeof document !== 'undefined' && document.documentElement.requestFullscreen) {
    document.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {})
      }
    }, { once: true })
  }

  useEffect(() => {
    SyncEngine.init();
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleRouter />} />

          {/* WATCHMAN — only entry/exit */}
          <Route path="/watchman/*" element={
            <ProtectedRoute allowedRoles={['WATCHMAN']}>
              <WatchmanHome />
            </ProtectedRoute>
          } />

          {/* MANAGER — dashboard, no vehicle entry/exit */}
          <Route path="/manager" element={
            <ProtectedRoute allowedRoles={['MANAGER']}>
              <ManagerLayout />
            </ProtectedRoute>
          }>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="records" element={<Records />} />
            <Route path="payments" element={<PaymentSettings />} />
            <Route path="reports" element={<Reports />} />
            <Route path="passes" element={<ParkingPasses />} />
            <Route path="zones" element={<ZoneManagementPage />} />
            <Route path="staff" element={<Staff />} />
            <Route path="settings" element={<Settings />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* SUPER ADMIN */}
          <Route path="/superadmin" element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN']}>
              <SuperAdminLayout />
            </ProtectedRoute>
          }>
            <Route path="companies" element={<TenantsPage />} />
            <Route path="add-company" element={<AddCompany />} />
            <Route path="company/:tenantId" element={<CompanyDetail />} />
            <Route index element={<Navigate to="companies" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
