import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Storage bucket that holds Custom Reminder pictures and videos. Must be public. */
export const REMINDER_BUCKET = 'reminder-media'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let browserClient: SupabaseClient | null | undefined
let adminClient: SupabaseClient | null | undefined

/** Anon client for browser-side uploads. `null` when Supabase isn't configured. */
export function supabaseBrowser(): SupabaseClient | null {
  if (browserClient === undefined) {
    browserClient = url && anonKey ? createClient(url, anonKey) : null
  }
  return browserClient
}

/** Service-role client for server-side storage operations. `null` when not configured. */
export function supabaseAdmin(): SupabaseClient | null {
  if (adminClient === undefined) {
    adminClient = url && serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : null
  }
  return adminClient
}
