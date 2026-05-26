'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBranches } from '@/contexts/branches-context'
import { useLanguage } from '@/contexts/language-context'

interface Props {
  branch: string
  floor: string
  floors: string[]
  dirty: boolean
  onChange: (branch: string, floor: string) => void
}

// Prompts before discarding unsaved edits when the user jumps branches/floors.
export function BranchFloorSelector({ branch, floor, floors, dirty, onChange }: Props) {
  const branches = useBranches()
  const { t } = useLanguage()

  const confirmIfDirty = () => {
    if (!dirty) return true
    return window.confirm(t('room_map_discard_changes'))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{t('branch')}</span>
        <Select
          value={branch}
          onValueChange={(v) => {
            if (v === branch) return
            if (confirmIfDirty()) onChange(v, floor)
          }}
        >
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder={branch} /></SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.slug} value={b.name}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{t('room_map_floor')}</span>
        <Select
          value={floor}
          onValueChange={(v) => {
            if (v === floor) return
            if (confirmIfDirty()) onChange(branch, v)
          }}
        >
          <SelectTrigger className="h-9 w-28"><SelectValue placeholder={floor} /></SelectTrigger>
          <SelectContent>
            {floors.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
