'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('Dashboard error:', error.digest)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">Digest: {error.digest}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
          >
            Try again
          </button>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-4 py-2 border rounded-lg text-sm"
          >
            Sign out &amp; retry
          </button>
        </div>
      </div>
    </div>
  )
}
