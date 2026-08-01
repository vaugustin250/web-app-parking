import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ background: color + '22', color }}>{icon}</div>
      <div className="stat-card-body">
        <div className="stat-card-value">{value}</div>
        <div className="stat-card-label">{label}</div>
        {sub && <div className="stat-card-sub">{sub}</div>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { tenantId, settings } = useAuth()
  const [stats, setStats] = useState({ parked: 0, total: 50, todayRevenue: 0, todayEntries: 0, weekData: [] })
  const [currentlyParked, setCurrentlyParked] = useState([])
  const [overnight, setOvernight] = useState([])
  const [loading, setLoading] = useState(true)
  const currency = settings?.currency_symbol ?? '₹'

  useEffect(() => {
    if (!tenantId) return
    loadDashboard()
    const interval = setInterval(loadDashboard, 30000) // Poll every 30s instead of websockets
    return () => clearInterval(interval)
  }, [tenantId])

  async function loadDashboard() {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const overnightThreshold = new Date(Date.now() - 12 * 60 * 60 * 1000).getTime()

      const [activeRes, reportRes] = await Promise.all([
        api.get('/api/parking/active'),
        api.get(`/api/reports/daily?from=${sevenDaysAgo}&to=${today}`)
      ])

      const parkedList = activeRes.data.records || []
      const parked = parkedList.length
      const weekDataRaw = reportRes.data.data || []
      
      const todayData = weekDataRaw.find(d => d.date.startsWith(today)) || { revenue: 0, entries: 0 }
      const todayRevenue = Math.round(parseFloat(todayData.revenue) || 0)
      const todayEntries = parseInt(todayData.entries) || 0

      const weekData = weekDataRaw.map(d => ({
        date: new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
        revenue: Math.round(parseFloat(d.revenue) || 0),
        entries: parseInt(d.entries) || 0
      }))

      const overnightVehicles = parkedList.filter(r => new Date(r.entry_time).getTime() < overnightThreshold)

      setStats({ parked, total: settings?.total_slots ?? 50, todayRevenue, todayEntries, weekData })
      setCurrentlyParked(parkedList)
      setOvernight(overnightVehicles)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const available = stats.total - stats.parked
  const occupancyPct = Math.round((stats.parked / stats.total) * 100)
  const occupancyClass = occupancyPct >= 90 ? 'high' : occupancyPct >= 70 ? 'medium' : 'low'

  if (loading) return <div className="loading-screen"><div className="spinner" /><span>Loading dashboard...</span></div>

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Dashboard</div>
          <div className="topbar-sub">Live overview · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </div>
      </div>

      <div className="page-content">
        {/* Overnight alert */}
        {overnight.length > 0 && (
          <div className="alert alert-danger" style={{ marginBottom: 20 }}>
            ⚠️ <strong>{overnight.length} vehicle(s)</strong> have been parked for over 12 hours:&nbsp;
            {overnight.map(v => v.vehicle_number).join(', ')}
          </div>
        )}

        {/* Capacity warning */}
        {occupancyPct >= 90 && (
          <div className={`alert ${occupancyPct >= 100 ? 'alert-danger' : 'alert-warning'}`} style={{ marginBottom: 20 }}>
            {occupancyPct >= 100 ? '🔴 Parking is FULL!' : `⚠️ Parking is ${occupancyPct}% full. Only ${available} slots remaining!`}
          </div>
        )}

        {/* Stat cards */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          <StatCard icon="🅿️" label="Currently Parked" value={stats.parked} sub={`${available} slots free`} color="#6366f1" />
          <StatCard icon="💰" label="Today's Revenue" value={`${currency}${stats.todayRevenue.toFixed(0)}`} sub="Collected today" color="#10b981" />
          <StatCard icon="🚗" label="Today's Entries" value={stats.todayEntries} sub="vehicles registered" color="#f59e0b" />
          <StatCard icon="📊" label="Occupancy" value={`${occupancyPct}%`} sub={`${stats.total} total slots`} color="#06b6d4" />
        </div>

        {/* Occupancy bar */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Slot Occupancy</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{stats.parked} / {stats.total}</div>
          </div>
          <div className="occupancy-bar-wrap" style={{ height: 16 }}>
            <div className={`occupancy-bar ${occupancyClass}`} style={{ width: `${Math.min(occupancyPct, 100)}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--success)' }}>●  {available} Free</span>
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>●  {stats.parked} Occupied</span>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 24 }}>
          {/* Revenue Chart */}
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Revenue — Last 7 Days</div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={stats.weekData}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6060a0' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6060a0' }} />
                <Tooltip contentStyle={{ background: '#15152e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f0ff' }} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2} name="Revenue (₹)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Traffic Chart */}
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Entries — Last 7 Days</div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={stats.weekData}>
                <defs>
                  <linearGradient id="entGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6060a0' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6060a0' }} />
                <Tooltip contentStyle={{ background: '#15152e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f0ff' }} />
                <Area type="monotone" dataKey="entries" stroke="#10b981" fill="url(#entGrad)" strokeWidth={2} name="Vehicles" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Currently Parked Table */}
        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Currently Parked Vehicles</div>
          {currentlyParked.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>No vehicles parked right now</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ticket</th><th>Vehicle</th><th>Type</th><th>Slot</th><th>Entry Time</th><th>Duration</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {currentlyParked.map(r => {
                    const mins = Math.floor((Date.now() - new Date(r.entry_time)) / 60000)
                    const h = Math.floor(mins / 60), m = mins % 60
                    const isOvernight = mins > 720
                    return (
                      <tr key={r.id}>
                        <td className="font-mono" style={{ fontSize: 13 }}>{r.ticket_no}</td>
                        <td style={{ fontWeight: 700 }}>{r.vehicle_number}</td>
                        <td>{r.vehicle_type}</td>
                        <td>{r.slot_no || '—'}</td>
                        <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(r.entry_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                        <td style={{ color: isOvernight ? 'var(--danger)' : 'var(--text-primary)' }}>
                          {h > 0 ? `${h}h ${m}m` : `${m}m`}
                          {isOvernight && ' ⚠️'}
                        </td>
                        <td><span className={`badge ${isOvernight ? 'badge-overnight' : 'badge-parked'}`}>● {isOvernight ? 'OVERNIGHT' : 'PARKED'}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
