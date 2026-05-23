'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, X, FileSignature } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { sortRoomsByNumber } from '@/lib/utils'
import { useLanguage } from '@/contexts/language-context'
import { useBranches, useRoomLabel } from '@/contexts/branches-context'
import { GenerateContractDialog } from './generate-contract-dialog'

/** Months between two ISO dates (rounded down, partial months drop). Returns 0 if invalid. */
function monthsBetween(start?: string, end?: string): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (e.getDate() < s.getDate()) months -= 1
  return Math.max(0, months)
}

/** Add N months to an ISO date and return YYYY-MM-DD. Clamps to month length. */
function addMonths(iso: string, months: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  // Handle overflow (e.g. Jan 31 + 1 month → Feb 28).
  if (d.getDate() !== day) d.setDate(0)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const schema = z.object({
  fullName: z.string().min(1, 'Full name required'),
  gender: z.string().default(''),
  phone: z.string().default(''),
  telegramChatId: z.string().default(''),
  nationalId: z.string().default(''),
  emergencyName: z.string().default(''),
  emergencyPhone: z.string().default(''),
  occupation: z.string().default(''),
  age: z.coerce.number().int().min(0).max(150).default(0),
  nationality: z.string().default(''),
  moveInDate: z.string().default(''),
  depositAmount: z.coerce.number().min(0).default(0),
  payDay: z.coerce.number().int().min(1).max(31).default(1),
  roomId: z.string().optional(),
  notes: z.string().default(''),
  contractStart: z.string().default(''),
  contractEnd: z.string().default(''),
  monthlyRent: z.coerce.number().min(0).default(0),
})

type FormData = z.infer<typeof schema>

interface Room {
  id: string; roomNumber: string; branch?: string; status: string; rentPriceUsd: number
}
interface Props {
  rooms: Room[]
  tenant?: (Partial<FormData> & {
    id?: string
    phonesExtra?: string[]
    /** Legacy combined "Name + Phone" field — pre-fills the name when no split value exists. */
    emergencyContact?: string
  }) | null
  onClose: () => void
  onSave: () => void
}

export function TenantFormDialog({ rooms, tenant, onClose, onSave }: Props) {
  const { t, language } = useLanguage()
  const roomLabel = useRoomLabel()
  const defaultNationality = language === 'kh' ? 'កម្ពុជា' : 'Cambodian'
  const [loading, setLoading] = useState(false)
  const isEdit = !!tenant?.id
  const [phonesExtra, setPhonesExtra] = useState<string[]>(tenant?.phonesExtra ?? [])
  const [showGenerate, setShowGenerate] = useState(false)
  // Contract duration (months) — entering this together with Contract Start
  // auto-computes Contract End. Seeded from existing start+end when editing.
  const [contractDuration, setContractDuration] = useState<number>(() =>
    monthsBetween(tenant?.contractStart, tenant?.contractEnd),
  )

  const initialBranch = tenant?.roomId
    ? (rooms.find((r) => r.id === tenant.roomId)?.branch ?? '')
    : ''
  const [selectedBranch, setSelectedBranch] = useState(initialBranch)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: tenant?.fullName ?? '',
      gender: tenant?.gender ?? '',
      phone: tenant?.phone ?? '',
      telegramChatId: tenant?.telegramChatId ?? '',
      nationalId: tenant?.nationalId ?? '',
      emergencyName: tenant?.emergencyName || tenant?.emergencyContact || '',
      emergencyPhone: tenant?.emergencyPhone ?? '',
      occupation: tenant?.occupation ?? '',
      age: tenant?.age ?? 0,
      nationality: tenant?.nationality || defaultNationality,
      moveInDate: tenant?.moveInDate ?? '',
      depositAmount: tenant?.depositAmount ?? 0,
      payDay: tenant?.payDay ?? 1,
      roomId: tenant?.roomId ?? '',
      notes: tenant?.notes ?? '',
      contractStart: tenant?.contractStart ?? '',
      contractEnd: tenant?.contractEnd ?? '',
      monthlyRent: tenant?.monthlyRent ?? 0,
    },
  })

  const branches = useBranches().map((b) => b.name)
  const branchRooms = sortRoomsByNumber(
    selectedBranch ? rooms.filter((r) => r.branch === selectedBranch) : []
  )

  const selectedRoomId = watch('roomId')
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId)

  // Auto-compute Contract End from Contract Start + Duration (months).
  const watchedStart = watch('contractStart')
  useEffect(() => {
    if (!watchedStart || contractDuration <= 0) return
    const end = addMonths(watchedStart, contractDuration)
    if (end) setValue('contractEnd', end, { shouldDirty: true })
  }, [watchedStart, contractDuration, setValue])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    const url = isEdit ? `/api/tenants/${tenant.id}` : '/api/tenants'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, phonesExtra: phonesExtra.map((p) => p.trim()).filter(Boolean) }),
    })
    const result = await res.json()

    if (result.ok) {
      toast({ title: isEdit ? 'Tenant updated' : 'Tenant added' })
      onSave()
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    }
    setLoading(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('tenant_form_edit') : t('tenant_form_add')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Tabs defaultValue="personal">
            <TabsList className="mb-4">
              <TabsTrigger value="personal">{t('tenant_form_personal')}</TabsTrigger>
              <TabsTrigger value="rental">{t('tenant_form_rental')}</TabsTrigger>
              <TabsTrigger value="contract">{t('tenant_form_contract')}</TabsTrigger>
            </TabsList>

            <TabsContent value="personal" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label>{t('tenant_form_fullname')}</Label>
                  <Input {...register('fullName')} placeholder={t('tenant_form_name_ph')} />
                  {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_form_gender')}</Label>
                  <Select onValueChange={(v) => setValue('gender', v)} defaultValue={tenant?.gender ?? ''}>
                    <SelectTrigger><SelectValue placeholder={t('tenant_form_gender_ph')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">{t('tenant_form_male')}</SelectItem>
                      <SelectItem value="Female">{t('tenant_form_female')}</SelectItem>
                      <SelectItem value="Other">{t('tenant_form_other_gender')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_national_id')}</Label>
                  <Input {...register('nationalId')} placeholder={t('tenant_form_national_id_ph')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_age')}</Label>
                  <Input type="number" min="0" max="150" {...register('age')} placeholder="25" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_nationality')}</Label>
                  <Input {...register('nationality')} placeholder={t('tenant_form_nationality_ph')} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>{t('tenant_occupation')}</Label>
                  <Input {...register('occupation')} placeholder={t('tenant_form_occupation_ph')} />
                </div>
                {/* Phone numbers — primary plus any extras the tenant has */}
                <div className="col-span-2 space-y-1.5">
                  <Label>{t('settings_phone')}</Label>
                  <Input {...register('phone')} placeholder={t('tenant_form_phone_ph')} />
                  {phonesExtra.map((p, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={p}
                        onChange={(e) =>
                          setPhonesExtra((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                        }
                        placeholder={t('tenant_form_phone_ph')}
                      />
                      <Button
                        type="button" variant="outline" size="icon" className="flex-shrink-0"
                        onClick={() => setPhonesExtra((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => setPhonesExtra((prev) => [...prev, ''])}
                  >
                    <Plus className="w-4 h-4 mr-1" />{t('tenant_form_add_phone')}
                  </Button>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Telegram Chat ID</Label>
                  <Input {...register('telegramChatId')} placeholder="Auto-filled when the tenant links via the bot" />
                  <p className="text-xs text-muted-foreground">
                    Tenants link automatically by sharing their phone in the Telegram bot — you can also paste or clear it here.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_emergency_name')}</Label>
                  <Input {...register('emergencyName')} placeholder={t('tenant_form_emergency_ph')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_emergency_phone')}</Label>
                  <Input {...register('emergencyPhone')} placeholder={t('tenant_form_phone_ph')} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>{t('notes')}</Label>
                  <Textarea {...register('notes')} rows={2} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rental" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('branch')}</Label>
                  <Select
                    value={selectedBranch || 'none'}
                    onValueChange={(v) => {
                      const branch = v === 'none' ? '' : v
                      setSelectedBranch(branch)
                      setValue('roomId', '')
                      setValue('monthlyRent', 0)
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder={t('tenant_form_branch_ph')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('tenant_form_branch_ph')}</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_form_assign_room')}</Label>
                  <Select
                    value={selectedRoomId || 'none'}
                    onValueChange={(v) => {
                      setValue('roomId', v === 'none' ? '' : v)
                      const room = rooms.find((r) => r.id === v)
                      if (room) setValue('monthlyRent', room.rentPriceUsd)
                    }}
                    disabled={!selectedBranch}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={selectedBranch ? t('tenant_form_room_ph') : t('tenant_form_branch_first')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('tenant_form_no_room')}</SelectItem>
                      {branchRooms.map((r) => (
                        <SelectItem key={r.id} value={r.id} disabled={r.status === 'occupied' && r.id !== tenant?.roomId}>
                          {t('room')} {roomLabel(r)} — ${r.rentPriceUsd}/mo
                          {r.status === 'occupied' ? ` [${t('tenant_form_occupied_tag')}]` : ` [${t('tenant_form_available_tag')}]`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_form_movein')}</Label>
                  <Input type="date" {...register('moveInDate')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_form_rent')}</Label>
                  <Input type="number" step="0.01" {...register('monthlyRent')} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_form_deposit')}</Label>
                  <Input type="number" step="0.01" {...register('depositAmount')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_form_payday_label')}</Label>
                  <Input type="number" min="1" max="31" {...register('payDay')} placeholder="1" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contract" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>{t('tenant_form_contract_start')}</Label>
                  <Input type="date" {...register('contractStart')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_form_contract_duration')}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="600"
                    value={contractDuration || ''}
                    onChange={(e) => setContractDuration(Number(e.target.value) || 0)}
                    placeholder="12"
                  />
                  <div className="flex flex-wrap gap-1">
                    {[3, 6, 12, 24].map((m) => (
                      <Button
                        key={m}
                        type="button"
                        size="sm"
                        variant={contractDuration === m ? 'default' : 'outline'}
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setContractDuration(m)}
                      >
                        {m} {t('tenant_form_months_short')}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('tenant_form_contract_end')}</Label>
                  <Input type="date" {...register('contractEnd')} />
                  <p className="text-[10px] text-muted-foreground">{t('tenant_form_contract_end_auto')}</p>
                </div>
              </div>
              <div className="rounded-md border border-dashed p-4 flex items-start gap-3">
                <FileSignature className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="font-medium text-sm">{t('contract_gen_title')}</div>
                  <p className="text-xs text-muted-foreground">{t('contract_gen_desc')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isEdit}
                  onClick={() => setShowGenerate(true)}
                  title={isEdit ? undefined : t('contract_gen_save_tenant_first')}
                >
                  {t('contract_gen_open_btn')}
                </Button>
              </div>
              {!isEdit && (
                <p className="text-xs text-muted-foreground">
                  {t('contract_gen_save_tenant_first')}
                </p>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" loading={loading}>{isEdit ? t('tenant_form_update_btn') : t('tenant_form_add_btn')}</Button>
          </div>
        </form>

        {showGenerate && isEdit && tenant?.id && (
          <GenerateContractDialog
            tenantId={tenant.id}
            vars={{
              tenantName: watch('fullName') || '',
              gender: watch('gender') || '',
              age: Number(watch('age') || 0),
              nationality: watch('nationality') || '',
              occupation: watch('occupation') || '',
              nationalId: watch('nationalId') || '',
              phone: watch('phone') || '',
              phonesExtra: phonesExtra.filter(Boolean),
              telegramChatId: watch('telegramChatId') || '',
              emergencyName: watch('emergencyName') || '',
              emergencyPhone: watch('emergencyPhone') || '',
              notes: watch('notes') || '',
              moveInDate: watch('moveInDate') || '',
              moveOutDate: '',
              roomLabel: selectedRoom ? roomLabel(selectedRoom) : '',
              branch: selectedBranch,
              monthlyRent: Number(watch('monthlyRent') || 0),
              depositAmount: Number(watch('depositAmount') || 0),
              payDay: Number(watch('payDay') || 1),
              contractStart: watch('contractStart') || '',
              contractEnd: watch('contractEnd') || '',
            }}
            onClose={() => setShowGenerate(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
