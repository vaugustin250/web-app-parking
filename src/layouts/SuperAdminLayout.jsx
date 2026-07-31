import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { to: '/superadmin/companies', icon: '🏢', label: 'All Companies' },
  { to: '/superadmin/add-company', icon: '➕', label: 'Add Company' },
]

export default function SuperAdminLayout() {
  const { signOut, profile } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const initials = profile?.full_name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? 'SA'

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  const currentNav = NAV.find(n => location.pathname.startsWith(n.to))

  return (
    <div className="manager-shell">
      {/* ── Mobile topbar ── */}
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
          {sidebarOpen ? '✕' : '☰'}
        </button>
        <div className="mobile-topbar-title">
          {currentNav?.icon} {currentNav?.label ?? 'Super Admin'}
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
          <div className="sidebar-brand-sub">Super Admin Panel</div>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-avatar" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{profile?.full_name ?? 'Super Admin'}</div>
            <div className="sidebar-user-role" style={{ color: '#f59e0b' }}>Product Creator</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Management</div>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <span className="nav-item-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', padding: '0 12px 12px', lineHeight: 1.6 }}>
            Full access to all company data.
          </div>
          <button className="nav-item" onClick={signOut} style={{ color: '#f87171' }}>
            <span className="nav-item-icon">🚪</span> Sign Out
          </button>
        </div>
      </aside>

      <div className="main-content">
        <Outlet />
      </div>
    </div>
  )
}
