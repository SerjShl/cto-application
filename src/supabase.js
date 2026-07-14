import { createClient } from '@supabase/supabase-js'

const config = window.__APP_CONFIG__ || {}
const supabaseUrl = config.supabaseUrl
const supabaseAnonKey = config.supabaseAnonKey

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Не настроены ключи Supabase в .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
