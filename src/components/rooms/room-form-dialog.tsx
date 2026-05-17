'use client'

import { useState } from 'react'
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

const schema = z.object({
  roomNumber: z.string().min(1, 'Room number required'),
  branch: z.string().default('Takmoa'),
  roomType: z.string().default('Standard'),
  rentPriceUsd: z.coerce.number().min(0),
  status: z.enum(['occupied', 'vacant', 'maintenance']).default('vacant'),
  waterRateRiel: z.coerce.number().min(0).default(2000),
  electricRateRiel: z.coerce.number().min(0).default(720),
  notes: z.string().default(''),
})

type FormData = z.infer<typeof schema>

interface Props {
  room?: Partial<FormData & { id: string }> | null
  onClose: () => void
  onSave: () => void
}

export function RoomFormDialog({ room, onClose, onSave }: Props) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const isEdit = !!room?.id

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      roomNumber: room?.roomNumber ?? '',
      branch: room?.branch ?? 'Takmoa',
      roomType: room?.roomType ?? 'Standard',
      rentPriceUsd: room?.rentPriceUsd ?? 0,
      status: (room?.status as FormData['status']) ?? 'vacant',
      waterRateRiel: room?.waterRateRiel ?? 2000,
      electricRateRiel: room?.electricRateRiel ?? 720,
      notes: room?.notes ?? '',
    },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    const url = isEdit ? `/api/rooms/${room.id}` : '/api/rooms'
    const method = isEdit ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
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
              {errors.roomNumber && <p className="text-xs text-destructive">{errors.roomNumber.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{t('branch')}</Label>
              <Select onValueChange={(v) => setValue('branch', v)} defaultValue={room?.branch ?? 'Takmoa'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Takmoa">Takmoa</SelectItem>
                  <SelectItem value="Chamkadong">Chamkadong</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('room_form_water_rate')}</Label>
              <Input type="number" {...register('waterRateRiel')} placeholder="2000" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('room_form_electric_rate')}</Label>
              <Input type="number" {...register('electricRateRiel')} placeholder="720" />
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
