'use client'

import { useRouter } from 'next/navigation'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-lg font-semibold">Failed to load page</h2>
        <p className="text-xs text-muted-foreground">Digest: {error.digest}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
          >
            Try again
          </button>
          <button
            onClick={() => router.push('/login')}
            className="px-4 py-2 border rounded-lg text-sm"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  )
}
