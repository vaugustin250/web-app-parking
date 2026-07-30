// Supabase client — replace with your actual project URL and anon key
// Get these from: https://supabase.com/dashboard → Project → Settings → API
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
})

// Helper: get current user's profile (with tenant_id and role)
export async function getCurrentUserProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()
  return data
}

// Helper: get tenant settings
export async function getTenantSettings(tenantId) {
  const { data } = await supabase
    .from('settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .single()
  return data
}
