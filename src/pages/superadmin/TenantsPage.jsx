import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const STATUS_COLORS = {
  ACTIVE: { bg: '#d1fae5', color: '#059669', label: 'Active' },
  TRIAL: { bg: '#fef3c7', color: '#d97706', label: 'Trial' },
  SUSPENDED: { bg: '#fee2e2', color: '#dc2626', label: 'Suspended' },
  EXPIRED: { bg: '#f1f5f9', color: '#64748b', label: 'Expired' },
}

export default function TenantsPage() {
  const navigate = useNavigate()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [timeFilter, setTimeFilter] = useState('Total')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [signupTrend, setSignupTrend] = useState([])
  const [totalStaffCount, setTotalStaffCount] = useState(0)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [
      { data: tenantsData, error: tenantErr },
      { data: staffData },
    ] = await Promise.all([
      supabase.from('tenants').select('*, settings(company_name, total_slots)').order('created_at', { ascending: false }),
      supabase.from('users').select('id, created_at'),
    ])

    if (tenantErr) { console.error('Tenants load error:', tenantErr.message); setLoading(false); return }
    if (!tenantsData) { setLoading(false); return }
    setTenants(tenantsData)
    setTotalStaffCount(staffData?.length ?? 0)

    // Build signup trend (last 12 months)
    const trend = {}
    tenantsData.forEach(t => {
      const m = t.created_at?.slice(0, 7); if (!m) return
      trend[m] = (trend[m] || 0) + 1
    })
    const months = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const key = d.toISOString().slice(0, 7)
      months.push({ month: d.toLocaleString('default', { month: 'short', year: '2-digit' }), companies: trend[key] || 0 })
    }
    setSignupTrend(months)
    setLoading(false)
  }

  async function updateStatus(tenantId, status) {
    await supabase.from('tenants').update({ license_status: status }).eq('id', tenantId)
    load()
  }

  async function toggleFeature(tenantId, feature, currentVal) {
    await supabase.from('tenants').update({ [feature]: !currentVal }).eq('id', tenantId)
    load()
  }

  const filteredByTime = tenants.filter(t => {
    if (timeFilter === 'Total') return true
    const d = new Date(t.created_at)
    const now = new Date()
    if (timeFilter === 'This Month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    if (timeFilter === 'Last Month') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear()
    }
    if (timeFilter === 'This Year') return d.getFullYear() === now.getFullYear()
    if (timeFilter === 'Last Year') return d.getFullYear() === now.getFullYear() - 1
    return true
  })

  const active = filteredByTime.filter(t => t.license_status === 'ACTIVE').length
  const trial = filteredByTime.filter(t => t.license_status === 'TRIAL').length
  const suspended = filteredByTime.filter(t => t.license_status === 'SUSPENDED').length
  const expiredSoon = filteredByTime.filter(t => {
    if (!t.renewal_end) return false
    const diffDays = (new Date(t.renewal_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diffDays <= 30 && t.license_status !== 'EXPIRED'
  }).length

  const filtered = filteredByTime.filter(t => {
    const name = (t.settings?.company_name ?? t.business_name ?? '').toLowerCase()
    const q = search.toLowerCase()
    const matchSearch = !q || name.includes(q) || (t.email ?? '').toLowerCase().includes(q)
    const matchStatus = statusFilter === 'ALL' || t.license_status === statusFilter
    return matchSearch && matchStatus
  })

  function downloadPDF() {
    const doc = new jsPDF()
    doc.setFontSize(20)
    doc.text('VBills Business Details Report', 14, 22)
    doc.setFontSize(11)
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30)

    const tableData = filtered.map(t => [
      t.settings?.company_name ?? t.business_name ?? '-',
      t.license_status ?? '-',
      t.email ?? '-',
      t.phone ?? '-',
      t.city ? `${t.city}, ${t.state}` : '-',
      new Date(t.created_at).toLocaleDateString()
    ])

    autoTable(doc, {
      startY: 40,
      head: [['Company', 'Status', 'Email', 'Phone', 'Location', 'Since']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    })

    doc.save(`vbills_businesses_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  function downloadExcel() {
    const tableData = filtered.map(t => ({
      'Company Name': t.settings?.company_name ?? t.business_name,
      'Status': t.license_status,
      'Email': t.email,
      'Phone': t.phone,
      'Owner Name': t.owner_name,
      'City': t.city,
      'State': t.state,
      'Registered On': new Date(t.created_at).toLocaleString(),
      'ANPR Enabled': t.feature_anpr ? 'Yes' : 'No',
      'QR Payment': t.feature_qr ? 'Yes' : 'No'
    }))

    const ws = XLSX.utils.json_to_sheet(tableData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Businesses")
    XLSX.writeFile(wb, `vbills_businesses_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">🌐 VBills Overview</div>
          <div className="topbar-sub">Product-level dashboard — {filteredByTime.length} businesses on platform</div>
        </div>
        <div className="topbar-spacer" />
        <button className="btn btn-primary" onClick={() => navigate('/superadmin/add-company')}>
          ➕ Add Company
        </button>
      </div>

      <div className="page-content">
        {/* KPI Cards */}
        <div className="grid-5" style={{ marginBottom: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px' }}>
          <div className="card" style={{ borderTop: '3px solid var(--brand-primary)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Customer <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>| {timeFilter}</span>
              </div>
              <button 
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: '0 4px' }}
              >
                ⋮
              </button>
            </div>
            
            {showFilterMenu && (
              <div style={{ position: 'absolute', top: 40, right: 16, background: '#fff', border: '1px solid var(--border-color)', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 10, minWidth: 150, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)' }}>Filter</div>
                {['Total', 'This Month', 'Last Month', 'This Year', 'Last Year'].map(opt => (
                  <button key={opt} 
                    onClick={() => { setTimeFilter(opt); setShowFilterMenu(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: timeFilter === opt ? 'rgba(99,102,241,0.08)' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: timeFilter === opt ? 'var(--brand-primary)' : 'var(--text-primary)', fontWeight: timeFilter === opt ? 700 : 500 }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                👥
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-primary)' }}>{filteredByTime.length}</div>
            </div>
          </div>

          <div className="card" style={{ borderTop: '3px solid #10b981' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Active</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#10b981' }}>
                🏃
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-primary)' }}>{active}</div>
            </div>
          </div>

          <div className="card" style={{ borderTop: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Trial</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#f59e0b' }}>
                👤
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-primary)' }}>{trial}</div>
            </div>
          </div>
          
          <div className="card" style={{ borderTop: '3px solid #ef4444' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Renewal Expired Soon</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#ef4444' }}>
                ⏳
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-primary)' }}>{expiredSoon}</div>
            </div>
          </div>
        </div>

        {/* Signup trend chart */}
        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>📈 Company Signups — Last 12 Months</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={signupTrend}>
              <defs>
                <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
              <Area type="monotone" dataKey="companies" stroke="#6366f1" fill="url(#signupGrad)" strokeWidth={2} name="New Companies" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Companies table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Table header + filters */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>🏢 Companies</div>
            <input
              className="form-input" style={{ width: 200, padding: '8px 12px', fontSize: 13 }}
              placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={downloadPDF} className="btn btn-sm btn-secondary" style={{ background: '#ef4444', color: 'white', border: 'none' }}>📄 PDF</button>
              <button onClick={downloadExcel} className="btn btn-sm btn-secondary" style={{ background: '#10b981', color: 'white', border: 'none' }}>📊 Excel</button>
              <div style={{ width: 1, background: 'var(--border-color)', margin: '0 8px' }} />
              {['ALL', 'ACTIVE', 'TRIAL', 'SUSPENDED'].map(s => (
                <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFilter(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>No companies found</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {['Company', 'Status', 'Since', 'Features', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const sc = STATUS_COLORS[t.license_status] ?? STATUS_COLORS.TRIAL
                    const name = t.settings?.company_name ?? t.business_name
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--brand-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: 'white', flexShrink: 0 }}>
                              {name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                                {t.email && <span>📧 {t.email}</span>}
                                {t.phone && <span>📞 {t.phone}</span>}
                                {t.address && <span>📍 {t.address}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                            {sc.label}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                          {new Date(t.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {/* Passes toggle */}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); toggleFeature(t.id, 'feature_passes_allowed', t.feature_passes_allowed) }}
                              title="Toggle Parking Passes feature"
                              style={{
                                fontSize: 11, padding: '2px 8px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700,
                                background: t.feature_passes_allowed ? '#d1fae5' : 'var(--border-color)',
                                color: t.feature_passes_allowed ? '#059669' : 'var(--text-muted)'
                              }}>
                              🎫 {t.feature_passes_allowed ? 'Passes ON' : 'Passes OFF'}
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); navigate(`/superadmin/company/${t.id}`) }}>
                              View
                            </button>
                            <select
                              className="form-select" style={{ padding: '4px 8px', fontSize: 12 }}
                              value={t.license_status}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { e.stopPropagation(); updateStatus(t.id, e.target.value) }}
                            >
                              <option value="TRIAL">Trial</option>
                              <option value="ACTIVE">Active</option>
                              <option value="SUSPENDED">Suspended</option>
                              <option value="EXPIRED">Expired</option>
                            </select>
                          </div>
                        </td>
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
