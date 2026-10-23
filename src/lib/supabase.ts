
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log('Supabase URL exists:', Boolean(supabaseUrl))
console.log('Supabase key exists:', Boolean(supabaseKey))

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    `Supabase configuration missing: URL=${Boolean(supabaseUrl)}, KEY=${Boolean(supabaseKey)}`
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
