import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const PASS_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL']

function generatePassNumber(companyName) {
  const code = companyName?.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X').padEnd(3, 'X') || 'PKE'
  const now = new Date()
  const datePart = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
  const rand = String(Math.floor(Math.random() * 9000) + 1000)
  return `${code}-P-${datePart}-${rand}`
}

function getEndDate(startDate, passType, customDays) {
  const d = new Date(startDate)
  if (passType === 'DAILY') d.setDate(d.getDate() + (customDays || 1))
  else if (passType === 'WEEKLY') d.setDate(d.getDate() + 7)
  else if (passType === 'MONTHLY') d.setMonth(d.getMonth() + 1)
  else if (passType === 'ANNUAL') d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

function PassCard({ pass, onRenew }) {
  const today = new Date()
  const expiry = new Date(pass.valid_until)
  const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
  const expired = daysLeft <= 0
  const urgent = daysLeft > 0 && daysLeft <= 7

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 16, padding: '20px',
      border: `2px solid ${expired ? '#fecaca' : urgent ? '#fde68a' : 'var(--border-color)'}`,
      display: 'flex', gap: 16, alignItems: 'flex-start'
    }}>
      <div style={{ fontSize: 40, lineHeight: 1 }}>🎫</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 1 }}>{pass.vehicle_number}</div>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99,
            background: expired ? '#fee2e2' : urgent ? '#fef3c7' : '#d1fae5',
            color: expired ? '#dc2626' : urgent ? '#d97706' : '#059669'
          }}>
            {expired ? 'EXPIRED' : `${daysLeft}d left`}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: '#eef2ff', color: '#4f46e5' }}>{pass.pass_type}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>
          {pass.holder_name} {pass.phone ? `· 📞 ${pass.phone}` : ''}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Pass #: {pass.pass_number} · Valid: {new Date(pass.valid_from).toLocaleDateString('en-IN', {day:'2-digit',month:'short'})} → {new Date(pass.valid_until).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}
        </div>
        {pass.max_entries && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Max entries: {pass.max_entries ?? '∞'} / validity period
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => onRenew(pass)}>↻ Renew</button>
      </div>
    </div>
  )
}

export default function ParkingPasses() {
  const { tenantId, settings } = useAuth()
  const [passes, setPasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('ALL')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    holder_name: '', vehicle_number: '', phone: '',
    pass_type: 'MONTHLY', valid_from: new Date().toISOString().slice(0, 10),
    max_entries: '', price_charged: ''
  })

  useEffect(() => { if (tenantId) load() }, [tenantId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('parking_passes')
      .select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
    setPasses(data ?? [])
    setLoading(false)
  }

  async function createPass(e) {
    e.preventDefault()
    if (!form.vehicle_number || !form.holder_name) { setError('Vehicle number and holder name are required'); return }
    setSaving(true); setError('')

    const passNumber = generatePassNumber(settings?.company_name)
    const validUntil = getEndDate(form.valid_from, form.pass_type)
    const vehicleNum = form.vehicle_number.replace(/\s/g, '').toUpperCase()

    // Generate QR
    const qrData = `vbills://pass?pass=${passNumber}&vehicle=${vehicleNum}`
    let qrCode = ''
    try { qrCode = await QRCode.toDataURL(qrData, { width: 200, margin: 1 }) } catch {}

    const { error: err } = await supabase.from('parking_passes').insert({
      tenant_id: tenantId,
      pass_number: passNumber,
      pass_type: form.pass_type,
      holder_name: form.holder_name,
      vehicle_number: vehicleNum,
      phone: form.phone || null,
      valid_from: form.valid_from,
      valid_until: validUntil,
      max_entries: form.max_entries ? parseInt(form.max_entries) : null,
      price_charged: form.price_charged ? parseFloat(form.price_charged) : null,
      qr_code: qrCode,
      status: 'ACTIVE'
    })

    setSaving(false)
    if (err) { setError(err.message); return }
    setShowAdd(false)
    setForm({ holder_name: '', vehicle_number: '', phone: '', pass_type: 'MONTHLY', valid_from: new Date().toISOString().slice(0, 10), max_entries: '', price_charged: '' })
    load()
  }

  async function renewPass(pass) {
    const newFrom = new Date().toISOString().slice(0, 10)
    const newUntil = getEndDate(newFrom, pass.pass_type)
    await supabase.from('parking_passes').update({ valid_from: newFrom, valid_until: newUntil, status: 'ACTIVE' }).eq('id', pass.id)
    load()
  }

  const today = new Date().toISOString().slice(0, 10)
  const filteredPasses = passes.filter(p => {
    if (filter === 'ACTIVE') return p.status === 'ACTIVE' && p.valid_until >= today
    if (filter === 'EXPIRED') return p.status !== 'ACTIVE' || p.valid_until < today
    return true
  })

  const activeCount = passes.filter(p => p.status === 'ACTIVE' && p.valid_until >= today).length
  const expiringCount = passes.filter(p => {
    const d = Math.ceil((new Date(p.valid_until) - new Date()) / (1000*60*60*24))
    return d > 0 && d <= 7
  }).length

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">🎫 Parking Passes</div>
          <div className="topbar-sub">Manage monthly, weekly, and annual parking passes</div>
        </div>
        <div className="topbar-spacer" />
      </div>

      <div className="page-content">
        {/* KPI row */}
        <div className="grid-3" style={{ marginBottom: 24 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--brand-primary)' }}>{passes.length}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total Passes</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--success)' }}>{activeCount}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Active Passes</div>
          </div>
          <div className="card" style={{ textAlign: 'center', borderColor: expiringCount > 0 ? 'var(--warning)' : undefined }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: expiringCount > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{expiringCount}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Expiring in 7 Days</div>
          </div>
        </div>

        {/* Add button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button className="btn btn-primary" style={{ padding: '10px 24px' }} onClick={() => setShowAdd(s => !s)}>
            {showAdd ? '✕ Cancel' : '+ Issue New Pass'}
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(99,102,241,0.3)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>🎫 Issue New Parking Pass</div>
            {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
            <form onSubmit={createPass}>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Holder Name *</label>
                  <input className="form-input" value={form.holder_name} onChange={e => setForm(f => ({ ...f, holder_name: e.target.value }))} placeholder="John Kumar" autoFocus />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Vehicle Number *</label>
                  <input className="form-input" value={form.vehicle_number}
                    onChange={e => setForm(f => ({ ...f, vehicle_number: e.target.value.toUpperCase().replace(/[^A-Z0-9\s]/g, '') }))}
                    placeholder="MH 12 AB 1234" style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Phone Number</label>
                  <input className="form-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Pass Type *</label>
                  <select className="form-select" value={form.pass_type} onChange={e => setForm(f => ({ ...f, pass_type: e.target.value }))}>
                    {PASS_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Valid From</label>
                  <input className="form-input" type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Max Entries <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(leave blank = unlimited)</span></label>
                  <input className="form-input" type="number" min="1" value={form.max_entries} onChange={e => setForm(f => ({ ...f, max_entries: e.target.value }))} placeholder="e.g. 60" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Price Charged <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(for records)</span></label>
                  <input className="form-input" type="number" min="0" value={form.price_charged} onChange={e => setForm(f => ({ ...f, price_charged: e.target.value }))} placeholder={`e.g. ${settings?.currency_symbol ?? '₹'}500`} />
                </div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                <b>Validity:</b> {form.valid_from} → {getEndDate(form.valid_from, form.pass_type)} ({form.pass_type})
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
                {saving ? '⏳ Issuing...' : '🎫 Issue Pass & Generate QR'}
              </button>
            </form>
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['ALL', 'ACTIVE', 'EXPIRED'].map(f => (
            <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>

        {/* Pass list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : filteredPasses.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎫</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Passes Found</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Issue a parking pass to get started</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredPasses.map(p => <PassCard key={p.id} pass={p} onRenew={renewPass} />)}
          </div>
        )}
      </div>
    </>
  )
}
