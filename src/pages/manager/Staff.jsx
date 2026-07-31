import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

function printShiftReport(r, companyName) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shift Report</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Courier New',monospace; font-size:13px; color:#000; background:#fff; padding:16px; width:340px; margin:0 auto; }
      .center { text-align:center; }
      .logo { font-size:20px; font-weight:900; letter-spacing:-1px; }
      .divider { border-top:1px dashed #666; margin:8px 0; }
      .row { display:flex; justify-content:space-between; margin:4px 0; }
      .label { color:#555; }
      @media print { body { padding:0; width:100%; margin:0; } }
    </style></head><body>
      <div class="center logo">${companyName || 'Parking'}</div>
      <div class="divider"></div>
      <div class="center" style="font-size:11px;font-weight:bold;margin-bottom:6px">SHIFT REPORT</div>
      <div class="divider"></div>
      <div class="row"><span class="label">Watchman:</span><span>${r.watchman_name}</span></div>
      <div class="row"><span class="label">Login:</span><span>${new Date(r.start_time).toLocaleString('en-IN')}</span></div>
      <div class="row"><span class="label">Logout:</span><span>${new Date(r.end_time).toLocaleString('en-IN')}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="label">Vehicles IN:</span><span>${r.vehicles_in}</span></div>
      <div class="row"><span class="label">Vehicles OUT:</span><span>${r.vehicles_out}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="label">Cash Collected:</span><span>₹${Number(r.revenue_cash).toFixed(2)}</span></div>
      <div class="row"><span class="label">UPI Collected:</span><span>₹${Number(r.revenue_upi).toFixed(2)}</span></div>
      <div class="divider"></div>
      <div class="row"><span class="label" style="font-weight:bold;color:#000;">TOTAL REVENUE:</span><span style="font-weight:bold;font-size:16px;">₹${Number(r.revenue_total).toFixed(2)}</span></div>
      <div class="divider"></div>
      <div class="center" style="font-size:10px; margin-top:20px;">System Generated Report</div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:none;opacity:0;'
    document.body.appendChild(iframe)
    iframe.src = url
    iframe.onload = () => {
      setTimeout(() => {
        try { iframe.contentWindow.print() } catch {}
        setTimeout(() => { URL.revokeObjectURL(url); try { document.body.removeChild(iframe) } catch {} }, 2500)
      }, 300)
    }
  } else {
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }
}

export default function Staff() {
  const { tenantId, profile, settings } = useAuth()
  const [staff, setStaff] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingReports, setLoadingReports] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', role: 'WATCHMAN', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (tenantId) load() }, [tenantId])

  async function load() {
    const { data } = await supabase.from('users').select('*').eq('tenant_id', tenantId).order('created_at')
    setStaff(data ?? [])
    
    // Also load recent shift reports
    try {
      const { data: repData } = await supabase.from('shift_reports').select('*').eq('tenant_id', tenantId).order('end_time', { ascending: false }).limit(30)
      setReports(repData ?? [])
    } catch (e) {}
    
    setLoading(false)
    setLoadingReports(false)
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

        {/* Shift Reports Table */}
        <div style={{ marginTop: 40 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>📋 Recent Shift Reports</div>
          {loadingReports ? <div className="spinner" /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Watchman</th><th>Shift Period</th><th>Vehicles In</th><th>Checkouts</th><th>Cash</th><th>UPI</th><th>Total</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {reports.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No shift reports generated yet</td></tr>
                  ) : reports.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.watchman_name}</td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        <div><span style={{color: '#34d399'}}>IN:</span> {new Date(r.start_time).toLocaleString('en-IN', { hour12: true, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                        <div><span style={{color: '#f87171'}}>OUT:</span> {new Date(r.end_time).toLocaleString('en-IN', { hour12: true, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td>{r.vehicles_in}</td>
                      <td>{r.vehicles_out}</td>
                      <td>₹{Number(r.revenue_cash).toFixed(2)}</td>
                      <td>₹{Number(r.revenue_upi).toFixed(2)}</td>
                      <td style={{ fontWeight: 800 }}>₹{Number(r.revenue_total).toFixed(2)}</td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => printShiftReport(r, settings?.company_name)}>
                          🖨️ PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
