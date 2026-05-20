'use client'

import { createContext, useContext, useCallback, ReactNode } from 'react'
import { Branch, roomLabel } from '@/lib/branches'

const BranchesContext = createContext<Branch[]>([])

export function BranchesProvider({ branches, children }: { branches: Branch[]; children: ReactNode }) {
  return <BranchesContext.Provider value={branches}>{children}</BranchesContext.Provider>
}

export function useBranches(): Branch[] {
  return useContext(BranchesContext)
}

/** Returns a `roomLabel(room)` function bound to the current branch list. */
export function useRoomLabel() {
  const branches = useBranches()
  return useCallback(
    (room: { roomNumber: string; branch?: string | null }) => roomLabel(room, branches),
    [branches],
  )
}
