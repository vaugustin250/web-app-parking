import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, getCurrentUserProfile } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)         // Supabase auth user
  const [profile, setProfile] = useState(null)   // users row (role, tenant_id, etc.)
  const [settings, setSettings] = useState(null) // tenant settings
  const [tenantData, setTenantData] = useState(null) // tenant row (feature flags, license_status)
  const [loading, setLoading] = useState(true)

  async function loadProfile(supabaseUser) {
    if (!supabaseUser) { setProfile(null); setSettings(null); setTenantData(null); return }
    const p = await getCurrentUserProfile()
    setProfile(p)
    if (p?.tenant_id) {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from('settings').select('*').eq('tenant_id', p.tenant_id).single(),
        supabase.from('tenants').select('*').eq('id', p.tenant_id).single(),
      ])
      setSettings(s)
      setTenantData(t)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      loadProfile(session?.user ?? null).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      loadProfile(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', data.user.id)
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const role = profile?.role ?? null
  const tenantId = profile?.tenant_id ?? null
  const isWatchman = role === 'WATCHMAN'
  const isManager = role === 'MANAGER'
  const isSuperAdmin = role === 'SUPER_ADMIN'

  return (
    <AuthContext.Provider value={{
      user, profile, settings, tenantData, loading,
      role, tenantId, isWatchman, isManager, isSuperAdmin,
      signIn, signOut,
      refreshSettings: () => loadProfile(user)
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
