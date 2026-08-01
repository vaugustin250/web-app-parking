import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export default function Reports() {
  const { tenantId, settings } = useAuth()
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState([])
  const [summary, setSummary] = useState({ revenue: 0, entries: 0, exits: 0, avgFee: 0 })
  const [typeBreakdown, setTypeBreakdown] = useState([])
  const [payBreakdown, setPayBreakdown] = useState([])
  const [loading, setLoading] = useState(false)
  const currency = settings?.currency_symbol ?? '₹'

  useEffect(() => { if (tenantId) run() }, [tenantId, from, to])

  async function run() {
    setLoading(true)
    try {
      const res = await api.get(`/api/reports/daily?from=${from}&to=${to}`)
      const { data: rows, summary: sums } = res.data
      
      const daily = rows.map(d => ({
        date: d.date,
        label: new Date(d.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        entries: parseInt(d.entries) || 0,
        exits: parseInt(d.exits) || 0,
        revenue: Math.round(parseFloat(d.revenue) || 0),
        twoWheelers: parseInt(d.two_wheelers) || 0,
        fourWheelers: parseInt(d.four_wheelers) || 0,
        cash: parseFloat(d.cash) || 0,
        upi: parseFloat(d.upi) || 0
      }))
      setData(daily)

      const totalRev = sums.totalRevenue || 0
      const totalExits = sums.totalExits || 0
      setSummary({ 
        revenue: totalRev, 
        entries: sums.totalEntries || 0, 
        exits: totalExits, 
        avgFee: totalExits ? totalRev / totalExits : 0 
      })

      setTypeBreakdown([
        { name: '2-Wheeler', value: sums.twoWheelers || 0 },
        { name: '4-Wheeler', value: sums.fourWheelers || 0 }
      ].filter(x => x.value > 0))

      setPayBreakdown([
        { name: 'Cash', value: Math.round(sums.totalCash || 0) },
        { name: 'UPI', value: Math.round(sums.totalUpi || 0) }
      ].filter(x => x.value > 0))

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4']

  async function exportToExcel() {
    const wsData = [
      ['Date', 'Entries', 'Exits', 'Revenue', '2-Wheelers', '4-Wheelers', 'Cash', 'UPI'],
      ...data.map(d => [
        d.date, d.entries, d.exits, d.revenue, 
        d.twoWheelers || 0, d.fourWheelers || 0, 
        d.cash || 0, d.upi || 0
      ])
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Analytics")
    XLSX.writeFile(wb, `Parking_Analytics_${from}_to_${to}.xlsx`)
  }

  async function exportToPDF() {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('Parking Analytics Report', 14, 22)
    doc.setFontSize(11)
    doc.text(`Date Range: ${from} to ${to}`, 14, 30)

    const tableData = data.map(d => [
      d.label,
      d.entries.toString(),
      d.exits.toString(),
      d.revenue.toString(),
      (d.twoWheelers || 0).toString(),
      (d.fourWheelers || 0).toString(),
      (d.cash || 0).toString(),
      (d.upi || 0).toString()
    ])

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Entries', 'Exits', 'Revenue (Rs)', '2-W', '4-W', 'Cash', 'UPI']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [99, 102, 241] }
    })
    
    doc.save(`Parking_Analytics_${from}_to_${to}.pdf`)
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">📈 Reports & Analytics</div>
          <div className="topbar-sub">Revenue and traffic analysis</div>
        </div>
        <div className="topbar-spacer" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={exportToExcel} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>📊</span> Excel
          </button>
          <button className="btn btn-primary btn-sm" onClick={exportToPDF} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>📄</span> PDF
          </button>
        </div>
      </div>

      <div className="page-content">
        {/* Date range */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 600 }}>Date Range:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="date" className="form-input" style={{ width: 160 }} value={from} onChange={e => setFrom(e.target.value)} />
              <span style={{ color: 'var(--text-muted)' }}>to</span>
              <input type="date" className="form-input" style={{ width: 160 }} value={to} onChange={e => setTo(e.target.value)} />
            </div>
            {[
              { label: 'Today', days: 0 },
              { label: 'Last 7 days', days: 7 },
              { label: 'Last 30 days', days: 30 },
            ].map(q => (
              <button key={q.label} className="btn btn-secondary btn-sm" onClick={() => {
                setTo(new Date().toISOString().slice(0, 10))
                setFrom(new Date(Date.now() - q.days * 86400000).toISOString().slice(0, 10))
              }}>{q.label}</button>
            ))}
          </div>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div> : (
          <>
            {/* Summary cards */}
            <div className="grid-4" style={{ marginBottom: 24 }}>
              {[
                { label: 'Total Revenue', value: `${currency}${summary.revenue.toFixed(0)}`, icon: '💰', color: '#10b981' },
                { label: 'Total Entries', value: summary.entries, icon: '🚗', color: '#6366f1' },
                { label: 'Total Exits', value: summary.exits, icon: '🏁', color: '#f59e0b' },
                { label: 'Avg Fee / Vehicle', value: `${currency}${summary.avgFee.toFixed(0)}`, icon: '📊', color: '#06b6d4' },
              ].map(c => (
                <div key={c.label} className="stat-card">
                  <div className="stat-card-icon" style={{ background: c.color + '22', color: c.color }}>{c.icon}</div>
                  <div className="stat-card-body">
                    <div className="stat-card-value">{c.value}</div>
                    <div className="stat-card-label">{c.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Daily Revenue Chart */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Daily Revenue</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6060a0' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6060a0' }} />
                  <Tooltip contentStyle={{ background: '#15152e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f0ff' }} formatter={(v) => [`${currency}${v}`, 'Revenue']} />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid-2" style={{ marginBottom: 20 }}>
              {/* Vehicle type pie */}
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>By Vehicle Type</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={typeBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {typeBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#15152e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f0ff' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Payment mode pie */}
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>By Payment Method</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={payBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {payBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#15152e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f0ff' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Detailed Analytics Data Table */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Detailed Daily Analytics</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 8px' }}>Date</th>
                      <th style={{ padding: '12px 8px' }}>Entries</th>
                      <th style={{ padding: '12px 8px' }}>Exits</th>
                      <th style={{ padding: '12px 8px' }}>Revenue</th>
                      <th style={{ padding: '12px 8px' }}>2-Wheelers</th>
                      <th style={{ padding: '12px 8px' }}>4-Wheelers</th>
                      <th style={{ padding: '12px 8px' }}>Cash</th>
                      <th style={{ padding: '12px 8px' }}>UPI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 ? (
                      <tr><td colSpan="8" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No data for this date range</td></tr>
                    ) : data.map((d, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 8px', fontWeight: 600 }}>{d.label}</td>
                        <td style={{ padding: '12px 8px' }}>{d.entries}</td>
                        <td style={{ padding: '12px 8px' }}>{d.exits}</td>
                        <td style={{ padding: '12px 8px', color: '#10b981', fontWeight: 700 }}>{currency}{d.revenue}</td>
                        <td style={{ padding: '12px 8px' }}>{d.twoWheelers || 0}</td>
                        <td style={{ padding: '12px 8px' }}>{d.fourWheelers || 0}</td>
                        <td style={{ padding: '12px 8px' }}>{d.cash || 0}</td>
                        <td style={{ padding: '12px 8px' }}>{d.upi || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
