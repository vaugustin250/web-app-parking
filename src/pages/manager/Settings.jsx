import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const VEHICLE_TYPES = ['2-Wheeler', '4-Wheeler', '4-Wheeler (SUV)', 'Heavy Vehicle', 'Auto Rickshaw']

// Default rate rules (first 1hr flat, then per hour after)
function defaultRules(firstHr, perHr) {
  return [
    { hours: 1, charge: firstHr, type: 'flat' },
    { hours: null, charge: perHr, type: 'per_hour' },
  ]
}

function defaultRateRules(s) {
  return {
    '2-Wheeler': defaultRules(s?.rate_two_wheeler_first ?? 20, s?.rate_two_wheeler_per_hour ?? 10),
    '4-Wheeler': defaultRules(s?.rate_four_wheeler_first ?? 40, s?.rate_four_wheeler_per_hour ?? 20),
    '4-Wheeler (SUV)': defaultRules(s?.rate_four_wheeler_first ?? 40, s?.rate_four_wheeler_per_hour ?? 20),
    'Heavy Vehicle': defaultRules(s?.rate_heavy_first ?? 80, s?.rate_heavy_per_hour ?? 40),
    'Auto Rickshaw': defaultRules(s?.rate_two_wheeler_first ?? 20, s?.rate_two_wheeler_per_hour ?? 10),
  }
}

// ── Tier builder for one vehicle type ────────────────────────────────
function TierBuilder({ vehicleType, tiers, currency, onChange }) {
  function addTier() {
    onChange([...tiers, { hours: 2, charge: 10, type: 'per_hour' }])
  }
  function removeTier(idx) {
    onChange(tiers.filter((_, i) => i !== idx))
  }
  function updateTier(idx, field, val) {
    onChange(tiers.map((t, i) => i === idx ? { ...t, [field]: val } : t))
  }

  return (
    <div>
      {tiers.map((tier, idx) => {
        const isLast = idx === tiers.length - 1
        return (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {/* Connector label */}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', width: 50, textAlign: 'right', flexShrink: 0 }}>
              {idx === 0 ? 'First' : 'Then'}
            </div>

            {/* Hours input — null means "remaining" */}
            {isLast ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', padding: '9px 12px', background: 'var(--bg-secondary)', borderRadius: 8, flexShrink: 0 }}>
                All remaining
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <input
                  type="number" min={0.5} max={24} step={0.5}
                  value={tier.hours ?? ''}
                  onChange={e => updateTier(idx, 'hours', parseFloat(e.target.value) || null)}
                  style={{ width: 64, padding: '8px', borderRadius: 8, border: '1.5px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, textAlign: 'center' }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>hr{(tier.hours ?? 1) !== 1 ? 's' : ''}</span>
              </div>
            )}

            {/* Type selector */}
            <select
              value={tier.type}
              onChange={e => updateTier(idx, 'type', e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, flexShrink: 0 }}
            >
              <option value="flat">Flat charge</option>
              <option value="per_hour">Per hour</option>
              {idx === 0 && <option value="entry_fee">Upfront Entry Fee</option>}
            </select>

            {/* Charge input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{currency}</span>
              <input
                type="number" min={0} step={1}
                value={tier.charge}
                onChange={e => updateTier(idx, 'charge', parseFloat(e.target.value) || 0)}
                style={{ width: 72, padding: '8px', borderRadius: 8, border: '1.5px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, textAlign: 'center' }}
              />
            </div>

            {/* Remove button — always keep at least 1 tier */}
            {tiers.length > 1 && (
              <button type="button" onClick={() => removeTier(idx)}
                style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>
                ✕
              </button>
            )}
          </div>
        )
      })}

      {/* Preview text */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 8, padding: '6px 10px', marginTop: 4, marginBottom: 8 }}>
        {tiers.map((t, i) => {
          const next = tiers[i + 1]
          if (i === 0 && t.hours) return `First ${t.hours}h: ${currency}${t.charge} ${t.type === 'per_hour' ? '/hr' : 'flat'}`
          if (!t.hours) return `After that: ${currency}${t.charge}${t.type === 'per_hour' ? '/hr' : ' flat cap'}`
          return `Next ${t.hours}h: ${currency}${t.charge}${t.type === 'per_hour' ? '/hr' : ' flat'}`
        }).join(' → ')}
      </div>

      {/* Cannot have more than one "all remaining" tier — limit to last */}
      <button type="button" onClick={addTier}
        style={{ fontSize: 13, fontWeight: 600, color: 'var(--brand-primary)', background: 'rgba(99,102,241,0.08)', border: '1px dashed var(--brand-primary)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
        + Add Tier
      </button>
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
    const { error } = await supabase.from('settings').upsert({
      tenant_id: tenantId,
      ...form,
      rate_rules: rateRules,
    }, { onConflict: 'tenant_id' })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000); refreshSettings() }
    else alert('Save failed: ' + error.message)
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
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, color: 'var(--text-primary)' }}>
                  {activeRateTab === '2-Wheeler' ? '🛵' : activeRateTab === 'Heavy Vehicle' ? '🚌' : activeRateTab === 'Auto Rickshaw' ? '🛺' : '🚗'} {activeRateTab} — Pricing Tiers
                </div>
                <TierBuilder
                  vehicleType={activeRateTab}
                  tiers={rateRules[activeRateTab] ?? defaultRules(20, 10)}
                  currency={form.currency_symbol}
                  onChange={tiers => setRulesForType(activeRateTab, tiers)}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, padding: '8px 12px', background: 'rgba(99,102,241,0.05)', borderRadius: 8, borderLeft: '3px solid var(--brand-primary)' }}>
                  💡 <b>Tip:</b> The <b>last tier</b> always applies to all remaining time. Set it as "All remaining" for open-ended pricing.
                </div>
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
