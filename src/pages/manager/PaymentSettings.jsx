import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'

export default function PaymentSettings() {
  const { tenantId, settings, refreshSettings } = useAuth()
  const [form, setForm] = useState({
    upi_id: '', upi_phone: '', upi_payee_name: '', upi_qr_url: '',
    rate_two_wheeler_first: 20, rate_two_wheeler_per_hour: 10,
    rate_four_wheeler_first: 40, rate_four_wheeler_per_hour: 20,
    rate_heavy_first: 80, rate_heavy_per_hour: 40,
    gst_percent: 0, grace_period_minutes: 10
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [qrPreview, setQrPreview] = useState(null)
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState(null)

  useEffect(() => {
    if (settings) {
      setForm(f => ({ ...f, ...settings }))
      setQrPreview(settings.upi_qr_url || null)
    }
  }, [settings])

  // Live QR preview from UPI ID
  useEffect(() => {
    if (!form.upi_id || form.upi_qr_url) { setPreviewQrDataUrl(null); return }
    import('qrcode').then(({ default: QRCode }) => {
      const payeeName = encodeURIComponent(form.upi_payee_name || 'Parking')
      const link = `upi://pay?pa=${form.upi_id}&pn=${payeeName}&cu=INR`
      QRCode.toDataURL(link, { width: 200, margin: 1 }).then(setPreviewQrDataUrl)
    })
  }, [form.upi_id, form.upi_payee_name, form.upi_qr_url])

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (field === 'upi_id' || field === 'upi_payee_name') setForm(f => ({ ...f, upi_qr_url: '', [field]: value }))
  }

  async function uploadQrImage(file) {
    if (!file) return
    // Validate file type and size
    if (!file.type.startsWith('image/')) { alert('Please select an image file (PNG, JPG, etc.)'); return }
    if (file.size > 500 * 1024) { alert('Image too large. Please use an image under 500 KB.'); return }

    setUploading(true)
    // Convert to base64 data URL — stored directly in database, no Storage bucket needed
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setForm(f => ({ ...f, upi_qr_url: dataUrl, upi_id: '', upi_phone: '' }))
      setQrPreview(dataUrl)
      setUploading(false)
    }
    reader.onerror = () => { alert('Failed to read file. Try again.'); setUploading(false) }
    reader.readAsDataURL(file)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setSaved(false)
    try {
      await api.put('/api/settings', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      refreshSettings()
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
          <div className="topbar-title">💳 Payment Settings</div>
          <div className="topbar-sub">Configure UPI, QR code, and pricing</div>
        </div>
        {saved && <div style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>✅ Saved!</div>}
      </div>

      <div className="page-content" style={{ overflowY: 'auto' }}>
        <form onSubmit={handleSave}>
          <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>
            {/* Left: UPI / Payment config */}
            <div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                  📱 UPI Payment Configuration
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6, padding: '10px 14px', background: 'rgba(99,102,241,0.05)', borderRadius: 8, borderLeft: '3px solid var(--brand-primary)' }}>
                  Watchmen at exit will show customers your configured QR or UPI ID to receive payment.
                </div>

                <div className="form-group">
                  <label className="form-label">Payee Display Name</label>
                  <input className="form-input" value={form.upi_payee_name} onChange={e => update('upi_payee_name', e.target.value)} placeholder="My Parking Business" />
                  <div className="form-hint">Shown on customer's UPI app when they scan</div>
                </div>

                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                  Option 1 — Enter UPI ID (auto-generates QR)
                </div>
                <div className="form-group">
                  <label className="form-label">UPI ID</label>
                  <input className="form-input" value={form.upi_id} onChange={e => update('upi_id', e.target.value)} placeholder="yourname@paytm / yourname@upi" />
                </div>
                <div className="form-group">
                  <label className="form-label">OR UPI Phone Number</label>
                  <input className="form-input" value={form.upi_phone} onChange={e => update('upi_phone', e.target.value)} placeholder="9876543210" type="tel" />
                </div>

                <div className="divider" />

                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                  Option 2 — Upload your own QR image (from your bank / GPay)
                </div>
                <div className="form-group">
                  <label className="form-label">Upload QR Image (PNG/JPG)</label>
                  <input type="file" accept="image/*"
                    onChange={e => uploadQrImage(e.target.files[0])}
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-input)', border: '1.5px dashed var(--border-color)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer' }}
                  />
                  {uploading && <div className="form-hint">⏳ Uploading...</div>}
                  <div className="form-hint">Overrides the UPI ID above. Upload your GPay / PhonePe / Paytm QR directly.</div>
                </div>
              </div>
            </div>

            {/* Right: QR Preview */}
            <div>
              <div className="card" style={{ marginBottom: 20, textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>👁️ QR Preview</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  This is what watchmen will show customers at exit (amount pre-filled on scan)
                </div>
                <div className="qr-image-wrap" style={{ margin: '0 auto 16px', width: 220, height: 220 }}>
                  {qrPreview
                    ? <img src={qrPreview} alt="UPI QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : previewQrDataUrl
                      ? <img src={previewQrDataUrl} alt="Generated QR" style={{ width: '100%', height: '100%' }} />
                      : (
                        <div style={{ color: '#666', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 }}>
                          <div style={{ fontSize: 32 }}>📷</div>
                          Enter UPI ID or upload QR
                        </div>
                      )
                  }
                </div>
                {(form.upi_id || form.upi_phone) && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    {form.upi_id ? `UPI: ${form.upi_id}` : `Phone: ${form.upi_phone}`}
                  </div>
                )}
                {form.upi_qr_url && (
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setForm(f => ({ ...f, upi_qr_url: '' })); setQrPreview(null) }}>
                      ✕ Remove image, use UPI ID instead
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>💰 Parking Rates</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: '12px 20px', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vehicle</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>First Hour (₹)</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Per Hour After (₹)</div>

              {[
                { label: '🛵 2-Wheeler', f: 'rate_two_wheeler_first', p: 'rate_two_wheeler_per_hour' },
                { label: '🚗 4-Wheeler', f: 'rate_four_wheeler_first', p: 'rate_four_wheeler_per_hour' },
                { label: '🚌 Heavy Vehicle', f: 'rate_heavy_first', p: 'rate_heavy_per_hour' },
              ].map(r => (
                <>
                  <div key={r.label} style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</div>
                  <input className="form-input" type="number" min="0" step="0.5" value={form[r.f]} onChange={e => update(r.f, parseFloat(e.target.value))} />
                  <input className="form-input" type="number" min="0" step="0.5" value={form[r.p]} onChange={e => update(r.p, parseFloat(e.target.value))} />
                </>
              ))}
            </div>

            <div className="divider" />
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Grace Period (minutes)</label>
                <input className="form-input" type="number" min="0" value={form.grace_period_minutes} onChange={e => update('grace_period_minutes', parseInt(e.target.value))} />
                <div className="form-hint">Vehicles exiting within this time won't be charged</div>
              </div>
              <div className="form-group">
                <label className="form-label">GST %</label>
                <input className="form-input" type="number" min="0" max="28" step="0.5" value={form.gst_percent} onChange={e => update('gst_percent', parseFloat(e.target.value))} />
              </div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            {saving ? '⏳ Saving...' : '💾 Save Payment Settings'}
          </button>
        </form>
      </div>
    </>
  )
}
