import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envStr = fs.readFileSync('.env', 'utf8')
const env = Object.fromEntries(envStr.split(/\r?\n/).filter(l => l.includes('=')).map(l => l.split('=')))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { error: insErr } = await supabase.from('parking_records').update({
    amount_charged: 10,
    payment_mode: 'CASH'
  }).eq('id', '11111111-1111-1111-1111-111111111111')
  console.log('Update Error:', insErr)
}
test()
