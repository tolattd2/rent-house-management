'use client'

import { ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SortDir = 'asc' | 'desc'

interface Props<K extends string> {
  label: string
  k: K
  onSort: (k: K) => void
  active: K
  dir: SortDir
  align?: 'left' | 'right'
}

export function SortableTh<K extends string>({
  label, k, onSort, active, dir, align = 'right',
}: Props<K>) {
  const isActive = active === k
  return (
    <th className={cn('px-4 py-2.5 text-xs font-medium text-muted-foreground', align === 'left' ? 'text-left' : 'text-right')}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-foreground transition-colors',
          align === 'right' && 'flex-row-reverse',
          isActive && 'text-foreground font-semibold',
        )}
      >
        <ArrowUpDown className={cn('w-3 h-3', isActive ? 'opacity-100' : 'opacity-40')} />
        {label}{isActive ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )
}
