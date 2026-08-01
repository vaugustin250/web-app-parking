import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useAuth } from '../../contexts/AuthContext'
import localDb from '../../lib/db.local'
import SyncEngine from '../../lib/syncEngine'
import PlateKeypad from '../../components/PlateKeypad'

// ── Fee calculator — supports dynamic rate_rules JSON ────────────────
function calcFee(vehicleType, entryTime, settings) {
  if (!settings) return 0
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(entryTime).getTime()) / 60000))
  if (minutes <= (settings.grace_period_minutes ?? 10)) return 0

  // Try dynamic rate_rules first
  const rules = settings.rate_rules
  if (rules) {
    const r = rules[vehicleType] || rules['4-Wheeler']
    if (r && !Array.isArray(r)) { // New simple format
      let total = 0
      
      const days = Math.floor(minutes / (24 * 60))
      let remainderMins = minutes % (24 * 60)
      
      // Calculate charge for the remainder of the day
      let dayCharge = 0
      if (remainderMins > 0) {
         let minsToCharge = remainderMins
         let charge = 0
         
         // Base rate
         if (r.base_hours > 0) {
           charge += r.base_rate
           minsToCharge -= (r.base_hours * 60)
         }
         
         // Hourly rate for remaining minutes
         if (minsToCharge > 0) {
           charge += Math.ceil(minsToCharge / 60) * r.hourly_rate
         }
         
         // Apply daily max if set
         if (r.daily_max > 0) {
           charge = Math.min(charge, r.daily_max)
         }
         
         dayCharge = charge
      }
      
      // Total = (Full days * Daily Max) + Day Charge
      // If Daily Max is 0, we just charge the base rate + hourly rate for the full duration
      if (days > 0) {
        if (r.daily_max > 0) {
          total += days * r.daily_max
        } else {
          // If no daily max, just calculate straight through
          let totalMins = minutes
          total += r.base_rate
          totalMins -= (r.base_hours * 60)
          if (totalMins > 0) {
            total += Math.ceil(totalMins / 60) * r.hourly_rate
          }
          dayCharge = 0 // Already calculated above
        }
      }
      
      total += dayCharge
      
      // Calculate GST
      const gst = total * ((settings.gst_percent ?? 0) / 100)
      return Math.round((total + gst) * 100) / 100
    }
  }

  // Fallback to old flat-rate system
  let firstHour, perHour
  if (vehicleType === '4-Wheeler' || vehicleType === '4-Wheeler (SUV)') {
    firstHour = settings.rate_four_wheeler_first ?? 40
    perHour = settings.rate_four_wheeler_per_hour ?? 20
  } else if (vehicleType === 'Heavy Vehicle') {
    firstHour = settings.rate_heavy_first ?? 80
    perHour = settings.rate_heavy_per_hour ?? 40
  } else {
    firstHour = settings.rate_two_wheeler_first ?? 20
    perHour = settings.rate_two_wheeler_per_hour ?? 10
  }
  let amount = minutes <= 60 ? firstHour : firstHour + Math.ceil((minutes - 60) / 60) * perHour
  const gst = amount * ((settings.gst_percent ?? 0) / 100)
  return Math.round((amount + gst) * 100) / 100
}

function fmtDuration(entryTime) {
  const mins = Math.floor((Date.now() - new Date(entryTime).getTime()) / 60000)
  const h = Math.floor(mins / 60), m = mins % 60
  if (h === 0) return `${m} min`
  return `${h}h ${m}m`
}

function fmtTime(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── Print via blob URL — works in all browsers ────────────────────────
function printReceipt({ record, amount, payMode, settings, passData }) {
  const currency = settings?.currency_symbol ?? '₹'
  const exitTime = new Date()
  const duration = fmtDuration(record.entry_time)
  const gstAmt = amount * ((settings?.gst_percent ?? 0) / 100)
  const baseAmt = amount - gstAmt

  let paymentHtml = ''
  if (payMode === 'PASS') {
    paymentHtml = `
      <div class="row" style="margin-top:8px"><span class="label">Payment Mode:</span><span style="font-weight:900">PREPAID PASS</span></div>
      ${passData?.pass ? `<div class="row"><span class="label">Pass Type:</span><span>${passData.pass.pass_type}</span></div>` : ''}
      ${passData?.remaining !== null && passData?.remaining !== undefined ? `<div class="row"><span class="label">Remaining Entries:</span><span style="font-weight:900">${passData.remaining}</span></div>` : ''}
      <div class="total-row"><span>AMOUNT DUE</span><span>${currency}0.00</span></div>
    `
  } else {
    const prepaid = record.amount_paid_at_entry || 0
    paymentHtml = `
      <div class="row"><span class="label">Parking Fee:</span><span>${currency}${baseAmt.toFixed(2)}</span></div>
      ${gstAmt > 0 ? `<div class="row"><span class="label">GST (${settings?.gst_percent}%):</span><span>${currency}${gstAmt.toFixed(2)}</span></div>` : ''}
      ${prepaid > 0 ? `<div class="row"><span class="label">Total Fee:</span><span>${currency}${(amount + prepaid).toFixed(2)}</span></div>` : ''}
      ${prepaid > 0 ? `<div class="row"><span class="label">Prepaid at Entry:</span><span>-${currency}${prepaid.toFixed(2)}</span></div>` : ''}
      <div class="total-row"><span>AMOUNT DUE</span><span>${currency}${amount.toFixed(2)}</span></div>
      <div class="row"><span class="label">Payment:</span><span>${payMode}</span></div>
    `
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Parking Receipt</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Courier New',monospace; font-size:13px; color:#000; background:#fff; padding:16px; width:340px; }
      .center { text-align:center; }
      .logo { font-size:22px; font-weight:900; letter-spacing:-1px; margin-bottom:2px; }
      .divider { border-top:1px dashed #666; margin:8px 0; }
      .row { display:flex; justify-content:space-between; margin:4px 0; }
      .label { color:#555; }
      .ticket { font-size:18px; font-weight:900; text-align:center; letter-spacing:2px; margin:10px 0 6px; }
      .total-row { display:flex; justify-content:space-between; font-size:17px; font-weight:900; margin:8px 0; padding:6px 0; border-top:2px solid #000; border-bottom:2px solid #000; }
      .footer { font-size:11px; color:#777; text-align:center; margin-top:14px; line-height:1.6; }
      @media print { body { padding:0; } }
    </style></head><body>
      <div class="center logo">${settings?.company_name ?? 'VBills'}</div>
      ${settings?.address ? `<div class="center" style="font-size:11px;color:#666;margin-bottom:2px">${settings.address}</div>` : ''}
      ${settings?.phone ? `<div class="center" style="font-size:11px;color:#666;">📞 ${settings.phone}</div>` : ''}
      <div class="divider"></div>
      <div class="center" style="font-weight:bold;font-size:12px;margin-bottom:4px">PARKING RECEIPT</div>
      <div class="ticket">🎫 ${record.ticket_no}</div>
      <div class="divider"></div>
      <div class="row"><span class="label">Vehicle No:</span><span><b>${record.vehicle_number}</b></span></div>
      <div class="row"><span class="label">Type:</span><span>${record.vehicle_type}</span></div>
      ${record.driver_name ? `<div class="row"><span class="label">Driver:</span><span>${record.driver_name}</span></div>` : ''}
      ${record.slot_no ? `<div class="row"><span class="label">Slot:</span><span>${record.slot_no}</span></div>` : ''}
      <div class="divider"></div>
      <div class="row"><span class="label">Entry:</span><span>${fmtTime(record.entry_time)}</span></div>
      <div class="row"><span class="label">Exit:</span><span>${fmtTime(exitTime)}</span></div>
      <div class="row"><span class="label">Duration:</span><span><b>${duration}</b></span></div>
      <div class="divider"></div>
      ${paymentHtml}
      <div class="divider"></div>
      <div class="footer">${settings?.receipt_footer ?? 'Thank you for using our parking!'}<br>${new Date().toLocaleString('en-IN')}</div>
      <script>window.onload = function() { window.print(); }<\/script>
    </body></html>`

  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i)
  const bodyMatch = html.match(/<body>([\s\S]*?)<script>/i) || html.match(/<body>([\s\S]*?)<\/body>/i)
  
  const styles = styleMatch ? styleMatch[1] : ''
  const bodyHtml = bodyMatch ? bodyMatch[1] : html

  const printDiv = document.createElement('div')
  printDiv.id = 'pwa-print-container'
  printDiv.innerHTML = bodyHtml
  
  const styleEl = document.createElement('style')
  styleEl.id = 'pwa-print-style'
  styleEl.innerHTML = `
    @media print {
      body > :not(#pwa-print-container) { display: none !important; }
      #pwa-print-container { display: block !important; position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 16px; background: #fff; z-index: 99999; color: #000; }
      ${styles}
    }
    @media screen {
      #pwa-print-container { display: none; }
    }
  `
  
  document.head.appendChild(styleEl)
  document.body.appendChild(printDiv)
  
  setTimeout(() => {
    window.print()
    const cleanup = () => {
      if (document.body.contains(printDiv)) document.body.removeChild(printDiv)
      if (document.head.contains(styleEl)) document.head.removeChild(styleEl)
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    setTimeout(cleanup, 10000)
  }, 250)
}

export default function ExitForm({ onBack, onSuccess, preloadTicket }) {
  const { profile, settings, tenantId } = useAuth()
  const [search, setSearch] = useState('')
  const [parkedList, setParkedList] = useState([])
  const [listLoading, setListLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [record, setRecord] = useState(null)
  const [amount, setAmount] = useState(0)
  const [payMode, setPayMode] = useState('CASH')
  const [passData, setPassData] = useState(null)
  const [autoCheckingOut, setAutoCheckingOut] = useState(false)
  const [qrUrl, setQrUrl] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successToast, setSuccessToast] = useState(null)
  const [showKeypad, setShowKeypad] = useState(true)
  // In-form QR scanner state
  const [scanningQr, setScanningQr] = useState(false)
  const qrVideoRef = useRef(null)
  const qrStreamRef = useRef(null)
  const tickerRef = useRef(null)
  const currency = settings?.currency_symbol ?? '₹'

  useEffect(() => { if (tenantId) loadParked() }, [tenantId])

  useEffect(() => {
    if (!preloadTicket || !tenantId) return
    localDb.parking_records.filter(r => r.tenant_id === tenantId && r.ticket_no === preloadTicket && r.status === 'PARKED').toArray()
      .then(arr => { if (arr[0]) selectRecord(arr[0]) })
  }, [preloadTicket, tenantId])

  async function loadParked() {
    setListLoading(true)
    let data = await localDb.parking_records.filter(r => r.tenant_id === tenantId && r.status === 'PARKED').toArray()
    data = data.sort((a,b) => new Date(b.entry_time) - new Date(a.entry_time))
    setParkedList(data ?? [])
    setListLoading(false)
  }

  const filtered = parkedList.filter(r => {
    const q = search.trim().toUpperCase()
    const qNoSpaces = q.replace(/\s/g, '')
    if (!q) return true
    return r.vehicle_number?.replace(/\s/g, '').toUpperCase().includes(qNoSpaces) || 
           r.ticket_no?.toUpperCase().includes(q) || 
           r.driver_name?.toUpperCase().includes(q) || 
           r.slot_no?.toUpperCase().includes(q)
  })

  async function selectRecord(r) { 
    setRecord(r)
    setError('')
    setPassData(null)
    setPayMode('CASH')

    if (r.pass_id) {
      setListLoading(true)
      try {
        const passArr = await localDb.parking_passes.filter(p => p.id === r.pass_id).toArray()
        const pass = passArr[0]
        if (pass && pass.status === 'ACTIVE' && new Date(pass.valid_until).getTime() > Date.now()) {
          const count = 0 // offline estimation
          
          if (!pass.max_entries || count <= pass.max_entries) {
            const remaining = pass.max_entries ? pass.max_entries - count : null
            const pData = { pass, remaining }
            setPassData(pData)
            setAmount(0)
            setPayMode('PASS')
            setAutoCheckingOut(true)
            
            // Auto complete exit after a short delay so the watchman sees the message
            setTimeout(() => {
              completeExit(r, 0, 'PASS', pData)
            }, 1200)
            return
          }
        }
      } catch (err) {}
      finally {
        setListLoading(false)
      }
    }
  }

  // Live amount ticker
  useEffect(() => {
    if (!record || payMode === 'PASS' || autoCheckingOut) return
    const calcFinalFee = () => Math.max(0, calcFee(record.vehicle_type, record.entry_time, settings) - (record.amount_paid_at_entry || 0))
    setAmount(calcFinalFee())
    tickerRef.current = setInterval(() => setAmount(calcFinalFee()), 30000)
    return () => clearInterval(tickerRef.current)
  }, [record, settings, payMode, autoCheckingOut])

  // UPI QR generation
  useEffect(() => {
    if (payMode !== 'UPI' || !record || !settings) return
    const upiId = settings.upi_id || (settings.upi_phone?.replace(/[^0-9]/g, '') + '@upi')
    if (!upiId || upiId === '@upi') { setQrDataUrl(null); setQrUrl(settings.upi_qr_url || null); return }
    const payeeName = encodeURIComponent(settings.upi_payee_name || settings.company_name || 'Parking')
    const note = encodeURIComponent(`Parking ${record.ticket_no}`)
    const link = `upi://pay?pa=${upiId}&pn=${payeeName}&am=${amount.toFixed(2)}&cu=INR&tn=${note}`
    QRCode.toDataURL(link, { width: 256, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(null))
    setQrUrl(null)
  }, [payMode, amount, record, settings])

  // ── In-form QR scanner ─────────────────────────────────────────────
  async function startInFormQr() {
    setScanningQr(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      qrStreamRef.current = stream
      if (qrVideoRef.current) { qrVideoRef.current.srcObject = stream; qrVideoRef.current.play() }
      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const interval = setInterval(async () => {
          if (!qrVideoRef.current) return clearInterval(interval)
          try {
            const codes = await detector.detect(qrVideoRef.current)
            if (codes.length > 0) {
              clearInterval(interval)
              const raw = codes[0].rawValue
              const match = raw.match(/ticket=([A-Z0-9]+)/)
              if (match) {
                stopInFormQr()
                const arr = await localDb.parking_records.filter(r => r.tenant_id === tenantId && r.ticket_no === match[1] && r.status === 'PARKED').toArray()
                if (arr[0]) selectRecord(arr[0])
                else setError(`No active parking found for ticket ${match[1]}`)
              }
            }
          } catch {}
        }, 400)
      } else {
        alert('QR scanner not supported. Please search manually.')
        stopInFormQr()
      }
    } catch {
      setError('Camera not accessible. Search manually.')
      setScanningQr(false)
    }
  }

  function stopInFormQr() {
    qrStreamRef.current?.getTracks().forEach(t => t.stop())
    setScanningQr(false)
  }

  function shareWhatsApp() {
    if (!record) return
    const text = `*${settings?.company_name ?? 'VBills'} — Parking Receipt*\n\n` +
      `🎫 Ticket: ${record.ticket_no}\n🚗 Vehicle: ${record.vehicle_number} (${record.vehicle_type})\n` +
      `🕐 Entry: ${fmtTime(record.entry_time)}\n🕐 Exit: ${fmtTime(new Date())}\n` +
      `⏱ Duration: ${fmtDuration(record.entry_time)}\n💳 Payment: ${payMode}\n` +
      `💰 *Total: ${currency}${amount.toFixed(2)}*\n\nThank you! 🙏`
    const phone = record.driver_phone?.replace(/[^0-9]/g, '') ?? ''
    window.open(`https://wa.me/${phone ? '91' + phone : ''}?text=${encodeURIComponent(text)}`, '_blank')
  }

  async function completeExit(overrideRecord, overrideAmount, overrideMode, overridePassData) {
    const rec = overrideRecord?.id ? overrideRecord : record
    const amt = overrideAmount !== undefined && typeof overrideAmount !== 'object' ? overrideAmount : amount
    const mode = overrideMode && typeof overrideMode === 'string' ? overrideMode : payMode
    const pData = overridePassData !== undefined && overridePassData?.pass ? overridePassData : passData

    if (!rec) return
    setLoading(true); setError('')
    try {
      const now = new Date().toISOString()
      const durationMins = Math.floor((Date.now() - new Date(rec.entry_time).getTime()) / 60000)
      
      await localDb.parking_records.update(rec.id, {
        exit_time: now, duration_minutes: durationMins,
        amount_charged: amt, payment_mode: mode, status: 'EXITED'
      })
      SyncEngine.queueAction('UPDATE_PARKING_EXIT', 'parking_records', {
        id: rec.id, exit_time: now, duration_minutes: durationMins,
        amount_charged: amt, payment_mode: mode, status: 'EXITED'
      })

      if (amt > 0) {
        const paymentPayload = {
          id: crypto.randomUUID(),
          tenant_id: tenantId, ticket_no: rec.ticket_no,
          amount: amt, method: mode, status: 'COMPLETED',
          collected_by: profile?.full_name, settled_at: now
        }
        await localDb.payments.add(paymentPayload)
        SyncEngine.queueAction('INSERT_PAYMENT', 'payments', paymentPayload)
      }

      SyncEngine.queueAction('INSERT_AUDIT_LOG', 'audit_log', {
        tenant_id: tenantId, user_name: profile?.full_name,
        action: 'VEHICLE_EXIT',
        details: `${rec.vehicle_number} | ${currency}${amt} | ${mode}${pData ? ' | PASS' : ''}`
      })

      // Auto-print receipt immediately — no manual button
      printReceipt({ record: rec, amount: amt, payMode: mode, settings, passData: pData })
      
      setSuccessToast({ ticket: rec.ticket_no, vehicleNo: rec.vehicle_number })
      
      setTimeout(() => {
        setSuccessToast(null)
        setAutoCheckingOut(false)
        setRecord(null)
        setSearch('')
        loadParked()
        onSuccess()
      }, 1500)
    } catch (err) {
      setError(err.message)
      setAutoCheckingOut(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="watchman-form">

      {/* Auto-dismissing success toast */}
      {successToast && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
        }}>
          <div style={{
            background: '#14532d', border: '2px solid #22c55e', borderRadius: 20, padding: '28px 40px',
            textAlign: 'center', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#86efac', marginBottom: 4 }}>Vehicle Exited</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 3, color: '#fff' }}>{successToast.ticket}</div>
            <div style={{ fontSize: 18, color: '#86efac', marginTop: 4 }}>{successToast.vehicleNo}</div>
          </div>
        </div>
      )}

      {/* In-form QR scanner overlay */}
      {scanningQr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 800 }}>📷 Scan Entry Slip QR Code</div>
          <video ref={qrVideoRef} style={{ width: '92%', maxWidth: 380, borderRadius: 16, border: '3px solid #6366f1' }} autoPlay playsInline muted />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Point camera at the QR on the entry slip</div>
          <button onClick={stopInFormQr} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>✕ Cancel</button>
        </div>
      )}

      <div className="watchman-form-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <div>
          <div className="watchman-form-title" style={{ color: '#f87171' }}>🔴 Vehicle Exit</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Look up vehicle & collect payment</div>
        </div>
        {/* QR Scan button prominently in header */}
        <button
          onClick={startInFormQr}
          style={{
            background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', border: 'none',
            borderRadius: 12, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto'
          }}
        >
          📷 Scan QR
        </button>
      </div>

      <div className="watchman-form-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Left: vehicle list + bill */}
        <div className="watchman-form-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px' }}>
          {error && <div className="alert alert-danger" style={{ marginBottom: 12, flexShrink: 0 }}>{error}</div>}

          {!record ? (
            <>
              <div style={{ position: 'relative', marginBottom: 12, flexShrink: 0 }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--text-muted)' }}>🔍</span>
                <input
                  className="form-input form-input-xl"
                  value={search}
                  onChange={e => { setSearch(e.target.value.toUpperCase()); setShowKeypad(true); }}
                  onFocus={() => setShowKeypad(true)}
                  placeholder="Search vehicle no..."
                  inputMode="none"
                  style={{ padding: '16px 16px 16px 52px', fontSize: 22, fontWeight: 800, letterSpacing: '1px' }}
                  autoFocus
                />
              </div>

              {showKeypad ? (
                <div style={{ marginBottom: 16, flex: 1 }}>
                  <PlateKeypad value={search} onChange={setSearch} onAccept={() => setShowKeypad(false)} />
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    {listLoading ? 'Loading...' : `${filtered.length} vehicle${filtered.length !== 1 ? 's' : ''} inside — tap to select`}
                  </div>

                  {listLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                  ) : filtered.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                      {search ? `No vehicles matching "${search}"` : 'No vehicles currently parked'}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
                      {filtered.map(r => {
                        const mins = Math.floor((Date.now() - new Date(r.entry_time).getTime()) / 60000)
                        const h = Math.floor(mins / 60), m = mins % 60
                        const duration = h > 0 ? `${h}h ${m}m` : `${m}m`
                        const isOvernight = (Date.now() - new Date(r.entry_time).getTime()) > 12 * 60 * 60 * 1000
                        return (
                          <button key={r.id} onClick={() => selectRecord(r)} style={{
                            display: 'flex', alignItems: 'center', gap: 14,
                            background: '#fff', border: `2px solid ${isOvernight ? '#fca5a5' : '#e2e8f0'}`,
                            borderRadius: 14, padding: '12px 16px', cursor: 'pointer',
                            textAlign: 'left', fontFamily: 'inherit', boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                          }}>
                            <div style={{ width: 50, height: 50, borderRadius: 12, flexShrink: 0, background: isOvernight ? '#fee2e2' : '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                              {r.vehicle_type === '2-Wheeler' ? '🛵' : r.vehicle_type === 'Heavy Vehicle' ? '🚌' : '🚗'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: 1, color: '#0f172a' }}>{r.vehicle_number}</div>
                              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                {r.vehicle_type} · {r.ticket_no}{r.slot_no ? ` · Slot ${r.slot_no}` : ''}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 15, color: isOvernight ? '#dc2626' : '#4f46e5' }}>{duration}</div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                {new Date(r.entry_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                              </div>
                              {isOvernight && <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>OVERNIGHT</div>}
                            </div>
                            <span style={{ color: '#6366f1', fontSize: 20 }}>›</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* Bill Card — shown after selecting vehicle */
            <div style={{ position: 'relative' }}>
              {autoCheckingOut && (
                <div style={{
                  position: 'absolute', inset: -10, background: 'rgba(255,255,255,0.85)', zIndex: 10,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(4px)', borderRadius: 16
                }}>
                  <div style={{ fontSize: 48, animation: 'pulse 1s infinite' }}>🎫</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#059669', marginTop: 12 }}>VALID PASS DETECTED</div>
                  <div style={{ fontSize: 14, color: '#34d399', fontWeight: 700 }}>Auto Checking Out...</div>
                </div>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => { setRecord(null); loadParked() }} style={{ marginBottom: 12, color: 'var(--brand-primary)' }}>
                ← Back to list
              </button>

              {/* Prominent IN / OUT / Duration display */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text-primary)', marginBottom: 12, letterSpacing: 1 }}>
                  {record.vehicle_number} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>— {record.vehicle_type}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div style={{ textAlign: 'center', background: 'rgba(16,185,129,0.1)', borderRadius: 10, padding: '10px 6px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#34d399', textTransform: 'uppercase', marginBottom: 4 }}>IN</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {new Date(record.entry_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {new Date(record.entry_time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', background: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: '10px 6px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', marginBottom: 4 }}>OUT</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', background: 'rgba(99,102,241,0.1)', borderRadius: 10, padding: '10px 6px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', marginBottom: 4 }}>DURATION</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-primary)' }}>{fmtDuration(record.entry_time)}</div>
                  </div>
                </div>

                {record.driver_name && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>👤 {record.driver_name}{record.driver_phone ? ` · 📞 ${record.driver_phone}` : ''}</div>}
                {record.slot_no && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>📍 Slot: {record.slot_no}</div>}
                {(Date.now() - new Date(record.entry_time).getTime()) > 12 * 60 * 60 * 1000 && (
                  <div className="alert alert-danger" style={{ marginTop: 8 }}>⚠️ Overnight vehicle — over 12 hours</div>
                )}
                
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ color: '#94a3b8' }}>Total Duration:</span>
                    <span style={{ fontWeight: 600 }}>{fmtDuration(record.entry_time)}</span>
                  </div>
                  
                  {record.amount_paid_at_entry > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ color: '#94a3b8' }}>Total Fee:</span>
                        <span style={{ fontWeight: 600 }}>{currency}{(amount + record.amount_paid_at_entry).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, color: '#10b981' }}>
                        <span>Prepaid at Entry:</span>
                        <span style={{ fontWeight: 700 }}>-{currency}{record.amount_paid_at_entry.toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: record.amount_paid_at_entry > 0 ? 12 : 8, borderTop: record.amount_paid_at_entry > 0 ? '1px dashed rgba(255,255,255,0.2)' : 'none' }}>
                    <span style={{ color: '#94a3b8', fontSize: 16 }}>Amount Due:</span>
                    <span style={{ fontSize: 32, fontWeight: 900, color: '#fff' }}>{currency}{amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Total amount */}
              <div style={{ background: 'linear-gradient(135deg,#312e81,#4f46e5)', borderRadius: 14, padding: '16px 20px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600 }}>TOTAL DUE</div>
                <div style={{ color: '#fff', fontSize: 32, fontWeight: 900 }}>{currency}{amount.toFixed(2)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Right: payment panel */}
        <div className="watchman-form-panel">
          {!record ? (
            <div style={{ textAlign: 'center', paddingTop: 40, color: 'var(--text-muted)', fontSize: 14 }}>
              Select a vehicle from the list to process exit.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Payment Method
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['CASH', 'UPI', 'CARD'].map(m => (
                  <button key={m} type="button"
                    className={`btn ${payMode === m ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }} onClick={() => setPayMode(m)}
                  >
                    {m === 'CASH' ? '💵' : m === 'UPI' ? '📱' : '💳'} {m}
                  </button>
                ))}
              </div>

              {payMode === 'UPI' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>Ask customer to scan and pay</div>
                  <div className="qr-image-wrap" style={{ width: 180, height: 180, margin: '0 auto 8px' }}>
                    {qrUrl ? <img src={qrUrl} alt="UPI QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      : qrDataUrl ? <img src={qrDataUrl} alt="UPI QR" style={{ width: '100%', height: '100%' }} />
                      : <div style={{ color: '#999', fontSize: 12, padding: 16 }}>⚠️ No UPI configured</div>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {settings?.upi_id || settings?.upi_phone || 'Configure UPI in Settings'}
                  </div>
                </div>
              )}

              <button className="btn btn-success btn-full btn-lg" style={{ marginTop: 'auto' }} onClick={completeExit} disabled={loading}>
                {loading ? '⏳ Processing...' : `✅ ${payMode === 'UPI' ? 'Payment Received' : 'Confirm & Complete'} — Print Receipt`}
              </button>

              {record.driver_phone && (
                <button className="btn btn-ghost btn-full" onClick={shareWhatsApp}>
                  💬 WhatsApp Receipt
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
