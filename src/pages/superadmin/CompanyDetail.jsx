import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../lib/api'

const TABS = ['Info & Features', 'Staff', 'Parking Zones', 'Settings']

export default function CompanyDetail() {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Info & Features')
  const [tenant, setTenant] = useState(null)
  const [settings, setSettings] = useState(null)
  const [staff, setStaff] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)

  const [showAddStaff, setShowAddStaff] = useState(false)
  const [staffForm, setStaffForm] = useState({ full_name: '', email: '', phone: '', role: 'WATCHMAN', password: '' })
  const [staffSaving, setStaffSaving] = useState(false)
  const [staffError, setStaffError] = useState('')

  const [newZone, setNewZone] = useState({ zone_name: '', total_slots: 10 })
  const [zoneSaving, setZoneSaving] = useState(false)

  const [settingsForm, setSettingsForm] = useState(null)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => { loadAll() }, [tenantId])

  async function loadAll() {
    setLoading(true)
    try {
      const { data } = await api.get(`/api/admin/tenants/${tenantId}`)
      setTenant(data.tenant)
      setSettings(data.settings)
      setSettingsForm({ ...data.settings })
      setStaff(data.users ?? [])
      setZones(data.zones ?? [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  async function updateLicenseStatus(status) {
    await api.patch(`/api/admin/tenants/${tenantId}/status`, { status })
    loadAll()
  }

  async function toggleFeature(feature, currentVal) {
    await api.patch(`/api/admin/tenants/${tenantId}/feature`, { feature, value: !currentVal })
    loadAll()
  }

  async function addStaff(e) {
    e.preventDefault()
    if (!staffForm.email || !staffForm.full_name || !staffForm.password) { setStaffError('All fields required'); return }
    setStaffSaving(true); setStaffError('')
    try {
      await api.post('/api/admin/users', {
        tenantId,
        fullName: staffForm.full_name,
        email: staffForm.email,
        password: staffForm.password,
        phone: staffForm.phone,
        role: staffForm.role
      })
      setShowAddStaff(false)
      setStaffForm({ full_name: '', email: '', phone: '', role: 'WATCHMAN', password: '' })
      loadAll()
    } catch (err) { setStaffError(err.response?.data?.error || err.message) }
    finally { setStaffSaving(false) }
  }

  async function toggleStaff(u) {
    await api.put(`/api/admin/users/${u.id}/toggle`)
    loadAll()
  }

  async function addZone(e) {
    e.preventDefault()
    if (!newZone.zone_name) return
    setZoneSaving(true)
    await api.post('/api/admin/zones', { tenantId, ...newZone, zone_order: zones.length })
    setNewZone({ zone_name: '', total_slots: 10 })
    setZoneSaving(false)
    loadAll()
  }

  async function deleteZone(zoneId) {
    if (!window.confirm('Delete this zone?')) return
    await api.delete(`/api/admin/zones/${zoneId}`)
    loadAll()
  }

  async function saveSettings(e) {
    e.preventDefault()
    setSettingsSaving(true); setSettingsSaved(false)
    try {
      await api.put(`/api/admin/tenants/${tenantId}`, settingsForm)
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
      loadAll()
    } catch (err) { console.error(err) }
    finally { setSettingsSaving(false) }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /><span>Loading company...</span></div>

  const STATUS_COLORS = { ACTIVE: '#22c55e', TRIAL: '#f59e0b', SUSPENDED: '#ef4444', EXPIRED: '#94a3b8' }

  return (
    <>
      <div className="topbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/superadmin/companies')}>← All Companies</button>
        <div style={{ marginLeft: 16 }}>
          <div className="topbar-title">{settings?.company_name ?? tenant?.business_name}</div>
          <div className="topbar-sub">{tenant?.email} · <span style={{ color: STATUS_COLORS[tenant?.license_status] ?? '#64748b', fontWeight: 700 }}>{tenant?.license_status}</span></div>
        </div>
        <div className="topbar-spacer" />
        {settingsSaved && <div style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>✅ Saved!</div>}
      </div>

      <div style={{ borderBottom: '1px solid var(--border-color)', padding: '0 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: tab === t ? 'var(--brand-primary)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--brand-primary)' : '2px solid transparent', whiteSpace: 'nowrap' }}>
            {t}
          </button>
        ))}
      </div>

      <div className="page-content">

        {/* ── INFO & FEATURES TAB ── */}
        {tab === 'Info & Features' && (
          <>
            {/* Company Info */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>🏢 Company Information</div>
              <div className="grid-2">
                {[
                  ['Business Name', tenant?.business_name],
                  ['Email', tenant?.email || '—'],
                  ['Phone', tenant?.phone || '—'],
                  ['Address', tenant?.address || settings?.address || '—'],
                  ['Registered', new Date(tenant?.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })],
                  ['Installation Date', tenant?.installation_date ? new Date(tenant.installation_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'],
                  ['Renewal Date', tenant?.renewal_end ? new Date(tenant.renewal_end).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'],
                  ['Total Slots', settings?.total_slots ?? '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>{label}</div>
                    <div style={{ fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* License Status */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>🔑 License Status</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'].map(s => (
                  <button key={s} className={`btn ${tenant?.license_status === s ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => updateLicenseStatus(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                Current: <b style={{ color: STATUS_COLORS[tenant?.license_status] ?? 'white' }}>{tenant?.license_status}</b>
              </div>
            </div>

            {/* Feature Flags — what this company is allowed to use */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🔧 Feature Permissions</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                Control which features this company is permitted to use. Their manager then turns them on in their own settings.
              </div>

              {[
                { key: 'feature_passes_allowed', icon: '🎫', label: 'Parking Passes', desc: 'Allow this company to issue monthly, weekly, and annual parking passes' },
                { key: 'feature_zones_allowed', icon: '📍', label: 'Zone Parking', desc: 'Allow this company to create and manage parking zones' },
              ].map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{f.icon} {f.label}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{f.desc}</div>
                  </div>
                  <button type="button"
                    onClick={() => toggleFeature(f.key, tenant?.[f.key])}
                    style={{
                      width: 52, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer',
                      background: tenant?.[f.key] ? 'var(--brand-primary)' : 'var(--border-color)',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0
                    }}>
                    <span style={{
                      position: 'absolute', top: 3, left: tenant?.[f.key] ? 26 : 3,
                      width: 22, height: 22, borderRadius: '50%', background: 'white',
                      transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </button>
                </div>
              ))}
            </div>

            {/* Staff summary — names only, no vehicle/revenue data */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>👥 Staff Accounts ({staff.length})</div>
              {staff.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No staff accounts yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {staff.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 99, background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: 'white', flexShrink: 0 }}>
                        {u.full_name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.role} · {u.active ? '🟢 Active' : '🔴 Inactive'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── STAFF TAB ── */}
        {tab === 'Staff' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
              <button className="btn btn-primary" onClick={() => setShowAddStaff(s => !s)}>
                {showAddStaff ? '✕ Cancel' : '+ Add Staff'}
              </button>
            </div>
            {showAddStaff && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Add Staff Member</div>
                {staffError && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{staffError}</div>}
                <form onSubmit={addStaff}>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Full Name *</label>
                      <input className="form-input" value={staffForm.full_name} onChange={e => setStaffForm(f => ({ ...f, full_name: e.target.value }))} placeholder="John Kumar" autoFocus />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email *</label>
                      <input className="form-input" type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Phone</label>
                      <input className="form-input" type="tel" value={staffForm.phone} onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Role *</label>
                      <select className="form-select" value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}>
                        <option value="WATCHMAN">Watchman</option>
                        <option value="MANAGER">Manager</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Password *</label>
                      <input className="form-input" type="password" value={staffForm.password} onChange={e => setStaffForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={staffSaving}>
                    {staffSaving ? '⏳ Creating...' : '✅ Create Account'}
                  </button>
                </form>
              </div>
            )}
            {staff.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>No staff yet</div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      {['Name', 'Role', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.phone || ''}</div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ background: u.role === 'MANAGER' ? '#eef2ff' : '#f0fdf4', color: u.role === 'MANAGER' ? '#4f46e5' : '#059669', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>{u.role}</span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ background: u.active ? '#d1fae5' : '#fee2e2', color: u.active ? '#059669' : '#dc2626', padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>{u.active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => toggleStaff(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── PARKING ZONES TAB ── */}
        {tab === 'Parking Zones' && (
          <>
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Add Parking Zone</div>
              <form onSubmit={addZone}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Zone Name *</label>
                    <input className="form-input" value={newZone.zone_name} onChange={e => setNewZone(z => ({ ...z, zone_name: e.target.value }))} placeholder="Block A, Level 1, etc." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total Slots</label>
                    <input className="form-input" type="number" min="1" value={newZone.total_slots} onChange={e => setNewZone(z => ({ ...z, total_slots: parseInt(e.target.value) }))} />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={zoneSaving}>
                  {zoneSaving ? '⏳...' : '+ Add Zone'}
                </button>
              </form>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {zones.map(z => (
                <div key={z.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontSize: 28 }}>📍</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{z.zone_name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{z.total_slots} total slots</div>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteZone(z.id)}>Delete</button>
                </div>
              ))}
              {zones.length === 0 && <div className="card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>No zones added yet</div>}
            </div>
          </>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'Settings' && settingsForm && (
          <form onSubmit={saveSettings}>
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>⚙️ Company Settings</div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Company Name</label><input className="form-input" value={settingsForm.company_name ?? ''} onChange={e => setSettingsForm(f => ({ ...f, company_name: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Total Slots</label><input className="form-input" type="number" value={settingsForm.total_slots ?? 50} onChange={e => setSettingsForm(f => ({ ...f, total_slots: parseInt(e.target.value) }))} /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-input" type="tel" value={settingsForm.phone ?? ''} onChange={e => setSettingsForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={settingsForm.email ?? ''} onChange={e => setSettingsForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">Currency Symbol</label><input className="form-input" value={settingsForm.currency_symbol ?? '₹'} onChange={e => setSettingsForm(f => ({ ...f, currency_symbol: e.target.value }))} maxLength={3} style={{ width: 80 }} /></div>
              </div>
              <div className="form-group"><label className="form-label">Address</label><input className="form-input" value={settingsForm.address ?? ''} onChange={e => setSettingsForm(f => ({ ...f, address: e.target.value }))} /></div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: 20 }} disabled={settingsSaving}>
              {settingsSaving ? '⏳ Saving...' : '💾 Save Settings'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}
