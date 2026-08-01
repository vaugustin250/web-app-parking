import { createContext, useContext, useEffect, useState } from 'react'
import api from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    
    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser)
        if (parsedUser.role) parsedUser.role = parsedUser.role.toUpperCase()
        setUser(parsedUser)
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
    
    // Attempt to pre-fetch settings into local DB if online
    if (navigator.onLine && data.user.tenantId) {
       try {
         const settingsRes = await api.get('/api/settings');
         const localDb = (await import('../lib/db.local')).default;
         await localDb.settings.put(settingsRes.data);
       } catch (e) {
         console.warn('Failed to prefetch settings', e);
       }
    }
    
    return data.user
  }

  async function signOut() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    window.location.href = '/login'
  }

  const role = user?.role ?? null
  const tenantId = user?.tenantId ?? null
  const isWatchman = role === 'WATCHMAN'
  const isManager = role === 'MANAGER'
  const isSuperAdmin = role === 'SUPER_ADMIN'

  return (
    <AuthContext.Provider value={{
      user, profile: user, loading,
      role, tenantId, isWatchman, isManager, isSuperAdmin,
      signIn, signOut
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
