import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    if (user) navigate('/')
  }, [user, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return
    setError(''); setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Incorrect email or password. Please try again.'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {/* Left — Branding Panel */}
      <div className="login-brand">
        <img src="/logo.png" alt="VBills Logo" style={{ width: '100%', maxWidth: 500, objectFit: 'contain', marginBottom: -10, transform: 'scale(2.0)' }} />
        <div className="login-brand-tagline">
          Smart Billing & Parking Management Platform for modern businesses
        </div>
        <div className="login-brand-features">
          {[
            { icon: '🅿️', text: 'Real-time slot tracking & visual map' },
            { icon: '📷', text: 'Auto number plate reading (ANPR)' },
            { icon: '📱', text: 'UPI / QR payment at exit' },
            { icon: '📊', text: 'Live reports & revenue analytics' },
            { icon: '☁️', text: 'Cloud sync — view data anywhere' },
          ].map(f => (
            <div key={f.text} className="login-brand-feature">
              <div className="icon">{f.icon}</div>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right — Login Form */}
      <div className="login-form-panel">
        <div className="login-form-box fade-in">
          <div className="login-form-title">Welcome back 👋</div>
          <div className="login-form-subtitle">Sign in to your VBills account</div>

          {error && <div className="login-error">⚠️ {error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email" autoFocus
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="input-with-icon">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <span
                  className="input-icon"
                  onClick={() => setShowPass(s => !s)}
                  title={showPass ? 'Hide' : 'Show'}
                >
                  {showPass ? '🙈' : '👁️'}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading || !email || !password}
              style={{ marginTop: 8, padding: '15px', fontSize: 16 }}
            >
              {loading ? '⏳ Signing in...' : '🔑 Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 32, padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Roles in this app
            </div>
            {[
              { role: 'MANAGER', label: 'Manager (Business Owner)', desc: 'Dashboard, reports, staff, payment config' },
              { role: 'WATCHMAN', label: 'Watchman / Operator', desc: 'Vehicle entry & exit only' },
            ].map(r => (
              <div key={r.role} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`role-badge ${r.role.toLowerCase()}`}>{r.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
