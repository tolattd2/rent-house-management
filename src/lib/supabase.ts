import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Storage bucket that holds Custom Reminder pictures and videos. Must be public. */
export const REMINDER_BUCKET = 'reminder-media'

/**
 * Returns the value only if it looks like a real Supabase API key — a legacy JWT
 * (`eyJ…`) or a new-format key (`sb_publishable_…` / `sb_secret_…`). Placeholder
 * strings such as "the-anon-key" are rejected so callers fail with a clear
 * "not configured" message instead of a cryptic storage error.
 */
function apiKey(v: string | undefined): string | undefined {
  const k = v?.trim()
  return k && (k.startsWith('eyJ') || k.startsWith('sb_')) ? k : undefined
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined
// New-style `sb_publishable_…` keys work for the browser client like the legacy anon key.
const anonKey =
  apiKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
  apiKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
const serviceKey = apiKey(process.env.SUPABASE_SERVICE_ROLE_KEY)

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
