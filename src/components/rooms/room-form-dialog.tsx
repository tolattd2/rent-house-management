'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { useBranches } from '@/contexts/branches-context'
import { branchHasFloors, findBranch, resolveBranchRates } from '@/lib/branches'

const schema = z.object({
  roomNumber: z.string().min(1, 'Room number required'),
  branch: z.string().min(1, 'Branch required'),
  floor: z.string().default('1'),
  roomType: z.string().default('Standard'),
  rentPriceUsd: z.coerce.number().min(0),
  status: z.enum(['occupied', 'vacant', 'maintenance']).default('vacant'),
  waterRateRiel: z.coerce.number().min(0).default(2000),
  electricRateRiel: z.coerce.number().min(0).default(720),
  notes: z.string().default(''),
})

type FormData = z.infer<typeof schema>

/**
 * Suggest the next room numbers for a branch by learning the pattern already
 * used there: shared prefix, digit width, and the existing sequence.
 */
function suggestRoomNumbers(existing: string[]): string[] {
  const used = new Set(existing)
  const parsed = existing
    .map((s) => {
      const m = s.trim().match(/^(.*?)(\d+)$/)
      return m ? { prefix: m[1], num: parseInt(m[2], 10), width: m[2].length } : null
    })
    .filter((x): x is { prefix: string; num: number; width: number } => x !== null)

  if (parsed.length === 0) return ['101']

  // Follow the most common prefix among the existing numbers.
  const prefixCount = new Map<string, number>()
  for (const p of parsed) prefixCount.set(p.prefix, (prefixCount.get(p.prefix) ?? 0) + 1)
  const prefix = [...prefixCount.entries()].sort((a, b) => b[1] - a[1])[0][0]

  const seq = parsed.filter((p) => p.prefix === prefix).sort((a, b) => a.num - b.num)
  const width = Math.max(...seq.map((p) => p.width))
  const fmt = (n: number) => prefix + String(n).padStart(width, '0')
  const nums = seq.map((p) => p.num)
  const max = nums[nums.length - 1]

  const out: string[] = []
  out.push(fmt(max + 1)) // next in sequence
  if (width >= 3 && max >= 100) {
    out.push(fmt((Math.floor(max / 100) + 1) * 100 + 1)) // start of the next floor
  }
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] - nums[i - 1] > 1) { out.push(fmt(nums[i - 1] + 1)); break } // fill first gap
  }
  return [...new Set(out)].filter((s) => !used.has(s)).slice(0, 3)
}

interface Props {
  room?: Partial<FormData & { id: string }> | null
  settings: Record<string, string>
  rooms: Array<{ roomNumber: string; branch: string }>
  onClose: () => void
  onSave: () => void
}

export function RoomFormDialog({ room, settings, rooms, onClose, onSave }: Props) {
  const { t } = useLanguage()
  const branches = useBranches()
  const [loading, setLoading] = useState(false)
  const isEdit = !!room?.id

  const defaultBranch = room?.branch ?? branches[0]?.name ?? ''
  const defaultBranchRates = resolveBranchRates(settings, branches, defaultBranch)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      roomNumber: room?.roomNumber ?? '',
      branch: defaultBranch,
      floor: room?.floor ?? '1',
      roomType: room?.roomType ?? 'Standard',
      rentPriceUsd: room?.rentPriceUsd ?? 0,
      status: (room?.status as FormData['status']) ?? 'vacant',
      waterRateRiel: room?.waterRateRiel ?? Number(defaultBranchRates.water_rate_riel),
      electricRateRiel: room?.electricRateRiel ?? Number(defaultBranchRates.electric_rate_riel),
      notes: room?.notes ?? '',
    },
  })

  // Room-number suggestions, learned from the numbers already used in the
  // currently selected branch. Shown for new rooms only.
  const currentBranch = watch('branch')
  const currentBranchObj = findBranch(branches, currentBranch)
  const hasFloors = branchHasFloors(currentBranchObj)
  const floorCount = currentBranchObj?.floorCount ?? 1
  const currentFloor = watch('floor')
  // Rates always come from the selected branch's settings — recompute when
  // the branch dropdown changes so the displayed numbers stay accurate.
  const branchRates = useMemo(
    () => resolveBranchRates(settings, branches, currentBranch),
    [settings, branches, currentBranch],
  )
  // Floor options: 1..floorCount, plus the room's existing floor when
  // editing if it falls outside that range (so we never silently lose it).
  const floorOptions = useMemo(() => {
    const list = Array.from({ length: Math.max(1, floorCount) }, (_, i) => String(i + 1))
    if (currentFloor && !list.includes(currentFloor)) list.push(currentFloor)
    return list
  }, [floorCount, currentFloor])
  const roomNumberSuggestions = useMemo(
    () => suggestRoomNumbers(rooms.filter((r) => r.branch === currentBranch).map((r) => r.roomNumber)),
    [rooms, currentBranch],
  )

  // On a new room, switching branch refreshes the water/electric fields to that
  // branch's default rate. The inputs stay editable so the user can override.
  const handleBranchChange = (name: string) => {
    setValue('branch', name)
    if (!isEdit) {
      const r = resolveBranchRates(settings, branches, name)
      setValue('waterRateRiel', Number(r.water_rate_riel))
      setValue('electricRateRiel', Number(r.electric_rate_riel))
    }
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    // Houses have no floors — coerce floor to '1' on submit so the row is
    // still well-formed in the DB regardless of which branch it ends up on.
    const payload = hasFloors ? data : { ...data, floor: '1' }
    const url = isEdit ? `/api/rooms/${room.id}` : '/api/rooms'
    const method = isEdit ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await res.json()
    if (result.ok) {
      toast({ title: isEdit ? t('room_updated') : t('room_created') })
      onSave()
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    }
    setLoading(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('room_form_edit') : t('room_form_add')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('room_form_number')}</Label>
              <Input {...register('roomNumber')} placeholder="101" />
              {!isEdit && roomNumberSuggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">{t('room_form_suggestions')}:</span>
                  {roomNumberSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setValue('roomNumber', s, { shouldValidate: true })}
                      className="px-1.5 py-0.5 text-[11px] rounded border bg-muted/50 hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {errors.roomNumber && <p className="text-xs text-destructive">{errors.roomNumber.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{t('branch')}</Label>
              <Select onValueChange={handleBranchChange} defaultValue={room?.branch ?? branches[0]?.name}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.slug} value={b.name}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branch && <p className="text-xs text-destructive">{errors.branch.message}</p>}
            </div>
          </div>

          <div className={hasFloors ? 'grid grid-cols-2 gap-4' : ''}>
            <div className="space-y-1.5">
              <Label>{t('room_form_type')}</Label>
              <Select onValueChange={(v) => setValue('roomType', v)} defaultValue={room?.roomType ?? 'Standard'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="Deluxe">Deluxe</SelectItem>
                  <SelectItem value="Studio">Studio</SelectItem>
                  <SelectItem value="Suite">Suite</SelectItem>
                  <SelectItem value="Penthouse">Penthouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasFloors && (
              <div className="space-y-1.5">
                <Label>{t('room_map_floor')}</Label>
                <Select
                  value={currentFloor || '1'}
                  onValueChange={(v) => setValue('floor', v, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {floorOptions.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('room_form_floor_hint')}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('status')}</Label>
              <Select onValueChange={(v) => setValue('status', v as FormData['status'])} defaultValue={room?.status ?? 'vacant'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacant">{t('status_vacant')}</SelectItem>
                  <SelectItem value="occupied">{t('status_occupied')}</SelectItem>
                  <SelectItem value="maintenance">{t('status_maintenance')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('room_form_rent_default')}</Label>
              <Input type="number" step="0.01" {...register('rentPriceUsd')} placeholder="150" />
              {errors.rentPriceUsd && <p className="text-xs text-destructive">{errors.rentPriceUsd.message}</p>}
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            {t('room_form_rates_branch_hint')}
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 tabular-nums">
              <span>{t('room_form_water_rate')}: {parseFloat(branchRates.water_rate_riel).toLocaleString()} ៛</span>
              <span>{t('room_form_electric_rate')}: {parseFloat(branchRates.electric_rate_riel).toLocaleString()} ៛</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('notes')}</Label>
            <Textarea {...register('notes')} placeholder={t('room_form_notes_ph')} rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" loading={loading}>{isEdit ? t('room_form_update') : t('room_form_create')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
