import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envStr = fs.readFileSync('.env', 'utf8')
const env = Object.fromEntries(envStr.split('\r\n').map(l => l.split('=')))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { data, error } = await supabase.from('parking_records').insert({
    tenant_id: '11111111-1111-1111-1111-111111111111',
    ticket_no: 'TEST-123',
    vehicle_number: 'TEST',
    vehicle_type: '2-Wheeler',
    status: 'PARKED',
    amount_paid_at_entry: 0,
    payment_method_at_entry: 'CASH'
  })
  console.log(error)
}
test()
