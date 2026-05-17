'use client'

import { useEffect } from 'react'
import { signOut } from 'next-auth/react'

export default function DashboardError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    signOut({ callbackUrl: '/login' })
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Redirecting to login...</p>
    </div>
  )
}
