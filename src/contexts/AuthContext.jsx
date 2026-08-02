import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import api from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [settings, setSettings] = useState(null)
  const [tenantData, setTenantData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Fetch settings from API and store in state
  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/api/settings')
      // Backend returns { settings: {...} }
      const s = res.data.settings || res.data
      setSettings(s)
      // Also cache in IndexedDB for offline use
      try {
        const localDb = (await import('../lib/db.local')).default
        await localDb.settings.put(s)
      } catch {}
    } catch (e) {
      console.warn('[AuthContext] Failed to fetch settings', e)
      // Try to load from IndexedDB offline cache
      try {
        const localDb = (await import('../lib/db.local')).default
        const cached = await localDb.settings.toArray()
        if (cached.length > 0) setSettings(cached[0])
      } catch {}
    }
  }, [])

  // On mount: restore session from localStorage
  useEffect(() => {
    const token = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')

    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser)
        if (parsedUser.role) parsedUser.role = parsedUser.role.toUpperCase()
        setUser(parsedUser)
        // Fetch live settings for this user
        fetchSettings()
      } catch (e) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  async function signIn(email, password) {
    const { data } = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('token', data.accessToken)
    data.user.role = data.user.role ? data.user.role.toUpperCase() : null
    localStorage.setItem('user', JSON.stringify(data.user))
    setUser(data.user)
    // Fetch settings immediately after login
    await fetchSettings()
    return data.user
  }

  async function signOut() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    setSettings(null)
    setTenantData(null)
    window.location.href = '/login'
  }

  // Allow pages to refresh settings after updating them
  function refreshSettings() {
    return fetchSettings()
  }

  const role = user?.role ?? null
  const tenantId = user?.tenantId ?? null
  const isWatchman = role === 'WATCHMAN'
  const isManager = role === 'MANAGER'
  const isSuperAdmin = role === 'SUPER_ADMIN'

  // Derive a tenantData-like object from settings for feature flags
  // (passes + zones visibility in sidebar)
  const effectiveTenantData = tenantData || {
    feature_passes_allowed: settings?.feature_passes_enabled ?? true,
    feature_zones_allowed: settings?.zones_enabled ?? true,
  }

  return (
    <AuthContext.Provider value={{
      user, profile: user, loading,
      settings, tenantData: effectiveTenantData,
      role, tenantId, isWatchman, isManager, isSuperAdmin,
      signIn, signOut, refreshSettings,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
