import { NextRequest } from 'next/server'
import { handlers } from '@/lib/auth'

// Auth.js always stamps Expires/Max-Age on the session-token cookie (derived
// from session.maxAge), which keeps users signed in across a full browser
// restart. We strip those attributes so the session token becomes a
// non-persistent "session cookie" — the browser drops it when it closes, so
// reopening the app requires a fresh login. Sign-out deletion cookies (empty
// value) are left untouched so logout keeps working.
const SESSION_COOKIE = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/

function harden(res: Response): Response {
  const setCookies = res.headers.getSetCookie()
  if (setCookies.length === 0) return res

  const headers = new Headers(res.headers)
  headers.delete('set-cookie')
  for (const cookie of setCookies) {
    const end = cookie.indexOf(';')
    const pair = end === -1 ? cookie : cookie.slice(0, end)
    const value = pair.slice(pair.indexOf('=') + 1)
    if (SESSION_COOKIE.test(cookie) && value !== '') {
      headers.append('set-cookie', cookie
        .replace(/;\s*Expires=[^;]*/i, '')
        .replace(/;\s*Max-Age=[^;]*/i, ''))
    } else {
      headers.append('set-cookie', cookie)
    }
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export async function GET(req: NextRequest) {
  return harden(await handlers.GET(req))
}

export async function POST(req: NextRequest) {
  return harden(await handlers.POST(req))
}
