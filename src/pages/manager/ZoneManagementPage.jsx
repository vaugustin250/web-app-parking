import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const ZONE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6']
const COL_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// Generate slot label: row 0 col 0 → A-1, row 1 col 3 → B-4
function slotLabel(row, col) { return `${COL_LABELS[row]}-${col + 1}` }

// ── Zone Form Modal ───────────────────────────────────────────────────
function ZoneModal({ zone, onSave, onClose }) {
  const [form, setForm] = useState(zone || {
    zone_name: '', total_slots: 20, color: '#6366f1', description: '',
    slot_diagram_enabled: false, rows_count: 4, cols_count: 5, active: true
  })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save(e) {
    if (e && e.preventDefault) e.preventDefault()
    if (!form.zone_name.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const totalFromGrid = form.slot_diagram_enabled ? form.rows_count * form.cols_count : form.total_slots

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 28, maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border-color)' }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 20 }}>{zone?.id ? '✏️ Edit Zone' : '➕ Add Zone'}</div>

        <div className="form-group">
          <label className="form-label">Zone Name *</label>
          <input className="form-input" value={form.zone_name} onChange={e => f('zone_name', e.target.value)} placeholder="e.g. VIP Parking, Basement A, Rooftop" autoFocus />
        </div>

        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description || ''} onChange={e => f('description', e.target.value)} placeholder="Optional details" />
        </div>

        {/* Color picker */}
        <div className="form-group">
          <label className="form-label">Zone Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ZONE_COLORS.map(c => (
              <button key={c} type="button" onClick={() => f('color', c)}
                style={{ width: 32, height: 32, borderRadius: 8, background: c, border: form.color === c ? '3px solid white' : '2px solid transparent', cursor: 'pointer', outline: form.color === c ? `3px solid ${c}` : 'none' }} />
            ))}
          </div>
        </div>

        {/* Slot diagram toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>📐 Slot Diagram</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Show visual grid — slots auto-assigned on entry</div>
          </div>
          <button type="button" onClick={() => f('slot_diagram_enabled', !form.slot_diagram_enabled)}
            style={{ width: 52, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.slot_diagram_enabled ? '#6366f1' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 3, left: form.slot_diagram_enabled ? 26 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>

        {form.slot_diagram_enabled ? (
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Rows (A, B, C…)</label>
              <input className="form-input" type="number" min={1} max={10} value={form.rows_count} onChange={e => f('rows_count', parseInt(e.target.value) || 1)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Columns per row</label>
              <input className="form-input" type="number" min={1} max={20} value={form.cols_count} onChange={e => f('cols_count', parseInt(e.target.value) || 1)} />
            </div>
            <div style={{ gridColumn: '1/-1', fontSize: 13, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 12px' }}>
              Total: <b>{totalFromGrid} slots</b> ({form.rows_count} rows × {form.cols_count} cols = {COL_LABELS[0]}1…{COL_LABELS[Math.min(form.rows_count - 1, 25)]}{form.cols_count})
            </div>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Total Slots *</label>
            <input className="form-input" type="number" min={1} value={form.total_slots} onChange={e => f('total_slots', parseInt(e.target.value) || 1)} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
          <button type="button" onClick={save} className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
            {saving ? '⏳ Saving...' : zone?.id ? '💾 Update Zone' : '➕ Create Zone'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Visual slot diagram for a zone ────────────────────────────────────
function SlotDiagram({ zone, occupiedSlots }) {
  const rows = zone.rows_count || 4
  const cols = zone.cols_count || 5
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(slotLabel(r, c))
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Slot Map</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
        {cells.map(label => {
          const occupied = occupiedSlots.includes(label)
          return (
            <div key={label} style={{
              padding: '5px 2px', textAlign: 'center', fontSize: 10, fontWeight: 700,
              borderRadius: 6, border: `1.5px solid ${occupied ? '#fca5a5' : '#bbf7d0'}`,
              background: occupied ? '#fee2e2' : '#d1fae5',
              color: occupied ? '#dc2626' : '#065f46',
              cursor: 'default'
            }}>
              {label}
              <div style={{ fontSize: 8, fontWeight: 400, color: occupied ? '#ef4444' : '#34d399' }}>
                {occupied ? '●' : '○'}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        <span style={{ fontSize: 11, color: '#34d399' }}>○ Free</span>
        <span style={{ fontSize: 11, color: '#ef4444' }}>● Occupied</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
export default function ZoneManagementPage() {
  const { tenantId, tenantData, settings, refreshSettings } = useAuth()
  const [zones, setZones] = useState([])
  const [occupancy, setOccupancy] = useState({}) // { zoneId: { count, slots: ['A-1', 'B-2'] } }
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editZone, setEditZone] = useState(null)
  const [expandedZone, setExpandedZone] = useState(null)
  const [zonesEnabled, setZonesEnabled] = useState(settings?.zones_enabled ?? false)
  const [toggling, setToggling] = useState(false)

  const zonesAllowed = tenantData?.feature_zones_allowed ?? false

  useEffect(() => { if (tenantId) load() }, [tenantId])
  useEffect(() => { setZonesEnabled(settings?.zones_enabled ?? false) }, [settings])

  async function load() {
    setLoading(true)
    const { data: zonesData } = await supabase.from('parking_zones').select('*').eq('tenant_id', tenantId).order('zone_order')
    setZones(zonesData ?? [])

    // Load occupancy per zone
    const occ = {}
    for (const z of (zonesData ?? [])) {
      const { data: parked } = await supabase.from('parking_records').select('slot_no').eq('tenant_id', tenantId).eq('zone_id', z.id).eq('status', 'PARKED')
      occ[z.id] = { count: parked?.length ?? 0, slots: parked?.map(p => p.slot_no).filter(Boolean) ?? [] }
    }
    setOccupancy(occ)
    setLoading(false)
  }

  async function toggleZonesEnabled() {
    setToggling(true)
    const newVal = !zonesEnabled
    await supabase.from('settings').upsert({ tenant_id: tenantId, zones_enabled: newVal }, { onConflict: 'tenant_id' })
    setZonesEnabled(newVal)
    await refreshSettings()
    setToggling(false)
  }

  async function handleSaveZone(form) {
    try {
      const totalSlots = form.slot_diagram_enabled ? form.rows_count * form.cols_count : form.total_slots
      const payload = {
        tenant_id: tenantId,
        zone_name: form.zone_name,
        total_slots: totalSlots,
        color: form.color,
        description: form.description || null,
        slot_diagram_enabled: form.slot_diagram_enabled,
        rows_count: form.rows_count,
        cols_count: form.cols_count,
        active: form.active ?? true,
        zone_order: form.zone_order ?? zones.length,
      }
      
      let dbError = null
      if (form.id) {
        const { error } = await supabase.from('parking_zones').update(payload).eq('id', form.id)
        dbError = error
      } else {
        const { error } = await supabase.from('parking_zones').insert(payload)
        dbError = error
      }
      
      if (dbError) {
        alert('Database Error saving zone: ' + dbError.message)
        return
      }

      setShowModal(false)
      setEditZone(null)
      await load()
    } catch (err) {
      alert('Application Error saving zone: ' + err.message)
    }
  }

  async function toggleActive(zone) {
    await supabase.from('parking_zones').update({ active: !zone.active }).eq('id', zone.id)
    await load()
  }

  async function deleteZone(zone) {
    const occ = occupancy[zone.id]?.count ?? 0
    if (occ > 0) { alert(`Cannot delete zone "${zone.zone_name}" — ${occ} vehicles currently parked inside.`); return }
    await supabase.from('parking_zones').delete().eq('id', zone.id)
    await load()
  }

  if (!zonesAllowed) {
    return (
      <>
        <div className="topbar">
          <div><div className="topbar-title">📍 Zone Management</div></div>
        </div>
        <div className="page-content">
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Zone Management Not Enabled</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Contact your Super Admin to enable Zone Management for your account.</div>
          </div>
        </div>
      </>
    )
  }

  const totalSlots = zones.reduce((s, z) => s + z.total_slots, 0)
  const totalOccupied = zones.reduce((s, z) => s + (occupancy[z.id]?.count ?? 0), 0)

  return (
    <>
      {(showModal || editZone) && (
        <ZoneModal
          zone={editZone}
          onSave={handleSaveZone}
          onClose={() => { setShowModal(false); setEditZone(null) }}
        />
      )}

      <div className="topbar">
        <div>
          <div className="topbar-title">📍 Zone Management</div>
          <div className="topbar-sub">Define parking zones, slot diagrams, and capacity</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Master zones on/off toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Zones {zonesEnabled ? 'ON' : 'OFF'}</span>
            <button type="button" onClick={toggleZonesEnabled} disabled={toggling}
              style={{ width: 52, height: 28, borderRadius: 99, border: 'none', cursor: 'pointer', background: zonesEnabled ? '#22c55e' : 'var(--border-color)', position: 'relative', transition: 'background 0.2s' }}>
              <span style={{ position: 'absolute', top: 3, left: zonesEnabled ? 26 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', transition: 'left 0.2s', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => { setEditZone(null); setShowModal(true) }}>+ Add Zone</button>
        </div>
      </div>

      <div className="page-content">
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Zones', value: zones.length, icon: '📍' },
            { label: 'Total Slots', value: totalSlots, icon: '🅿️' },
            { label: 'Occupied', value: totalOccupied, icon: '🔴' },
            { label: 'Available', value: totalSlots - totalOccupied, icon: '🟢' },
          ].map(({ label, value, icon }) => (
            <div key={label} className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28 }}>{icon}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-primary)' }}>{value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>

        {!zonesEnabled && (
          <div className="alert" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid #f59e0b', color: '#f59e0b', marginBottom: 20 }}>
            ⚠️ Zones are currently <b>disabled</b>. Toggle "Zones ON" above to activate zone selection in the watchman entry form.
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : zones.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📍</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No zones yet</div>
            <div style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Create zones to divide your parking lot (e.g. Basement, Rooftop, VIP)</div>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Create First Zone</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {zones.map(zone => {
              const occ = occupancy[zone.id] ?? { count: 0, slots: [] }
              const pct = zone.total_slots > 0 ? Math.round((occ.count / zone.total_slots) * 100) : 0
              const free = zone.total_slots - occ.count
              const barColor = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#22c55e'
              const isExpanded = expandedZone === zone.id

              return (
                <div key={zone.id} className="card" style={{ border: `2px solid ${zone.active ? zone.color + '44' : 'var(--border-color)'}`, opacity: zone.active ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Color dot */}
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: zone.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                      📍
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {zone.zone_name}
                        {!zone.active && <span style={{ fontSize: 11, background: '#64748b', color: '#fff', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>INACTIVE</span>}
                        {zone.slot_diagram_enabled && <span style={{ fontSize: 11, background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>DIAGRAM</span>}
                      </div>
                      {zone.description && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{zone.description}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--border-color)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 99, transition: 'width 0.5s' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: barColor, flexShrink: 0 }}>{occ.count}/{zone.total_slots}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{free} free</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {zone.slot_diagram_enabled && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setExpandedZone(isExpanded ? null : zone.id)}>
                          {isExpanded ? '▲ Map' : '▼ Map'}
                        </button>
                      )}
                      <button className="btn btn-secondary btn-sm" onClick={() => { setEditZone(zone); setShowModal(true) }}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(zone)} style={{ color: zone.active ? '#f59e0b' : '#22c55e' }}>
                        {zone.active ? '⏸' : '▶'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteZone(zone)} style={{ color: '#ef4444' }}>🗑</button>
                    </div>
                  </div>

                  {/* Slot diagram expanded */}
                  {isExpanded && zone.slot_diagram_enabled && (
                    <SlotDiagram zone={zone} occupiedSlots={occ.slots} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
