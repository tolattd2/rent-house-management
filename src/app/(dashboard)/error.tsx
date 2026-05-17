'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[DashboardError]', error.message, 'digest:', error.digest)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-3 max-w-sm">
        <h2 className="text-base font-semibold">Failed to load page</h2>
        <p className="text-xs text-muted-foreground font-mono break-all">
          {error.message || `Digest: ${error.digest}`}
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
          >
            Try again
          </button>
          <button
            onClick={() => router.replace('/login')}
            className="px-4 py-2 border rounded-lg text-sm"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  )
}
