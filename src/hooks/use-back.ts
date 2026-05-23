'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

export function useBack(fallback: string) {
  const router = useRouter()
  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallback)
    }
  }, [router, fallback])
}
