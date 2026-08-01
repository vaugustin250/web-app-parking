import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'

const VEHICLE_TYPES = ['2-Wheeler', '4-Wheeler', '4-Wheeler (SUV)', 'Heavy Vehicle', 'Auto Rickshaw']

// Default rate rules (new simple format)
function defaultRules(baseRate, hourlyRate) {
  return {
    entry_fee: 0,
    base_rate: baseRate,
    base_hours: 1,
    hourly_rate: hourlyRate,
    daily_max: 0 // 0 means no cap
  }
}

function defaultRateRules(s) {
  // If they have old rate_rules, we might need to convert them, but if they are the old array type, we will overwrite them with this new default structure safely when they edit, or we can just try to parse it. For now, fallback to defaults based on top-level settings.
  return {
    '2-Wheeler': defaultRules(s?.rate_two_wheeler_first ?? 20, s?.rate_two_wheeler_per_hour ?? 10),
    '4-Wheeler': defaultRules(s?.rate_four_wheeler_first ?? 40, s?.rate_four_wheeler_per_hour ?? 20),
    '4-Wheeler (SUV)': defaultRules(s?.rate_four_wheeler_first ?? 40, s?.rate_four_wheeler_per_hour ?? 20),
    'Heavy Vehicle': defaultRules(s?.rate_heavy_first ?? 80, s?.rate_heavy_per_hour ?? 40),
    'Auto Rickshaw': defaultRules(s?.rate_two_wheeler_first ?? 20, s?.rate_two_wheeler_per_hour ?? 10),
  }
}

// ── Simple Rate Builder ────────────────────────────────
function SimpleRateBuilder({ vehicleType, rules, currency, onChange }) {
  // Ensure we have the new object structure. If it's an old array, fallback.
  const r = Array.isArray(rules) ? defaultRules(20, 10) : rules

  function update(field, val) {
    onChange({ ...r, [field]: val })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* Base Rate */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Base Fee (First X hours)</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>{currency}</span>
            <input className="form-input" type="number" min={0} value={r.base_rate} onChange={e => update('base_rate', parseFloat(e.target.value) || 0)} style={{ flex: 1, fontSize: 16, fontWeight: 700 }} />
          </div>
        </div>
        
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Base Hours</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input className="form-input" type="number" min={0.5} step={0.5} value={r.base_hours} onChange={e => update('base_hours', parseFloat(e.target.value) || 1)} style={{ flex: 1 }} />
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>hours</span>
          </div>
        </div>
      </div>

      {/* Hourly & Daily */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Per Hour Fee (After base hours)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>{currency}</span>
            <input className="form-input" type="number" min={0} value={r.hourly_rate} onChange={e => update('hourly_rate', parseFloat(e.target.value) || 0)} style={{ flex: 1, fontSize: 16, fontWeight: 700 }} />
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ hr</span>
          </div>
        </div>
        
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Per Day Max Cap <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(0 = no limit)</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>{currency}</span>
            <input className="form-input" type="number" min={0} value={r.daily_max} onChange={e => update('daily_max', parseFloat(e.target.value) || 0)} style={{ flex: 1, fontSize: 16, fontWeight: 700 }} />
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/ day</span>
          </div>
        </div>
      </div>
      
      {/* Optional Upfront Entry Fee */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Upfront Entry Fee <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Optional fixed fee collected at entry)</span></label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>{currency}</span>
            <input className="form-input" type="number" min={0} value={r.entry_fee} onChange={e => update('entry_fee', parseFloat(e.target.value) || 0)} style={{ width: 120, fontSize: 16, fontWeight: 700 }} />
          </div>
        </div>
      </div>

    </div>
  )
}

export default function Settings() {
  const { tenantId, refreshSettings, settings, tenantData } = useAuth()
  const [form, setForm] = useState({
    company_name: '', address: '', phone: '', email: '',
    currency_symbol: '₹', total_slots: 50, receipt_footer: '',
    gst_percent: 0, grace_period_minutes: 10,
    feature_passes_enabled: false,
    zones_enabled: false,
    collect_driver_details: false,
  })
  const [rateRules, setRateRules] = useState(null) // { '2-Wheeler': [...], ... }
  const [activeRateTab, setActiveRateTab] = useState('2-Wheeler')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const passesAllowed = tenantData?.feature_passes_allowed ?? false
  const zonesAllowed = tenantData?.feature_zones_allowed ?? false

  useEffect(() => {
    if (settings) {
      setForm(f => ({ ...f, ...settings }))
      // Load rate_rules from DB or build defaults from old flat-rate fields
      if (settings.rate_rules) {
        setRateRules(settings.rate_rules)
      } else {
        setRateRules(defaultRateRules(settings))
      }
    }
  }, [settings])

  function setField(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function setRulesForType(vehicleType, tiers) {
    setRateRules(r => ({ ...r, [vehicleType]: tiers }))
  }

  async function save(e) {
    e.preventDefault(); setSaving(true); setSaved(false)
    try {
      await api.put('/api/settings', {
        ...form,
        rate_rules: rateRules,
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000); refreshSettings()
    } catch (error) {
      alert('Save failed: ' + (error.response?.data?.error || error.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">⚙️ Business Settings</div>
          <div className="topbar-sub">Company info, billing rates, and feature controls</div>
        </div>
        {saved && <div style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>✅ Saved!</div>}
      </div>

      <div className="page-content">
        <form onSubmit={save}>

          {/* ── Business Info ──────────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>🏢 Business Information</div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Business Name *</label>
                <input className="form-input" value={form.company_name} onChange={e => setField('company_name', e.target.value)} placeholder="City Centre Parking" />
              </div>
              <div className="form-group">
                <label className="form-label">Total Parking Slots *</label>
                <input className="form-input" type="number" min="1" value={form.total_slots} onChange={e => setField('total_slots', parseInt(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input className="form-input" type="tel" value={form.phone ?? ''} onChange={e => setField('phone', e.target.value)} placeholder="9876543210" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email ?? ''} onChange={e => setField('email', e.target.value)} placeholder="parking@example.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Currency Symbol</label>
                <input className="form-input" value={form.currency_symbol} onChange={e => setField('currency_symbol', e.target.value)} placeholder="₹" maxLength={3} style={{ width: 80 }} />
              </div>
              <div className="form-group">
                <label className="form-label">GST % <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(0 = no GST)</span></label>
                <input className="form-input" type="number" min="0" max="30" value={form.gst_percent} onChange={e => setField('gst_percent', parseFloat(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Grace Period (minutes) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>— no charge if exit within this time</span></label>
                <input className="form-input" type="number" min="0" value={form.grace_period_minutes} onChange={e => setField('grace_period_minutes', parseInt(e.target.value))} style={{ width: 100 }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input className="form-input" value={form.address ?? ''} onChange={e => setField('address', e.target.value)} placeholder="123, Main Street, Chennai" />
            </div>
            <div className="form-group">
              <label className="form-label">Receipt Footer Message</label>
              <input className="form-input" value={form.receipt_footer ?? ''} onChange={e => setField('receipt_footer', e.target.value)} placeholder="Thank you for parking with us! Drive safe 🙏" />
            </div>
          </div>

          {/* ── Dynamic Billing Rate Tiers ─────────────────────────── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>💰 Parking Rates</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Configure time-based pricing tiers per vehicle type. Add multiple tiers for flexible pricing (e.g. first 2hrs flat, then hourly, then a max cap after 10hrs).
            </div>

            {/* Vehicle type tabs */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {VEHICLE_TYPES.map(vt => (
                <button key={vt} type="button" onClick={() => setActiveRateTab(vt)}
                  style={{
                    padding: '7px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: activeRateTab === vt ? 'var(--brand-primary)' : 'var(--bg-secondary)',
                    color: activeRateTab === vt ? '#fff' : 'var(--text-secondary)',
                    border: activeRateTab === vt ? 'none' : '1px solid var(--border-color)',
                    transition: 'all 0.15s',
                  }}>
                  {vt === '2-Wheeler' ? '🛵' : vt === 'Heavy Vehicle' ? '🚌' : vt === 'Auto Rickshaw' ? '🛺' : '🚗'} {vt}
                </button>
              ))}
            </div>

            {rateRules && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '20px' }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: 'var(--text-primary)' }}>
                  {activeRateTab === '2-Wheeler' ? '🛵' : activeRateTab === 'Heavy Vehicle' ? '🚌' : activeRateTab === 'Auto Rickshaw' ? '🛺' : '🚗'} {activeRateTab} Pricing
                </div>
                <SimpleRateBuilder
                  vehicleType={activeRateTab}
                  rules={rateRules[activeRateTab] ?? defaultRules(20, 10)}
                  currency={form.currency_symbol}
                  onChange={rules => setRulesForType(activeRateTab, rules)}
                />
              </div>
            )}
          </div>

          {/* ── Feature Controls ───────────────────────────────────── */}
          {(passesAllowed || zonesAllowed) && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>🔧 Feature Controls</div>
              {passesAllowed && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>🎫 Parking Passes</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Allow issuing monthly, weekly, and annual passes to regular customers</div>
                  </div>
                  <button type="button" onClick={() => setField('feature_passes_enabled', !form.feature_passes_enabled)}
                    style={{ width: 52, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.feature_passes_enabled ? 'var(--brand-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 3, left: form.feature_passes_enabled ? 26 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>
              )}
              {zonesAllowed && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>📍 Zone Management</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Show zone selector in watchman entry form. Configure zones in the Zone Management page.</div>
                  </div>
                  <button type="button" onClick={() => setField('zones_enabled', !form.zones_enabled)}
                    style={{ width: 52, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.zones_enabled ? 'var(--brand-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 3, left: form.zones_enabled ? 26 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Additional Settings ───────────────────────────────────── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>👤 Form Settings</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Collect Driver Details</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Show driver name and phone number fields in the Watchman entry form.</div>
              </div>
              <button type="button" onClick={() => setField('collect_driver_details', !form.collect_driver_details)}
                style={{ width: 52, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.collect_driver_details ? 'var(--brand-primary)' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: form.collect_driver_details ? 26 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? '⏳ Saving...' : '💾 Save Settings'}
          </button>
        </form>
      </div>
    </>
  )
}
