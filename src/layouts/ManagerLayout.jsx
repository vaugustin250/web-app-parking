import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ManagerLayout() {
  const { profile, signOut, settings, tenantData } = useAuth()
  const passesEnabled = settings?.feature_passes_enabled ?? false
  const passesAllowed = tenantData?.feature_passes_allowed ?? false
  const zonesAllowed = tenantData?.feature_zones_allowed ?? false
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const displayName = profile?.fullName || profile?.full_name || profile?.name || 'Manager'
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const MAIN_NAV = [
    { to: '/manager/dashboard', icon: '📊', label: 'Dashboard' },
    { to: '/manager/records', icon: '🚗', label: 'Parking Records' },
    { to: '/manager/reports', icon: '📈', label: 'Reports' },
    ...(passesAllowed || settings?.feature_passes_enabled ? [{ to: '/manager/passes', icon: '🎫', label: 'Parking Passes' }] : []),
    ...(zonesAllowed || settings?.zones_enabled ? [{ to: '/manager/zones', icon: '📍', label: 'Zone Management' }] : []),
  ]

  const ADMIN_NAV = [
    { to: '/manager/payments', icon: '💳', label: 'Payment Settings' },
    { to: '/manager/staff', icon: '👥', label: 'Staff' },
    { to: '/manager/settings', icon: '⚙️', label: 'Settings' },
  ]

  const NAV = [...MAIN_NAV, ...ADMIN_NAV]

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Current page label for mobile topbar
  const currentNav = NAV.find(n => location.pathname.startsWith(n.to))

  return (
    <div className="manager-shell">
      {/* ── Mobile top bar ── */}
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
          {sidebarOpen ? '✕' : '☰'}
        </button>
        <div className="mobile-topbar-title">
          {currentNav?.icon} {currentNav?.label ?? 'VBills'}
        </div>
        <button
          onClick={signOut}
          style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', color: '#f87171', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Sign Out
        </button>
      </div>

      {/* ── Backdrop ── */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/logo.png" alt="VBills Logo" style={{ height: 80, objectFit: 'contain', marginBottom: 0, transform: 'scale(2.2)', filter: 'brightness(0) invert(1)' }} />
          <div className="sidebar-brand-sub">Management Portal</div>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{displayName}</div>
            <div className="sidebar-user-role">Manager</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main</div>
          {MAIN_NAV.map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-item-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
          <div className="nav-section-label">Administration</div>
          {ADMIN_NAV.map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-item-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={signOut} style={{ color: '#f87171' }}>
            <span className="nav-item-icon">🚪</span> Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  )
}
