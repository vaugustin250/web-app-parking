import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'

export default function Records() {
  const { tenantId, settings } = useAuth()
  const [records, setRecords] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL') // ALL | PARKED | EXITED
  const [loading, setLoading] = useState(true)
  const currency = settings?.currency_symbol ?? '₹'

  useEffect(() => { if (tenantId) load() }, [tenantId, filter])

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/api/reports/records?limit=200')
      let recs = data.records || []
      // Dynamically correct status for older records that missed the DB update
      recs = recs.map(r => ({ ...r, status: r.exit_time ? 'EXITED' : 'PARKED' }))
      if (filter !== 'ALL') recs = recs.filter(r => r.status === filter)
      setRecords(recs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = records.filter(r =>
    !search || r.vehicle_number?.toUpperCase().includes(search.toUpperCase()) ||
    r.ticket_no?.includes(search) || r.driver_name?.toLowerCase().includes(search.toLowerCase())
  )

  function fmtTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
  }

  async function exportCsv() {
    const rows = [
      ['Ticket', 'Vehicle', 'Type', 'Driver', 'Slot', 'Entry', 'Exit', 'Duration (min)', 'Amount', 'Payment', 'Status'],
      ...filtered.map(r => [r.ticket_no, r.vehicle_number, r.vehicle_type, r.driver_name ?? '', r.slot_no ?? '', fmtTime(r.entry_time), fmtTime(r.exit_time), r.duration_minutes ?? '', r.amount_charged ?? 0, r.payment_mode ?? '', r.status])
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `parking-records-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">🚗 Parking Records</div>
          <div className="topbar-sub">{filtered.length} records</div>
        </div>
        <div className="topbar-spacer" />
        <button className="btn btn-secondary btn-sm" onClick={exportCsv}>📥 Export CSV</button>
      </div>

      <div className="page-content">
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <input className="form-input" style={{ flex: 1 }} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search by vehicle number, ticket, or driver name..." />
          {['ALL', 'PARKED', 'EXITED'].map(f => (
            <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th><th>Vehicle</th><th>Type</th><th>Slot</th>
                  <th>Entry</th><th>Exit</th><th>Duration</th><th>Amount</th><th>Payment</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No records found</td></tr>
                ) : filtered.map(r => {
                  const isOvernight = r.status === 'PARKED' && (Date.now() - new Date(r.entry_time)) > 12 * 60 * 60 * 1000
                  return (
                    <tr key={r.id} style={isOvernight ? { background: 'rgba(239,68,68,0.05)' } : {}}>
                      <td className="font-mono" style={{ fontSize: 12 }}>{r.ticket_no}</td>
                      <td style={{ fontWeight: 700 }}>{r.vehicle_number}</td>
                      <td style={{ fontSize: 13 }}>{r.vehicle_type}</td>
                      <td>{r.slot_no || '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtTime(r.entry_time)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtTime(r.exit_time)}</td>
                      <td>{r.duration_minutes ? `${Math.floor(r.duration_minutes / 60)}h ${r.duration_minutes % 60}m` : '—'}</td>
                      <td style={{ fontWeight: 700, color: r.amount_charged > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                        {r.amount_charged > 0 ? `${currency}${r.amount_charged.toFixed(2)}` : '—'}
                      </td>
                      <td>{r.payment_mode ?? '—'}</td>
                      <td>
                        <span className={`badge ${isOvernight ? 'badge-overnight' : r.status === 'PARKED' ? 'badge-parked' : 'badge-exited'}`}>
                          {isOvernight ? '⚠️ OVERNIGHT' : r.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
