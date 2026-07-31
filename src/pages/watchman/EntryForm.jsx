import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import PlateKeypad, { formatVehicleNo } from '../../components/PlateKeypad'

const VEHICLE_TYPES = ['2-Wheeler', '4-Wheeler', '4-Wheeler (SUV)', 'Heavy Vehicle', 'Auto Rickshaw']


function generateTicket() {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `PK${now.getFullYear().toString().slice(-2)}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

// ── Print using blob URL — most reliable approach ───────────────────
async function printEntrySlip({ ticket, vehicleNo, vehicleType, slotNo, zone, entryTime, companyName, address, passInfo, amountPaidAtEntry, entryPaymentMode }) {
  const qrData = `vbills://exit?ticket=${ticket}&vehicle=${vehicleNo.replace(/\s/g,'')}`
  let qrDataUrl = ''
  try {
    const QRCode = (await import('qrcode')).default
    qrDataUrl = await QRCode.toDataURL(qrData, { width: 180, margin: 1 })
  } catch {}

  let diagramHtml = ''
  if (zone || slotNo) {
    diagramHtml += `<div class="divider"></div>`
    diagramHtml += `<div class="center" style="margin: 8px 0; font-weight: bold; font-size: 11px;">📍 PARKING LOCATION</div>`
    
    // Grid Diagram
    if (zone && zone.slot_diagram_enabled && slotNo) {
      const rows = zone.rows_count || 4
      const cols = zone.cols_count || 5
      const COL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      
      diagramHtml += `<div class="center" style="font-size:24px; font-weight:900; margin-bottom: 6px;">${slotNo}</div>`
      diagramHtml += `<table style="width:100%; border-collapse:collapse; margin-bottom: 8px;">`
      for (let r = 0; r < rows; r++) {
        diagramHtml += `<tr>`
        for (let c = 0; c < cols; c++) {
          const label = `${COL_LABELS[r]}-${c + 1}`
          const isTarget = label.toLowerCase() === slotNo.toLowerCase()
          diagramHtml += `<td style="border:1.5px solid ${isTarget ? '#000' : '#ccc'}; text-align:center; padding:8px 0; width:${100/cols}%; font-size:12px; font-weight:900; ${isTarget ? 'background:#000; color:#fff;' : 'color:#eee;'}">${isTarget ? label : ''}</td>`
        }
        diagramHtml += `</tr>`
      }
      diagramHtml += `</table>`
      diagramHtml += `<div class="center" style="font-size:11px; color:#555; font-weight:bold;">(ZONE: ${zone.zone_name.toUpperCase()})</div>`
    } else {
      // Visual box fallback when grid is disabled or no slot specified
      diagramHtml += `<div style="display:flex; justify-content:center; gap: 16px; margin: 12px 0;">`
      if (zone) {
        diagramHtml += `<div style="border: 2px solid #000; border-radius: 8px; padding: 12px; width: 120px; text-align: center;">`
        diagramHtml += `<div style="font-size:10px; color:#555;">ZONE</div>`
        diagramHtml += `<div style="font-size:18px; font-weight:900; margin-top:4px;">${zone.zone_name.toUpperCase()}</div>`
        diagramHtml += `</div>`
      }
      if (slotNo) {
        diagramHtml += `<div style="border: 2px solid #000; border-radius: 8px; padding: 12px; width: 120px; text-align: center; background: #000; color: #fff;">`
        diagramHtml += `<div style="font-size:10px; color:#ccc;">SLOT</div>`
        diagramHtml += `<div style="font-size:18px; font-weight:900; margin-top:4px;">${slotNo.toUpperCase()}</div>`
        diagramHtml += `</div>`
      }
      diagramHtml += `</div>`
      if (slotNo && !zone) {
        diagramHtml += `<div class="center" style="font-size:10px; color:#555; margin-top: 4px;">Proceed to your designated slot</div>`
      }
    }
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Entry Slip</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Courier New',monospace; font-size:13px; color:#000; background:#fff; padding:16px; width:340px; }
      .center { text-align:center; }
      .logo { font-size:20px; font-weight:900; letter-spacing:-1px; }
      .divider { border-top:1px dashed #666; margin:8px 0; }
      .row { display:flex; justify-content:space-between; margin:4px 0; }
      .label { color:#555; }
      .ticket { font-size:20px; font-weight:900; text-align:center; letter-spacing:2px; margin:10px 0; border:2px solid #000; padding:8px; border-radius:4px; }
      .qr-wrap { display:flex; justify-content:center; margin:12px 0 4px; }
      .qr-hint { font-size:10px; color:#666; text-align:center; margin-bottom:6px; }
      .pass-banner { background:#d1fae5; border:1px solid #6ee7b7; border-radius:4px; padding:6px 10px; margin:6px 0; font-size:11px; font-weight:bold; color:#065f46; text-align:center; }
      .footer { font-size:11px; color:#777; text-align:center; margin-top:10px; }
      @media print { body { padding:0; } }
    </style></head><body>
      <div class="center logo">${companyName}</div>
      ${address ? `<div class="center" style="font-size:11px;color:#666;margin-bottom:4px">${address}</div>` : ''}
      <div class="divider"></div>
      <div class="center" style="font-size:11px;font-weight:bold;margin-bottom:6px">PARKING ENTRY SLIP</div>
      <div class="ticket">${ticket}</div>
      <div class="row"><span class="label">Vehicle No:</span><span><b>${vehicleNo}</b></span></div>
      <div class="row"><span class="label">Type:</span><span>${vehicleType}</span></div>
      ${(!diagramHtml && zone?.zone_name) ? `<div class="row"><span class="label">Zone:</span><span>${zone.zone_name}</span></div>` : ''}
      ${(!diagramHtml && slotNo) ? `<div class="row"><span class="label">Slot:</span><span>${slotNo}</span></div>` : ''}
      <div class="row"><span class="label">Entry Time:</span><span>${new Date(entryTime).toLocaleString('en-IN', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short', hour12:true })}</span></div>
      ${amountPaidAtEntry > 0 ? `<div class="divider"></div><div class="row"><span class="label">Entry Fee Paid:</span><span><b>₹${amountPaidAtEntry}</b> (${entryPaymentMode})</span></div>` : ''}
      ${passInfo ? `<div class="pass-banner">PARKING PASS - Expires ${passInfo.expiry}</div>` : ''}
      
      ${diagramHtml}
      
      <div class="divider"></div>
      ${qrDataUrl ? `<div class="qr-wrap"><img src="${qrDataUrl}" width="140" height="140" /></div><div class="qr-hint">Scan QR at exit for quick payment</div>` : ''}
      <div class="footer">Keep this slip for exit. Thank you for using ${companyName}!</div>
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

// ── Success Modal (replaces window.confirm) ──────────────────────────
function SuccessModal({ ticket, vehicleNo, vehicleType, zoneName, passInfo, onPrint, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 32, maxWidth: 380, width: '100%',
        textAlign: 'center', boxShadow: '0 25px 60px rgba(0,0,0,0.4)'
      }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>Vehicle Registered!</div>
        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 3, color: '#4f46e5', margin: '12px 0', padding: '10px 16px', border: '2px solid #e0e7ff', borderRadius: 12, background: '#eef2ff' }}>
          {ticket}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{vehicleNo}</div>
        <div style={{ fontSize: 14, color: '#64748b', marginBottom: zoneName || passInfo ? 8 : 20 }}>{vehicleType}</div>
        {zoneName && <div style={{ fontSize: 13, color: '#4f46e5', fontWeight: 600, marginBottom: 8 }}>📍 Zone: {zoneName}</div>}
        {passInfo && (
          <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 10, padding: '8px 12px', marginBottom: 16, fontSize: 13, fontWeight: 700, color: '#065f46' }}>
            🎫 PASS HOLDER — Expires {passInfo.expiry}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onPrint}
            style={{ flex: 1, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            🖨️ Print Slip
          </button>
          <button
            onClick={onDismiss}
            style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            ✓ Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EntryForm({ onBack, onSuccess }) {
  const { profile, settings, tenantId } = useAuth()
  const [vehicleNo, setVehicleNo] = useState('')
  const [vehicleType, setVehicleType] = useState('4-Wheeler')
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [slotNo, setSlotNo] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [notes, setNotes] = useState('')
  const [zones, setZones] = useState([])
  const [zoneStats, setZoneStats] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showKeypad, setShowKeypad] = useState(true)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState('')
  const [passInfo, setPassInfo] = useState(null)
  const [checkingPass, setCheckingPass] = useState(false)
  const [successToast, setSuccessToast] = useState(null) // { ticket, vehicleNo }
  
  // Entry Fee states
  const [entryFeeAmount, setEntryFeeAmount] = useState(null)
  const [entryFeePayMode, setEntryFeePayMode] = useState('CASH')
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const passDebounce = useRef(null)

  const zonesEnabled = settings?.zones_enabled ?? false
  const passesEnabled = settings?.feature_passes_enabled ?? false
  const vehicleTypeRef = useRef(null)
  const slotNoRef = useRef(null)

  useEffect(() => {
    if (zonesEnabled && tenantId) loadZones()
  }, [zonesEnabled, tenantId])

  useEffect(() => {
    if (!passesEnabled || !tenantId) return
    clearTimeout(passDebounce.current)
    const num = vehicleNo.replace(/\s/g, '').toUpperCase()
    if (num.length < 6) { setPassInfo(null); return }
    passDebounce.current = setTimeout(() => checkPass(num), 600)
  }, [vehicleNo, passesEnabled, tenantId])

  async function checkPass(vehicleNum) {
    setCheckingPass(true)
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase.from('parking_passes')
      .select('*').eq('tenant_id', tenantId).eq('vehicle_number', vehicleNum).eq('status', 'ACTIVE').gte('valid_until', today).single()
    setCheckingPass(false)
    if (data) {
      const daysLeft = Math.ceil((new Date(data.valid_until) - new Date()) / (1000 * 60 * 60 * 24))
      setPassInfo({ ...data, daysLeft, expiry: new Date(data.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) })
    } else { setPassInfo(null) }
  }

  async function loadZones() {
    const { data } = await supabase.from('parking_zones').select('*').eq('tenant_id', tenantId).eq('active', true).order('zone_order')
    setZones(data ?? [])
    if (data?.length) {
      const counts = {}
      await Promise.all(data.map(async z => {
        const { count } = await supabase.from('parking_records').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('zone_id', z.id).eq('status', 'PARKED')
        counts[z.id] = count ?? 0
      }))
      setZoneStats(counts)
    }
  }

  async function openCamera() {
    setCameraOpen(true); setScanResult('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play() }
    } catch {
      setError('Camera not accessible. Enter vehicle number manually.')
      setCameraOpen(false)
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    setCameraOpen(false)
  }

  async function captureAndOcr() {
    if (!videoRef.current || !canvasRef.current) return
    setScanning(true); setScanResult('Reading plate...')
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      const avg = (d[i] + d[i+1] + d[i+2]) / 3
      const v = avg > 128 ? 255 : 0
      d[i] = v; d[i+1] = v; d[i+2] = v
    }
    ctx.putImageData(imgData, 0, 0)
    try {
      const Tesseract = (await import('tesseract.js')).default
      const { data: { text } } = await Tesseract.recognize(canvas, 'eng', {
        logger: () => {},
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      })
      const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11)
      const plateRegex = /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/
      if (cleaned.length >= 4) {
        const formatted = formatVehicleNo(cleaned)
        setVehicleNo(formatted)
        setScanResult(plateRegex.test(cleaned) ? `✅ Plate Read: ${formatted}` : `⚠️ Partial: ${formatted} — verify`)
        if (plateRegex.test(cleaned)) setTimeout(() => closeCamera(), 800)
      } else {
        setScanResult('❌ Could not read plate. Try again or enter manually.')
      }
    } catch { setScanResult('❌ OCR failed. Please enter number manually.') }
    finally { setScanning(false) }
  }

  function handleVehicleNoChange(raw) {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9\s]/g, '')
    const noSpaces = clean.replace(/\s/g, '')
    setVehicleNo(noSpaces.length >= 4 ? formatVehicleNo(noSpaces) : clean)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const num = vehicleNo.replace(/\s/g, '').toUpperCase()
    if (num.length < 4) { setError('Enter a valid vehicle number (min 4 characters)'); return }

    setLoading(true); setError('')
    try {
      // Capacity check
      const { count: parked } = await supabase.from('parking_records')
        .select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'PARKED')
      const total = settings?.total_slots ?? 50
      if (parked >= total) { setError('❌ Parking is FULL. No slots available.'); setLoading(false); return }

      // Duplicate check
      const { data: existing } = await supabase.from('parking_records')
        .select('id, ticket_no').eq('tenant_id', tenantId).eq('vehicle_number', num).eq('status', 'PARKED')
      if (existing?.length > 0) {
        setError(`⚠️ ${num} is already parked! (Ticket: ${existing[0].ticket_no}). Cannot enter twice.`)
        setLoading(false); return
      }

      // Zone capacity check
      if (zoneId) {
        const selectedZone = zones.find(z => z.id === zoneId)
        const zoneFilled = zoneStats[zoneId] ?? 0
        if (selectedZone && zoneFilled >= selectedZone.total_slots) {
          setError(`❌ Zone "${selectedZone.zone_name}" is FULL.`)
          setLoading(false); return
        }
      }

      // Check for Upfront Entry Fee
      const rules = settings?.rate_rules
      let upfrontFee = 0
      if (rules && !passInfo) {
        const typeRules = rules[vehicleType] || rules['4-Wheeler'] || []
        if (typeRules.length > 0 && typeRules[0].type === 'entry_fee') {
          upfrontFee = typeRules[0].charge
        }
      }

      if (upfrontFee > 0) {
        setEntryFeeAmount(upfrontFee)
        setLoading(false)
        return // Wait for payment modal
      }

      await executeEntry(0, null)
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Try again.')
      setLoading(false)
    }
  }

  // Generate QR for Entry Fee UPI
  useEffect(() => {
    if (entryFeePayMode !== 'UPI' || !entryFeeAmount || !settings) return
    const upiId = settings.upi_id || (settings.upi_phone?.replace(/[^0-9]/g, '') + '@upi')
    if (!upiId || upiId === '@upi') { setQrDataUrl(null); return }
    const payeeName = encodeURIComponent(settings.upi_payee_name || settings.company_name || 'Parking')
    const note = encodeURIComponent(`Entry Fee ${vehicleNo}`)
    const link = `upi://pay?pa=${upiId}&pn=${payeeName}&am=${entryFeeAmount.toFixed(2)}&cu=INR&tn=${note}`
    QRCode.toDataURL(link, { width: 256, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(null))
  }, [entryFeePayMode, entryFeeAmount, vehicleNo, settings])

  async function executeEntry(paidAmount, payMode) {
    setLoading(true); setError('')
    try {
      const num = vehicleNo.replace(/\s/g, '').toUpperCase()
      const ticket = generateTicket()
      const entryTime = new Date().toISOString()
      const selectedZone = zones.find(z => z.id === zoneId)

      const { error: insErr } = await supabase.from('parking_records').insert({
        tenant_id: tenantId,
        ticket_no: ticket,
        vehicle_number: num,
        vehicle_type: vehicleType,
        driver_name: driverName || null,
        driver_phone: driverPhone || null,
        slot_no: slotNo || null,
        zone_id: zoneId || null,
        pass_id: passInfo?.id || null,
        notes: notes || null,
        operator_name: profile?.full_name ?? 'Watchman',
        entry_time: entryTime,
        status: 'PARKED',
        amount_paid_at_entry: paidAmount,
        payment_method_at_entry: payMode
      })
      if (insErr) throw insErr

      // Record payment in payments table if collected
      if (paidAmount > 0) {
        await supabase.from('payments').insert({
          tenant_id: tenantId, ticket_no: ticket,
          amount: paidAmount, method: payMode, status: 'COMPLETED',
          collected_by: profile?.full_name, settled_at: entryTime
        })
      }

      // Audit log — fire and forget properly (no .catch on PromiseLike)
      ;(async () => {
        try {
          await supabase.from('audit_log').insert({
            tenant_id: tenantId,
            user_name: profile?.full_name,
            action: 'VEHICLE_ENTRY',
            details: `${num} | Ticket: ${ticket}${selectedZone ? ` | Zone: ${selectedZone.zone_name}` : ''}${passInfo ? ' | PASS' : ''}`
          })
        } catch {}
      })()

      // Log pass usage if applicable
      if (passInfo) {
        ;(async () => {
          try {
            await supabase.from('pass_usage_logs').insert({
              tenant_id: tenantId,
              pass_id: passInfo.id,
              ticket_no: ticket,
              used_at: entryTime
            })
          } catch {}
        })()
      }

      // Auto-print slip immediately — no manual button
      printEntrySlip({
        ticket, vehicleNo: num, vehicleType,
        slotNo, zone: selectedZone ?? null,
        entryTime,
        companyName: settings?.company_name ?? 'VBills',
        address: settings?.address ?? '',
        passInfo: passInfo || null,
        amountPaidAtEntry: paidAmount,
        entryPaymentMode: payMode
      }).catch(() => {})

      // Show 1.5-second toast, then reset all fields for next vehicle
      setSuccessToast({ ticket, vehicleNo: num })
      setTimeout(() => {
        setSuccessToast(null)
        // Reset all form fields for next entry
        setVehicleNo('')
        setDriverName('')
        setDriverPhone('')
        setSlotNo('')
        setZoneId('')
        setNotes('')
        setPassInfo(null)
        setVehicleType('4-Wheeler')
        setError('')
        setEntryFeeAmount(null)
        onSuccess() // just for stats refresh — stays on form
      }, 1500)
    } catch (err) {
      setError(err.message ?? 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }


  const selectedZone = zones.find(z => z.id === zoneId)
  const zoneParked = zoneId ? (zoneStats[zoneId] ?? 0) : null
  const zoneFull = selectedZone ? zoneParked >= selectedZone.total_slots : false
  const showRightPanel = (zonesEnabled && zones.length > 0) || cameraOpen

  return (
    <div className="watchman-form">

      {/* Upfront Entry Fee Payment Modal */}
      {entryFeeAmount !== null && !loading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#1e293b', borderRadius: 20, padding: 24, maxWidth: 360, width: '100%', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ color: '#fff', margin: '0 0 16px 0', textAlign: 'center', fontSize: 20 }}>Upfront Entry Fee</h3>
            
            {/* Payment Mode Toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['CASH', 'UPI'].map(m => (
                <button key={m} onClick={() => setEntryFeePayMode(m)} style={{
                  flex: 1, padding: '12px', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer',
                  background: entryFeePayMode === m ? '#6366f1' : 'rgba(255,255,255,0.05)',
                  color: entryFeePayMode === m ? '#fff' : '#94a3b8'
                }}>
                  {m === 'CASH' ? '💵 Cash' : '📱 UPI'}
                </button>
              ))}
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 20 }}>
              <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 4 }}>Amount to Collect</div>
              <div style={{ color: '#fff', fontSize: 36, fontWeight: 900 }}>{settings?.currency_symbol ?? '₹'}{entryFeeAmount}</div>
            </div>

            {entryFeePayMode === 'UPI' && (
              <div style={{ background: '#fff', padding: 16, borderRadius: 16, display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                {qrDataUrl ? <img src={qrDataUrl} alt="UPI QR" style={{ width: 200, height: 200 }} /> : <div style={{ height: 200, display: 'flex', alignItems: 'center', color: '#666' }}>Generating QR...</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setEntryFeeAmount(null)} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => executeEntry(entryFeeAmount, entryFeePayMode)} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
                Confirm Paid
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div style={{ fontSize: 16, fontWeight: 700, color: '#86efac', marginBottom: 4 }}>Registered & Printing...</div>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 3, color: '#fff' }}>{successToast.ticket}</div>
            <div style={{ fontSize: 18, color: '#86efac', marginTop: 4 }}>{successToast.vehicleNo}</div>
          </div>
        </div>
      )}

      <div className="watchman-form-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <div>
          <div className="watchman-form-title" style={{ color: '#34d399' }}>🟢 Vehicle Entry</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Register an incoming vehicle</div>
        </div>
      </div>


      <div className="watchman-form-body" style={{ gridTemplateColumns: showRightPanel ? undefined : '1fr' }}>
        <div className="watchman-form-main" style={{ borderRight: showRightPanel ? undefined : 'none', display: 'flex', flexDirection: 'column' }}>
          {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}

          {/* Pass banner */}
          {passInfo && (
            <div style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', border: '1.5px solid #34d399', borderRadius: 12, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 24 }}>🎫</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#065f46' }}>✅ PARKING PASS ACTIVE</div>
                <div style={{ fontSize: 12, color: '#047857' }}>{passInfo.pass_type} Pass · {passInfo.holder_name} · Expires in <b>{passInfo.daysLeft} days</b></div>
              </div>
            </div>
          )}
          {checkingPass && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>🔍 Checking pass...</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Vehicle number */}
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">Vehicle Number *</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <input
                  className="form-input form-input-xl"
                  value={vehicleNo}
                  onChange={e => { setVehicleNo(e.target.value); setShowKeypad(true) }}
                  onFocus={() => setShowKeypad(true)}
                  placeholder="MH 12 AB 1234"
                  inputMode="none"
                  maxLength={13} autoFocus
                  style={{ flex: 1, textAlign: 'center', letterSpacing: '2px', fontWeight: 800, fontSize: 22 }}
                />
                <button type="button" className="btn btn-secondary"
                  onClick={openCamera} style={{ padding: '0 14px', fontSize: 20 }} title="Scan plate">
                  📷
                </button>
              </div>
              {showKeypad && (
                <PlateKeypad value={vehicleNo} onChange={v => { setVehicleNo(v); handleVehicleNoChange(v); }} onAccept={() => setShowKeypad(false)} />
              )}
            </div>

            {/* Vehicle type + zone/slot */}
            <div className="grid-2" style={{ marginBottom: 8 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Vehicle Type *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setVehicleType('2-Wheeler')}
                    style={{ flex: 1, padding: '10px 4px', borderRadius: 12, border: vehicleType === '2-Wheeler' ? '2px solid var(--brand-primary)' : '2px solid var(--border-color)', background: vehicleType === '2-Wheeler' ? 'rgba(99,102,241,0.1)' : 'var(--bg-card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transition: 'all 0.2s' }}>
                    <span style={{ fontSize: 32 }}>🛵</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: vehicleType === '2-Wheeler' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}>Bike</span>
                  </button>
                  <button type="button" onClick={() => setVehicleType('4-Wheeler')}
                    style={{ flex: 1, padding: '10px 4px', borderRadius: 12, border: vehicleType === '4-Wheeler' ? '2px solid var(--brand-primary)' : '2px solid var(--border-color)', background: vehicleType === '4-Wheeler' ? 'rgba(99,102,241,0.1)' : 'var(--bg-card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, transition: 'all 0.2s' }}>
                    <span style={{ fontSize: 32 }}>🚗</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: vehicleType === '4-Wheeler' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}>Car</span>
                  </button>
                </div>
              </div>
              {zonesEnabled && zones.length > 0 && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Zone</label>
                  <select className="form-select" value={zoneId} onChange={e => setZoneId(e.target.value)}>
                    <option value="">— Any zone —</option>
                    {zones.map(z => {
                      const used = zoneStats[z.id] ?? 0
                      const full = used >= z.total_slots
                      return <option key={z.id} value={z.id} disabled={full}>{z.zone_name} ({used}/{z.total_slots}{full ? ' FULL' : ''})</option>
                    })}
                  </select>
                  {zoneFull && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>⚠️ Zone full!</div>}
                </div>
              )}
            </div>

            {settings?.collect_driver_details && (
              <div className="grid-2" style={{ marginBottom: 8 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Driver Name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opt.)</span></label>
                  <input className="form-input" value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Optional" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Driver Phone <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opt.)</span></label>
                  <input className="form-input" value={driverPhone} onChange={e => setDriverPhone(e.target.value)} placeholder="WhatsApp" type="tel" />
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 10 }}>
              <button type="submit" className="btn btn-success btn-full btn-lg" disabled={loading || zoneFull} style={{ fontSize: 18, padding: '16px' }}>
                {loading ? '⏳ Registering...' : passInfo ? '🎫 Register PASS Entry' : '✅ Register Entry'}
              </button>
            </div>
          </form>
        </div>

        {showRightPanel && (
          <div className="watchman-form-panel">
            {zonesEnabled && zones.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Zones</div>
                {zones.map(z => {
                  const used = zoneStats[z.id] ?? 0
                  const free = z.total_slots - used
                  const pct = Math.round((used / z.total_slots) * 100)
                  const color = pct >= 90 ? 'var(--danger)' : pct >= 60 ? 'var(--warning)' : 'var(--success)'
                  return (
                    <div key={z.id} className="zone-mini-card" onClick={() => setZoneId(z.id === zoneId ? '' : z.id)}
                      style={{ cursor: 'pointer', marginBottom: 8, borderColor: zoneId === z.id ? 'var(--brand-primary)' : undefined }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>📍 {z.zone_name}</span>
                        <span style={{ fontSize: 12, color, fontWeight: 700 }}>{free > 0 ? `${free} free` : 'FULL'}</span>
                      </div>
                      <div className="occupancy-bar-wrap" style={{ height: 4 }}>
                        <div className={`occupancy-bar ${pct >= 90 ? 'high' : pct >= 60 ? 'medium' : 'low'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {cameraOpen && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>📷 Point at Number Plate</div>
                <div className="anpr-container" style={{ marginBottom: 8 }}>
                  <video ref={videoRef} className="anpr-video" autoPlay playsInline muted />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <div className="anpr-overlay"><div className="anpr-scan-box"><div className="anpr-scan-line" /></div></div>
                </div>
                {scanResult && <div style={{ padding: '6px 10px', background: 'var(--bg-card)', borderRadius: 8, fontSize: 13, marginBottom: 8 }}>{scanResult}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={captureAndOcr} disabled={scanning}>
                    {scanning ? '⏳ Reading...' : '📸 Capture & Read'}
                  </button>
                  <button className="btn btn-ghost" onClick={closeCamera}>✕</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
