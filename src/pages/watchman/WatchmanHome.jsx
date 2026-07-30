import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import EntryForm from './EntryForm'
import ExitForm from './ExitForm'

export default function WatchmanHome() {
  const { profile, settings, tenantId, signOut } = useAuth()
  const [view, setView] = useState('home') // 'home' | 'entry' | 'exit'
  const [preloadTicket, setPreloadTicket] = useState(null)
  const [stats, setStats] = useState({ parked: 0, total: 50, todayEntries: 0, todayExits: 0 })
  const [scanningQr, setScanningQr] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const qrVideoRef = useRef(null)
  const qrStreamRef = useRef(null)

  useEffect(() => {
    if (!tenantId) return
    loadStats()
    const sub = supabase.channel('watchman-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_records', filter: `tenant_id=eq.${tenantId}` }, () => loadStats())
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [tenantId])

  async function loadStats() {
    const today = new Date().toISOString().slice(0, 10)
    const [{ count: parked }, { data: todayRec }] = await Promise.all([
      supabase.from('parking_records').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'PARKED'),
      supabase.from('parking_records').select('status').eq('tenant_id', tenantId).gte('entry_time', today + 'T00:00:00Z')
    ])
    const todayEntries = todayRec?.length ?? 0
    const todayExits = todayRec?.filter(r => r.status === 'EXITED').length ?? 0
    setStats({ parked: parked ?? 0, total: settings?.total_slots ?? 50, todayEntries, todayExits })
  }

  const occupancyPct = Math.round((stats.parked / stats.total) * 100)

  async function handleSignOut() {
    if (stats.parked > 0) {
      setShowSignOutConfirm(true)
    } else {
      await signOut()
    }
  }

  async function startQrScan() {
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
                stopQrScan()
                setPreloadTicket(match[1])
                setView('exit')
              }
            }
          } catch {}
        }, 400)
      } else {
        alert('QR scanner not supported on this browser. Please search manually.')
        stopQrScan()
      }
    } catch {
      alert('Camera not accessible.')
      setScanningQr(false)
    }
  }

  function stopQrScan() {
    qrStreamRef.current?.getTracks().forEach(t => t.stop())
    setScanningQr(false)
  }

  function goHome() { setView('home'); setPreloadTicket(null) }
  // onEntrySuccess does NOT navigate away — EntryForm stays open and resets itself
  function onEntrySuccess() { loadStats() }
  function onExitSuccess() { loadStats() }

  // ── Sign-out confirmation modal (no window.confirm) ─────────────────
  const SignOutModal = () => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#1e293b', borderRadius: 20, padding: 32, maxWidth: 340, width: '100%', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🚪</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Sign Out?</div>
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
          There are <b style={{ color: '#f59e0b' }}>{stats.parked} vehicles</b> still inside.<br />Are you sure?
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setShowSignOutConfirm(false)}
            style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={async () => { setShowSignOutConfirm(false); await signOut() }}
            style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )

  // ── ENTRY / EXIT FORMS ─────────────────────────────────────────────
  if (view === 'entry' || view === 'exit') {
    return (
      <div className="watchman-shell">
        {showSignOutConfirm && <SignOutModal />}

        {/* Compact top bar */}
        <div className="watchman-topbar" style={{ padding: '8px 16px' }}>
          <div className="watchman-brand" style={{ display: 'flex', alignItems: 'center' }}><img src="/logo.png" alt="VBills" style={{ height: 70, objectFit: 'contain', transform: 'scale(2.2)', filter: 'brightness(0) invert(1)' }} /></div>
          <div style={{ flex: 1 }} />
          <button onClick={goHome} style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.8)', borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer'
          }}>🏠 Home</button>
          <button onClick={handleSignOut} style={{
            background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.4)',
            color: '#fca5a5', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>🚪 Sign Out</button>
        </div>

        {/* Big IN/OUT tab switcher */}
        <div style={{ display: 'flex', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setView('entry')}
            style={{
              flex: 1, padding: '16px 0', border: 'none', cursor: 'pointer', fontWeight: 800,
              fontSize: 18, letterSpacing: 0.5, transition: 'all 0.2s',
              background: view === 'entry' ? '#16a34a' : 'transparent',
              color: view === 'entry' ? '#fff' : 'var(--text-muted)',
              borderBottom: view === 'entry' ? '3px solid #22c55e' : '3px solid transparent',
            }}
          >
            ▲ VEHICLE IN
          </button>
          <button
            onClick={() => { setPreloadTicket(null); setView('exit') }}
            style={{
              flex: 1, padding: '16px 0', border: 'none', cursor: 'pointer', fontWeight: 800,
              fontSize: 18, letterSpacing: 0.5, transition: 'all 0.2s',
              background: view === 'exit' ? '#dc2626' : 'transparent',
              color: view === 'exit' ? '#fff' : 'var(--text-muted)',
              borderBottom: view === 'exit' ? '3px solid #ef4444' : '3px solid transparent',
            }}
          >
            ▼ VEHICLE OUT
          </button>
        </div>

        {/* Form body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {view === 'entry'
            ? <EntryForm onBack={goHome} onSuccess={onEntrySuccess} />
            : <ExitForm onBack={goHome} onSuccess={onExitSuccess} preloadTicket={preloadTicket} />
          }
        </div>
      </div>
    )
  }

  // ── HOME SCREEN ────────────────────────────────────────────────────
  return (
    <div className="watchman-shell">
      {showSignOutConfirm && <SignOutModal />}

      {/* Top bar */}
      <div className="watchman-topbar">
        <div className="watchman-brand" style={{ display: 'flex', alignItems: 'center' }}><img src="/logo.png" alt="VBills" style={{ height: 100, objectFit: 'contain', transform: 'scale(2.2)', filter: 'brightness(0) invert(1)' }} /></div>
        <div className="watchman-occupancy-center" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {stats.parked} / {stats.total} slots occupied
            {occupancyPct >= 90 && <span style={{ color: '#fca5a5', marginLeft: 8, fontWeight: 700 }}>⚠️ ALMOST FULL</span>}
          </div>
          <div style={{ width: 160, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${Math.min(occupancyPct, 100)}%`,
              background: occupancyPct >= 90 ? '#ef4444' : occupancyPct >= 70 ? '#f59e0b' : '#22c55e',
              transition: 'width 0.5s'
            }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={startQrScan} title="Scan exit QR" style={{
            background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
            color: '#a5b4fc', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>📷 Scan QR</button>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{profile?.full_name?.split(' ')[0]}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Watchman</div>
          </div>
          <button onClick={handleSignOut} style={{
            background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.4)',
            color: '#fca5a5', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>🚪 Sign Out</button>
        </div>
      </div>

      {/* QR scan overlay */}
      {scanningQr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <div style={{ color: 'white', fontSize: 20, fontWeight: 800 }}>📷 Scan Exit QR Code</div>
          <video ref={qrVideoRef} style={{ width: '90%', maxWidth: 400, borderRadius: 16, border: '3px solid #6366f1' }} autoPlay playsInline muted />
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Point camera at the QR on the entry slip</div>
          <button style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }} onClick={stopQrScan}>✕ Cancel</button>
        </div>
      )}

      {/* HUGE two-button home — solid colors */}
      <div className="watchman-home">
        {/* VEHICLE IN — solid green */}
        <button
          className="watchman-half entry"
          onClick={() => setView('entry')}
          style={{
            background: 'linear-gradient(to bottom, #115e59, #10b981)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
            position: 'relative', border: 'none', cursor: 'pointer', overflow: 'hidden'
          }}
        >
          <div className="watchman-half-count" style={{
            position: 'absolute', top: 24, right: 24,
            background: 'rgba(0,0,0,0.4)', borderRadius: 99, padding: '8px 20px',
            fontSize: 14, fontWeight: 700, color: 'white', letterSpacing: 0.5
          }}>
            Today: {stats.todayEntries} IN
          </div>
          <div className="watchman-half-icon" style={{
            width: 90, height: 90, borderRadius: '50%', background: '#84cc16',
            boxShadow: 'inset -8px -8px 20px rgba(0,0,0,0.3), inset 8px 8px 20px rgba(255,255,255,0.4), 0 10px 20px rgba(0,0,0,0.2)'
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div className="watchman-half-label" style={{ fontSize: 36, fontWeight: 900, letterSpacing: 1, color: 'white' }}>VEHICLE IN</div>
            <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)' }}>Register a vehicle entering</div>
          </div>
        </button>

        {/* VEHICLE OUT — solid red */}
        <button
          className="watchman-half exit"
          onClick={() => setView('exit')}
          style={{
            background: 'linear-gradient(to bottom, #7f1d1d, #ef4444)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
            position: 'relative', border: 'none', cursor: 'pointer', overflow: 'hidden'
          }}
        >
          <div className="watchman-half-count" style={{
            position: 'absolute', top: 24, right: 24,
            background: 'rgba(0,0,0,0.4)', borderRadius: 99, padding: '8px 20px',
            fontSize: 14, fontWeight: 700, color: 'white', letterSpacing: 0.5
          }}>
            Today: {stats.todayExits} OUT
          </div>
          <div className="watchman-half-icon" style={{
            width: 90, height: 90, borderRadius: '50%', background: '#ef4444',
            boxShadow: 'inset -8px -8px 20px rgba(0,0,0,0.3), inset 8px 8px 20px rgba(255,255,255,0.4), 0 10px 20px rgba(0,0,0,0.2)'
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div className="watchman-half-label" style={{ fontSize: 36, fontWeight: 900, letterSpacing: 1, color: 'white' }}>VEHICLE OUT</div>
            <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)' }}>Checkout & collect payment</div>
          </div>
        </button>
      </div>
    </div>
  )
}
