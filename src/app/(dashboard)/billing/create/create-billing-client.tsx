'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calculator, Save, Zap, Droplets } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { calculateBilling } from '@/lib/billing'
import { formatCurrency, roomLabel } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'

const schema = z.object({
  tenantId: z.string().min(1, 'Tenant required'),
  billingMonth: z.string().min(7, 'Month required'),
  prevWaterReading: z.coerce.number().min(0).default(0),
  currWaterReading: z.coerce.number().min(0).default(0),
  prevElectricReading: z.coerce.number().min(0).default(0),
  currElectricReading: z.coerce.number().min(0).default(0),
  roomRentUsd: z.coerce.number().min(0).default(0),
  outstandingDebtUsd: z.coerce.number().min(0).default(0),
  lateDays: z.coerce.number().int().min(0).default(0),
  discountUsd: z.coerce.number().min(0).default(0),
  notes: z.string().default(''),
}).superRefine((data, ctx) => {
  if (data.currWaterReading < data.prevWaterReading) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Current reading cannot be lower than previous reading', path: ['currWaterReading'] })
  }
  if (data.currElectricReading < data.prevElectricReading) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Current reading cannot be lower than previous reading', path: ['currElectricReading'] })
  }
})

type FormData = z.infer<typeof schema>

interface Tenant {
  id: string; fullName: string; phone: string; monthlyRent: number
  room: { id: string; roomNumber: string; branch?: string; rentPriceUsd: number; waterRateRiel: number; electricRateRiel: number } | null
  billings: Array<{ billingMonth: string; currWaterReading: number; currElectricReading: number; totalUsd: number; paymentStatus: string }>
}

export interface EditBilling {
  id: string
  tenantId: string
  billingMonth: string
  prevWaterReading: number
  currWaterReading: number
  prevElectricReading: number
  currElectricReading: number
  roomRentUsd: number
  outstandingDebtUsd: number
  lateDays: number
  discountUsd: number
  notes: string
}

interface Props {
  tenants: Tenant[]
  settings: Record<string, string>
  preselectedTenantId?: string
  editBilling?: EditBilling
}

export function CreateBillingClient({ tenants, settings, preselectedTenantId, editBilling }: Props) {
  const router = useRouter()
  const { t } = useLanguage()
  const isEdit = Boolean(editBilling)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ReturnType<typeof calculateBilling> | null>(null)

  const currentMonth = new Date().toISOString().slice(0, 7)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: editBilling
      ? {
          tenantId: editBilling.tenantId,
          billingMonth: editBilling.billingMonth,
          prevWaterReading: editBilling.prevWaterReading,
          currWaterReading: editBilling.currWaterReading,
          prevElectricReading: editBilling.prevElectricReading,
          currElectricReading: editBilling.currElectricReading,
          roomRentUsd: editBilling.roomRentUsd,
          outstandingDebtUsd: editBilling.outstandingDebtUsd,
          lateDays: editBilling.lateDays,
          discountUsd: editBilling.discountUsd,
          notes: editBilling.notes,
        }
      : {
          tenantId: preselectedTenantId ?? '',
          billingMonth: currentMonth,
          prevWaterReading: 0,
          currWaterReading: 0,
          prevElectricReading: 0,
          currElectricReading: 0,
          roomRentUsd: 0,
          outstandingDebtUsd: 0,
          lateDays: 0,
          discountUsd: 0,
          notes: '',
        },
  })

  const formValues = watch()
  const selectedTenant = tenants.find((t) => t.id === formValues.tenantId)

  // Auto-fill from previous billing when tenant changes (create mode only —
  // in edit mode we keep the saved values).
  useEffect(() => {
    if (isEdit) return
    if (!selectedTenant) return
    const lastBilling = selectedTenant.billings[0]
    const prevUnpaid = lastBilling?.paymentStatus === 'unpaid' ? lastBilling.totalUsd : 0

    setValue('roomRentUsd', selectedTenant.monthlyRent > 0 ? selectedTenant.monthlyRent : (selectedTenant.room?.rentPriceUsd ?? 0))
    setValue('prevWaterReading', lastBilling?.currWaterReading ?? 0)
    setValue('currWaterReading', lastBilling?.currWaterReading ?? 0)
    setValue('prevElectricReading', lastBilling?.currElectricReading ?? 0)
    setValue('currElectricReading', lastBilling?.currElectricReading ?? 0)
    setValue('outstandingDebtUsd', prevUnpaid)
  }, [formValues.tenantId, selectedTenant, setValue, isEdit])

  // Live preview calculation
  useEffect(() => {
    if (!selectedTenant?.room) return
    const calc = calculateBilling(
      {
        prevWaterReading: formValues.prevWaterReading,
        currWaterReading: formValues.currWaterReading,
        prevElectricReading: formValues.prevElectricReading,
        currElectricReading: formValues.currElectricReading,
        roomRentUsd: formValues.roomRentUsd,
        outstandingDebtUsd: formValues.outstandingDebtUsd,
        lateDays: formValues.lateDays,
        discountUsd: formValues.discountUsd,
      },
      settings,
      selectedTenant.room
    )
    setPreview(calc)
  }, [
    formValues.prevWaterReading, formValues.currWaterReading,
    formValues.prevElectricReading, formValues.currElectricReading,
    formValues.roomRentUsd, formValues.outstandingDebtUsd,
    formValues.lateDays, formValues.discountUsd,
    selectedTenant, settings
  ])

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    const res = await fetch(
      editBilling ? `/api/billing/${editBilling.id}` : '/api/billing',
      {
        method: editBilling ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    )
    const result = await res.json()
    if (result.ok) {
      toast({ title: editBilling ? 'Billing updated successfully' : 'Billing created successfully' })
      router.push('/billing')
      router.refresh()
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    }
    setLoading(false)
  }

  const xRate = parseFloat(settings.exchange_rate ?? '4100')

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-4">
        <Link href="/billing">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? 'Edit Billing' : 'Create Billing'}</h1>
          <p className="text-muted-foreground text-sm">
            {isEdit ? 'Update meter readings and amounts' : 'Enter meter readings and calculate'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tenant & Month */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Tenant & Period</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label>Tenant *</Label>
                  {isEdit ? (
                    <div className="h-10 px-3 flex items-center rounded-lg bg-muted/50 text-sm border border-input">
                      {selectedTenant
                        ? `${t('room')} ${selectedTenant.room ? roomLabel(selectedTenant.room) : '—'} — ${selectedTenant.fullName}`
                        : '—'}
                    </div>
                  ) : (
                    <Select onValueChange={(v) => setValue('tenantId', v)} defaultValue={preselectedTenantId ?? ''}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select tenant..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tenants.map((tenant) => (
                          <SelectItem key={tenant.id} value={tenant.id}>
                            {t('room')} {tenant.room ? roomLabel(tenant.room) : '—'} — {tenant.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {errors.tenantId && <p className="text-xs text-destructive">{errors.tenantId.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Billing Month *</Label>
                  <Input type="month" {...register('billingMonth')} readOnly={isEdit}
                    className={isEdit ? 'bg-muted/50' : ''} />
                </div>
                <div className="space-y-1.5">
                  <Label>Monthly Rent (USD)</Label>
                  <Input type="number" step="0.01" {...register('roomRentUsd')} />
                </div>
              </CardContent>
            </Card>

            {/* Water */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-blue-500" />Water Meter
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Previous Reading</Label>
                  <Input type="number" step="0.1" {...register('prevWaterReading')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Current Reading</Label>
                  <Input type="number" step="0.1" {...register('currWaterReading')}
                    className={errors.currWaterReading ? 'border-destructive' : ''} />
                  {errors.currWaterReading && <p className="text-xs text-destructive">{errors.currWaterReading.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Usage (auto)</Label>
                  <div className="h-10 px-3 flex items-center rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-semibold text-sm border border-blue-200 dark:border-blue-900">
                    {Math.max(0, (formValues.currWaterReading ?? 0) - (formValues.prevWaterReading ?? 0))} {t('unit_kib')}
                  </div>
                </div>
                <div className="col-span-3 text-xs text-muted-foreground">
                  Rate: {(selectedTenant?.room?.waterRateRiel ?? parseFloat(settings.water_rate_riel ?? '2000')).toLocaleString()} ៛/Kib
                </div>
              </CardContent>
            </Card>

            {/* Electric */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />Electric Meter
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Previous Reading</Label>
                  <Input type="number" step="0.1" {...register('prevElectricReading')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Current Reading</Label>
                  <Input type="number" step="0.1" {...register('currElectricReading')}
                    className={errors.currElectricReading ? 'border-destructive' : ''} />
                  {errors.currElectricReading && <p className="text-xs text-destructive">{errors.currElectricReading.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Usage (auto)</Label>
                  <div className="h-10 px-3 flex items-center rounded-lg bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 font-semibold text-sm border border-yellow-200 dark:border-yellow-900">
                    {Math.max(0, (formValues.currElectricReading ?? 0) - (formValues.prevElectricReading ?? 0))} {t('unit_kw')}
                  </div>
                </div>
                <div className="col-span-3 text-xs text-muted-foreground">
                  Rate: {(selectedTenant?.room?.electricRateRiel ?? parseFloat(settings.electric_rate_riel ?? '720')).toLocaleString()} ៛/{t('unit_kw')}
                </div>
              </CardContent>
            </Card>

            {/* Adjustments */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Adjustments</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Outstanding Debt (USD)</Label>
                  <Input type="number" step="0.01" {...register('outstandingDebtUsd')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Late Days</Label>
                  <Input type="number" min="0" {...register('lateDays')} />
                  <p className="text-xs text-muted-foreground">
                    Penalty: ${parseFloat(settings.late_penalty_usd ?? '1')}/day
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Discount (USD)</Label>
                  <Input type="number" step="0.01" {...register('discountUsd')} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea {...register('notes')} rows={2} placeholder="Any notes..." />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview panel */}
          <div className="space-y-4">
            <motion.div
              key={JSON.stringify(preview)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="sticky top-6">
                <CardHeader className="pb-3 flex flex-row items-center gap-2">
                  <Calculator className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Live Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedTenant && preview ? (
                    <>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Monthly Rent</span>
                          <span className="font-medium">{formatCurrency(formValues.roomRentUsd ?? 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Water ({preview.waterUsage} {t('unit_kib')})</span>
                          <span className="font-medium">{preview.waterCostRiel.toLocaleString()} ៛</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Electric ({preview.electricUsage} {t('unit_kw')})</span>
                          <span className="font-medium">{preview.electricCostRiel.toLocaleString()} ៛</span>
                        </div>
                        {(formValues.outstandingDebtUsd ?? 0) > 0 && (
                          <div className="flex justify-between text-red-600">
                            <span>Outstanding Debt</span>
                            <span>{formatCurrency(formValues.outstandingDebtUsd ?? 0)}</span>
                          </div>
                        )}
                        {(formValues.lateDays ?? 0) > 0 && (
                          <div className="flex justify-between text-orange-600">
                            <span>Late Penalty ({formValues.lateDays}d)</span>
                            <span>{formatCurrency(preview.latePenaltyUsd)}</span>
                          </div>
                        )}
                        {(formValues.discountUsd ?? 0) > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Discount</span>
                            <span>-{formatCurrency(formValues.discountUsd ?? 0)}</span>
                          </div>
                        )}
                      </div>

                      <Separator />

                      <div className="space-y-1">
                        <div className="flex justify-between text-base font-bold">
                          <span>Total (USD)</span>
                          <span className="text-primary">{formatCurrency(preview.totalUsd)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Total (KHR)</span>
                          <span>{Math.round(preview.totalRiel).toLocaleString()} ៛</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Rate: 1 USD = {xRate.toLocaleString()} ៛</p>
                      </div>

                      <Button type="submit" className="w-full" loading={loading}>
                        <Save className="w-4 h-4 mr-2" />{isEdit ? 'Save Changes' : 'Create Billing'}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Select a tenant to preview calculation
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Exchange rate info */}
            <Card className="bg-muted/30">
              <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
                <p><span className="font-medium">Exchange rate:</span> {parseFloat(settings.exchange_rate ?? '4100').toLocaleString()} ៛/USD</p>
                <p><span className="font-medium">Water rate:</span> {parseFloat(settings.water_rate_riel ?? '2000').toLocaleString()} ៛/{t('unit_kib')}</p>
                <p><span className="font-medium">Electric rate:</span> {parseFloat(settings.electric_rate_riel ?? '720').toLocaleString()} ៛/{t('unit_kw')}</p>
                <p><span className="font-medium">Late penalty:</span> ${parseFloat(settings.late_penalty_usd ?? '1')}/day</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
