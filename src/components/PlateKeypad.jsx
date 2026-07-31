import React from 'react'

export function formatVehicleNo(raw) {
  const clean = raw.replace(/[^A-Z0-9]/g, '').toUpperCase()
  const m = clean.match(/^([A-Z]{0,2})(\d{0,2})([A-Z]{0,2})(\d{0,4})$/)
  if (m) {
    let s = m[1]
    if (m[2]) s += ' ' + m[2]
    if (m[3]) s += ' ' + m[3]
    if (m[4]) s += ' ' + m[4]
    return s.trim()
  }
  return clean
}

const ALPHA_ROWS = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ']
const NUM_ROW = '1234567890'

export default function PlateKeypad({ value, onChange, onAccept }) {
  const clean = value.replace(/[^A-Z0-9]/g, '').toUpperCase()
  
  let expectedType = 'ALPHA'
  const m = clean.match(/^([A-Z]{0,2})(\d{0,2})([A-Z]{0,2})(\d{0,4})$/)
  
  if (m) {
    if (m[1].length < 2) expectedType = 'ALPHA'
    else if (m[2].length < 2) expectedType = 'NUM'
    else if (m[3].length === 0) expectedType = 'ALPHA'
    else if (m[3].length === 1 && m[4].length === 0) expectedType = 'ALPHANUM'
    else expectedType = 'NUM'
  } else {
    expectedType = 'ALPHANUM'
  }

  function tap(char) {
    const raw = (clean + char).toUpperCase().slice(0, 10)
    onChange(formatVehicleNo(raw))
    
    // Auto-accept if it ends with exactly 4 digits
    const mNew = raw.match(/^([A-Z]{2})(\d{2})([A-Z]{1,2})(\d{4})$/)
    if (mNew && onAccept) {
      setTimeout(() => onAccept(), 150) // Small delay to let them see the 4th digit
    }
  }

  function del() {
    const raw = clean.slice(0, -1)
    onChange(raw ? formatVehicleNo(raw) : '')
  }
  
  function clear() { onChange('') }

  const keyStyle = {
    padding: '12px 0', width: '100%',
    background: '#fff', border: '1.5px solid #e2e8f0',
    borderRadius: 8, fontSize: 16, fontWeight: 700,
    color: '#0f172a', cursor: 'pointer', transition: 'all 0.1s',
    fontFamily: "'Space Grotesk', sans-serif",
    userSelect: 'none'
  }

  return (
    <div style={{ background: '#f1f5f9', borderRadius: 12, padding: 10, marginTop: 8, border: '1px solid #e2e8f0', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, textAlign: 'center' }}>
        {expectedType === 'ALPHA' ? 'Tap LETTERS' : expectedType === 'NUM' ? 'Tap NUMBERS' : 'Tap LETTERS or NUMBERS'}
      </div>
      
      {(expectedType === 'ALPHA' || expectedType === 'ALPHANUM') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px', marginBottom: '8px' }}>
          {ALPHA_ROWS.join('').split('').map(c => (
            <button key={c} style={keyStyle} onClick={() => tap(c)}
              onMouseDown={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#6366f1' }}
              onMouseUp={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0' }}
              onTouchStart={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderColor = '#6366f1' }}
              onTouchEnd={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0' }}
              type="button">{c}</button>
          ))}
        </div>
      )}
      
      {(expectedType === 'NUM' || expectedType === 'ALPHANUM') && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '8px' }}>
          {NUM_ROW.split('').map(c => (
            <button key={c} style={{ ...keyStyle, padding: '16px 0', fontSize: 20, background: '#e8eeff', borderColor: '#c7d2fe', color: '#3730a3' }}
              onMouseDown={e => { e.currentTarget.style.background = '#c7d2fe' }}
              onMouseUp={e => { e.currentTarget.style.background = '#e8eeff' }}
              onTouchStart={e => { e.currentTarget.style.background = '#c7d2fe' }}
              onTouchEnd={e => { e.currentTarget.style.background = '#e8eeff' }}
              onClick={() => tap(c)} type="button">{c}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: onAccept ? '1fr 1fr 1fr' : '1fr 1fr', gap: '6px' }}>
        <button style={{ ...keyStyle, background: '#fef2f2', borderColor: '#fecaca', color: '#dc2626', fontSize: 14 }}
          onClick={del} type="button">⌫ DEL</button>
        <button style={{ ...keyStyle, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#16a34a', fontSize: 14 }}
          onClick={clear} type="button">CLEAR</button>
        {onAccept && (
          <button style={{ ...keyStyle, background: '#22c55e', borderColor: '#16a34a', color: '#fff', fontSize: 14 }}
            onClick={() => onAccept()} type="button">✅ TICK</button>
        )}
      </div>
    </div>
  )
}
