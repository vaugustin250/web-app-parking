import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function AddCompany() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1=company info, 2=manager account, 3=done
  const [tenantId, setTenantId] = useState(null)
  const [duration, setDuration] = useState('1_MONTH')
  const [company, setCompany] = useState({
    business_name: '', email: '', phone: '', address: '', license_status: 'TRIAL',
    feature_passes_allowed: false, feature_zones_allowed: false,
    installation_date: new Date().toISOString().split('T')[0],
    renewal_end: ''
  })

  useEffect(() => {
    if (duration === 'CUSTOM') return
    if (!company.installation_date) return
    const d = new Date(company.installation_date)
    if (duration === '1_MONTH') d.setMonth(d.getMonth() + 1)
    if (duration === '3_MONTHS') d.setMonth(d.getMonth() + 3)
    if (duration === '6_MONTHS') d.setMonth(d.getMonth() + 6)
    if (duration === '1_YEAR') d.setFullYear(d.getFullYear() + 1)
    setCompany(prev => ({ ...prev, renewal_end: d.toISOString().split('T')[0] }))
  }, [duration, company.installation_date])
  const [manager, setManager] = useState({
    full_name: '', email: '', phone: '', password: ''
  })
  const [settings, setSettings] = useState({
    total_slots: 50, currency_symbol: '₹',
    rate_two_wheeler_first: 20, rate_two_wheeler_per_hour: 10,
    rate_four_wheeler_first: 40, rate_four_wheeler_per_hour: 20,
    rate_heavy_first: 80, rate_heavy_per_hour: 40,
    grace_period_minutes: 10
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function createCompany(e) {
    e.preventDefault()
    if (!company.business_name) { setError('Business name is required'); return }
    setSaving(true); setError('')
    try {
      // Create tenant
      const { data: tenant, error: tErr } = await supabase.from('tenants').insert({
        business_name: company.business_name,
        email: company.email || null,
        phone: company.phone || null,
        address: company.address || null,
        license_status: company.license_status,
        feature_passes_allowed: company.feature_passes_allowed,
        feature_zones_allowed: company.feature_zones_allowed,
        installation_date: company.installation_date ? new Date(company.installation_date).toISOString() : null,
        renewal_end: company.renewal_end ? new Date(company.renewal_end).toISOString() : null,
      }).select().single()
      if (tErr) throw tErr

      // Create settings row for this tenant
      await supabase.from('settings').insert({
        tenant_id: tenant.id,
        company_name: company.business_name,
        ...settings
      })

      setTenantId(tenant.id)
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function createManager(e) {
    e.preventDefault()
    if (!manager.email || !manager.full_name || !manager.password) {
      setError('Name, email and password are required'); return
    }
    if (manager.password.length < 6) { setError('Password must be at least 6 characters'); return }
    setSaving(true); setError('')
    try {
      // 1. Snapshot current super-admin session BEFORE signUp
      const { data: { session: adminSession } } = await supabase.auth.getSession()
      if (!adminSession) throw new Error('Super admin session lost. Please refresh and try again.')

      // 2. Create auth user for manager
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: manager.email,
        password: manager.password,
        options: { data: { full_name: manager.full_name } }
      })
      if (authErr) {
        if (authErr.message?.includes('already registered')) throw new Error(`Email "${manager.email}" is already registered. Use a different email.`)
        throw authErr
      }
      if (!authData?.user) throw new Error('Failed to create auth user. Please try again.')

      // 3. Restore super-admin session immediately
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      })

      // 4. Link user to this tenant as MANAGER (using restored admin session)
      const { error: profileErr } = await supabase.from('users').insert({
        id: authData.user.id,
        tenant_id: tenantId,
        full_name: manager.full_name,
        phone: manager.phone || null,
        role: 'MANAGER',
        active: true
      })
      if (profileErr) throw new Error('Auth account created but profile failed: ' + profileErr.message)

      setStep(3)
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (step === 3) {
    return (
      <>
        <div className="topbar"><div className="topbar-title">✅ Company Created</div></div>
        <div className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
          <div className="card" style={{ textAlign: 'center', padding: 48, maxWidth: 480 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{company.business_name}</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
              Company created successfully with a Manager account for <strong>{manager.email}</strong>.
              They can now log in and configure their parking business.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => navigate(`/superadmin/company/${tenantId}`)}>
                View Company →
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/superadmin/companies')}>
                All Companies
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">➕ Add New Company</div>
          <div className="topbar-sub">Step {step} of 2 — {step === 1 ? 'Company Info' : 'Create Manager Account'}</div>
        </div>
      </div>

      <div className="page-content">
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {['Company Info', 'Manager Account'].map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
                background: step > i + 1 ? 'var(--success)' : step === i + 1 ? 'var(--brand-primary)' : 'rgba(255,255,255,0.1)',
                color: '#fff'
              }}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 13, color: step === i + 1 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
              {i < 1 && <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>→</span>}
            </div>
          ))}
        </div>

        {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}

        {step === 1 && (
          <form onSubmit={createCompany}>
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>🏢 Company Information</div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Business Name *</label>
                  <input className="form-input" value={company.business_name} onChange={e => setCompany(c => ({ ...c, business_name: e.target.value }))} placeholder="City Centre Parking" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">License Status</label>
                  <select className="form-select" value={company.license_status} onChange={e => setCompany(c => ({ ...c, license_status: e.target.value }))}>
                    <option value="TRIAL">Trial</option>
                    <option value="ACTIVE">Active (Paid)</option>
                    <option value="EXPIRED">Expired</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Email</label>
                  <input className="form-input" type="email" value={company.email} onChange={e => setCompany(c => ({ ...c, email: e.target.value }))} placeholder="owner@parking.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" type="tel" value={company.phone} onChange={e => setCompany(c => ({ ...c, phone: e.target.value }))} placeholder="9876543210" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input className="form-input" value={company.address} onChange={e => setCompany(c => ({ ...c, address: e.target.value }))} placeholder="123, Main Street, Chennai" />
              </div>
              
              <div className="grid-3" style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label className="form-label">Installation Date</label>
                  <input className="form-input" type="date" value={company.installation_date} onChange={e => setCompany(c => ({ ...c, installation_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Subscription Duration</label>
                  <select className="form-select" value={duration} onChange={e => setDuration(e.target.value)}>
                    <option value="1_MONTH">1 Month</option>
                    <option value="3_MONTHS">3 Months</option>
                    <option value="6_MONTHS">6 Months</option>
                    <option value="1_YEAR">1 Year</option>
                    <option value="CUSTOM">Custom Date</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Renewal End Date</label>
                  <input className="form-input" type="date" value={company.renewal_end} onChange={e => setCompany(c => ({ ...c, renewal_end: e.target.value }))} readOnly={duration !== 'CUSTOM'} style={{ background: duration !== 'CUSTOM' ? 'rgba(0,0,0,0.05)' : '#fff' }} />
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>🚗 Initial Parking Settings</div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Total Parking Slots</label>
                  <input className="form-input" type="number" min="1" value={settings.total_slots} onChange={e => setSettings(s => ({ ...s, total_slots: parseInt(e.target.value) }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency Symbol</label>
                  <input className="form-input" value={settings.currency_symbol} onChange={e => setSettings(s => ({ ...s, currency_symbol: e.target.value }))} placeholder="₹" maxLength={3} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '10px 16px', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Type</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>First Hour (₹)</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Per Hour After</div>
                {[
                  { label: '🛵 2-Wheeler', f: 'rate_two_wheeler_first', p: 'rate_two_wheeler_per_hour' },
                  { label: '🚗 4-Wheeler', f: 'rate_four_wheeler_first', p: 'rate_four_wheeler_per_hour' },
                  { label: '🚌 Heavy', f: 'rate_heavy_first', p: 'rate_heavy_per_hour' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'contents' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                    <input className="form-input" type="number" min="0" value={settings[r.f] ?? ''} onChange={e => setSettings(s => ({ ...s, [r.f]: parseFloat(e.target.value) || 0 }))} />
                    <input className="form-input" type="number" min="0" value={settings[r.p] ?? ''} onChange={e => setSettings(s => ({ ...s, [r.p]: parseFloat(e.target.value) || 0 }))} />
                  </div>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label">Grace Period (minutes)</label>
                <input className="form-input" type="number" min="0" value={settings.grace_period_minutes ?? ''} onChange={e => setSettings(s => ({ ...s, grace_period_minutes: parseInt(e.target.value) || 0 }))} style={{ width: 120 }} />
              </div>
            </div>

            {/* Premium Feature Flags */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>🔧 Premium Features</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Enable features for this company. The manager can then turn them on/off in their own settings.</div>
              {[
                { key: 'feature_passes_allowed', label: '🎫 Parking Passes', desc: 'Issue monthly/weekly prepaid passes to frequent customers' },
                { key: 'feature_zones_allowed', label: '📍 Zone Management', desc: 'Divide the lot into named zones with slot diagrams' },
              ].map(({ key, label, desc }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
                  </div>
                  <button type="button" onClick={() => setCompany(c => ({ ...c, [key]: !c[key] }))}
                    style={{ width: 52, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer', background: company[key] ? '#6366f1' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 3, left: company[key] ? 26 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>
              ))}
            </div>

            <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
              {saving ? '⏳ Creating...' : 'Next: Create Manager →'}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={createManager}>
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>👤 Manager Account</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6, padding: '10px 14px', background: 'rgba(99,102,241,0.05)', borderRadius: 8, borderLeft: '3px solid var(--brand-primary)' }}>
                This person will manage the day-to-day operations of the parking business. They will be able to view dashboards, configure rates, manage staff, and see reports — but cannot do vehicle entry/exit.
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-input" value={manager.full_name} onChange={e => setManager(m => ({ ...m, full_name: e.target.value }))} placeholder="Rajesh Kumar" autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" value={manager.email} onChange={e => setManager(m => ({ ...m, email: e.target.value }))} placeholder="manager@company.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" type="tel" value={manager.phone} onChange={e => setManager(m => ({ ...m, phone: e.target.value }))} placeholder="9876543210" />
                </div>
                <div className="form-group">
                  <label className="form-label">Temporary Password *</label>
                  <input className="form-input" type="password" value={manager.password} onChange={e => setManager(m => ({ ...m, password: e.target.value }))} placeholder="Min 6 characters" minLength={6} />
                </div>
              </div>
              <div className="form-hint" style={{ marginTop: 4 }}>
                Share these credentials with the manager. They can change their password after first login.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
                {saving ? '⏳ Creating Account...' : '✅ Create Company & Manager'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
