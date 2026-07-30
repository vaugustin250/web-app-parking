import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

export default function Staff() {
  const { tenantId, profile } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'WATCHMAN', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (tenantId) load() }, [tenantId])

  async function load() {
    const { data } = await supabase.from('users').select('*').eq('tenant_id', tenantId).order('created_at')
    setStaff(data ?? [])
    setLoading(false)
  }

  async function toggleActive(user) {
    await supabase.from('users').update({ active: !user.active }).eq('id', user.id)
    load()
  }

  async function addStaff(e) {
    e.preventDefault()
    if (!form.email || !form.full_name || !form.password) { setError('Email, name and password are required'); return }
    setSaving(true); setError('')
    try {
      // Save current session BEFORE creating the new user
      // (Supabase signUp replaces the active session — we must restore it)
      const { data: { session: currentSession } } = await supabase.auth.getSession()

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } }
      })
      if (authErr) throw authErr

      // Restore the manager's original session immediately
      if (currentSession) {
        await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        })
      }

      // Insert into users table
      await supabase.from('users').insert({
        id: authData.user.id,
        tenant_id: tenantId,
        full_name: form.full_name,
        phone: form.phone || null,
        role: form.role,
        active: true
      })

      setShowAdd(false)
      setForm({ full_name: '', email: '', phone: '', role: 'WATCHMAN', password: '' })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">👥 Staff Management</div>
          <div className="topbar-sub">Add and manage watchmen and operators</div>
        </div>
        <div className="topbar-spacer" />
      </div>

      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '15px' }} onClick={() => setShowAdd(s => !s)}>
            {showAdd ? '✕ Cancel' : '+ Add Staff Member'}
          </button>
        </div>

        {/* Add Staff Form */}
        {showAdd && (
          <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(99,102,241,0.3)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>👤 Add New Staff Member</div>
            {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
            <form onSubmit={addStaff}>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Full Name *</label>
                  <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Ravi Kumar" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Email Address *</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ravi@example.com" />
                </div>
              </div>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Phone</label>
                  <input className="form-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Role</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="WATCHMAN">Watchman / Operator</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Temporary Password *</label>
                <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Set initial password (min 6 characters)" minLength={6} />
                <div className="form-hint">Share this with the staff member so they can log in. They should change it after first login.</div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? '⏳ Creating...' : '✅ Create Staff Account'}
              </button>
            </form>
          </div>
        )}

        {/* Staff Table */}
        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Role</th><th>Phone</th><th>Last Login</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No staff yet — add some above</td></tr>
                ) : staff.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                      {u.id === profile?.id && <div style={{ fontSize: 11, color: 'var(--brand-accent)' }}>You</div>}
                    </td>
                    <td>
                      <span className={`role-badge ${u.role.toLowerCase().replace('_', '')}`}>
                        {u.role === 'WATCHMAN' ? '🔐 Watchman' : u.role === 'MANAGER' ? '📊 Manager' : u.role}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.phone || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                    </td>
                    <td>
                      <span className={`badge ${u.active ? 'badge-parked' : 'badge-exited'}`}>
                        {u.active ? '● Active' : '● Disabled'}
                      </span>
                    </td>
                    <td>
                      {u.id !== profile?.id && (
                        <button className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-secondary'}`}
                          onClick={() => toggleActive(u)}>
                          {u.active ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
