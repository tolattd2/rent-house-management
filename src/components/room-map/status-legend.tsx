'use client'

import { useLanguage } from '@/contexts/language-context'

const SWATCHES = [
  { color: 'bg-green-500/15 border-green-500', key: 'status_vacant' as const },
  { color: 'bg-red-500/15 border-red-500', key: 'status_occupied' as const },
  { color: 'bg-yellow-500/15 border-yellow-500', key: 'room_map_status_reserved' as const },
  { color: 'bg-slate-500/15 border-slate-500', key: 'status_maintenance' as const },
]

export function StatusLegend() {
  const { t } = useLanguage()
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {SWATCHES.map(({ color, key }) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className={`inline-block w-3 h-3 rounded-sm border ${color}`} />
          {t(key)}
        </span>
      ))}
    </div>
  )
}
