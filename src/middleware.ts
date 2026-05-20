import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const isLoggedIn = !!session

  const isAuthPage = nextUrl.pathname.startsWith('/login')
  const isApiAuth = nextUrl.pathname.startsWith('/api/auth')
  // Endpoints called by external services (no login session). They guard
  // themselves: the Telegram webhook verifies a secret token, cron checks CRON_SECRET.
  const isTelegramWebhook = nextUrl.pathname === '/api/telegram/webhook'
  const isCron = nextUrl.pathname.startsWith('/api/cron')
  const isPublic = isAuthPage || isApiAuth || isTelegramWebhook || isCron

  if (!isLoggedIn && !isPublic) {
    return NextResponse.redirect(new URL('/login', nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|fonts|.*\\.png$).*)'],
}
