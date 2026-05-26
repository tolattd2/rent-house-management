'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calculator, Save, Zap, Droplets, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { calculateBilling } from '@/lib/billing'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useBack } from '@/hooks/use-back'
import { useLanguage } from '@/contexts/language-context'
import { useRoomLabel, useBranches } from '@/contexts/branches-context'
import { resolveBranchRates } from '@/lib/branches'

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
  notices: Array<{ id: string; type: string; message: string; expectedDate: string; createdAt: string | Date }>
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
  /** "tenantId|billingMonth" keys that already have a bill. */
  billedKeys?: string[]
}

export function CreateBillingClient({ tenants, settings, preselectedTenantId, editBilling, billedKeys }: Props) {
  const router = useRouter()
  const goBack = useBack('/billing')
  const { t } = useLanguage()
  const roomLabel = useRoomLabel()
  const branches = useBranches()
  const isEdit = Boolean(editBilling)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ReturnType<typeof calculateBilling> | null>(null)
  // Narrows the tenant dropdown by branch — defaults to a preselected
  // tenant's branch when arriving from a tenant page.
  const [branchFilter, setBranchFilter] = useState<string>(
    tenants.find((tn) => tn.id === preselectedTenantId)?.room?.branch ?? '',
  )
  const billedSet = useMemo(() => new Set(billedKeys ?? []), [billedKeys])

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
  // Rates configured for the selected tenant's branch (falls back to global/defaults).
  const rates = resolveBranchRates(settings, branches, selectedTenant?.room?.branch)

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
      resolveBranchRates(settings, branches, selectedTenant.room.branch),
    )
    setPreview(calc)
  }, [
    formValues.prevWaterReading, formValues.currWaterReading,
    formValues.prevElectricReading, formValues.currElectricReading,
    formValues.roomRentUsd, formValues.outstandingDebtUsd,
    formValues.lateDays, formValues.discountUsd,
    selectedTenant, settings, branches
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

  const xRate = parseFloat(rates.exchange_rate)

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={goBack}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? 'Edit Billing' : 'Create Billing'}</h1>
          <p className="text-muted-foreground text-sm">
            {isEdit ? 'Update meter readings and amounts' : 'Enter meter readings and calculate'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {selectedTenant && selectedTenant.notices.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-900/70 bg-amber-50 dark:bg-amber-950/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h3 className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                {t('notice_billing_banner_title')}
              </h3>
            </div>
            <ul className="space-y-1.5">
              {selectedTenant.notices.map((n) => (
                <li key={n.id} className="text-sm text-amber-900 dark:text-amber-200 flex gap-2">
                  <span className="font-semibold whitespace-nowrap">
                    {t(`notice_type_${n.type}` as Parameters<typeof t>[0])}:
                  </span>
                  <span className="min-w-0">
                    {n.message}
                    {n.expectedDate && (
                      <span className="font-medium"> ({t('notice_expected')}: {formatDate(n.expectedDate)})</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tenant & Month */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Tenant & Period</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {!isEdit && branches.length > 0 && (
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t('branch')} *</Label>
                    <Select
                      value={branchFilter}
                      onValueChange={(v) => { setBranchFilter(v); setValue('tenantId', '') }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('maintenance_form_branch_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((br) => (
                          <SelectItem key={br.name} value={br.name}>{br.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="col-span-2 space-y-1.5">
                  <Label>Tenant *</Label>
                  {isEdit ? (
                    <div className="h-10 px-3 flex items-center rounded-lg bg-muted/50 text-sm border border-input">
                      {selectedTenant
                        ? `${t('room')} ${selectedTenant.room ? roomLabel(selectedTenant.room) : '—'} — ${selectedTenant.fullName}`
                        : '—'}
                    </div>
                  ) : (
                    <Select
                      value={formValues.tenantId || ''}
                      onValueChange={(v) => setValue('tenantId', v)}
                      disabled={!branchFilter}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={branchFilter ? 'Select tenant...' : t('maintenance_form_room_hint')} />
                      </SelectTrigger>
                      <SelectContent>
                        {tenants
                          .filter((tenant) => tenant.room?.branch === branchFilter)
                          .map((tenant) => {
                            // Block tenants that already have a bill for the
                            // chosen month — they stay visible but unselectable.
                            const alreadyBilled = billedSet.has(`${tenant.id}|${formValues.billingMonth}`)
                            return (
                              <SelectItem key={tenant.id} value={tenant.id} disabled={alreadyBilled}>
                                {t('room')} {tenant.room ? roomLabel(tenant.room) : '—'} — {tenant.fullName}
                                {tenant.notices.length > 0 ? ' ⚠️' : ''}
                                {alreadyBilled ? ' — already billed' : ''}
                              </SelectItem>
                            )
                          })}
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
                  Rate: {parseFloat(rates.water_rate_riel).toLocaleString()} ៛/Kib
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
                  Rate: {parseFloat(rates.electric_rate_riel).toLocaleString()} ៛/{t('unit_kw')}
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
                    Penalty: ${parseFloat(rates.late_penalty_usd)}/day
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
                          <span className="font-medium text-right">
                            {formatCurrency(preview.waterCostRiel / preview.exchangeRate)}
                            <span className="block text-xs font-normal text-muted-foreground">{preview.waterCostRiel.toLocaleString()} ៛</span>
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Electric ({preview.electricUsage} {t('unit_kw')})</span>
                          <span className="font-medium text-right">
                            {formatCurrency(preview.electricCostRiel / preview.exchangeRate)}
                            <span className="block text-xs font-normal text-muted-foreground">{preview.electricCostRiel.toLocaleString()} ៛</span>
                          </span>
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
                <p><span className="font-medium">Exchange rate:</span> {parseFloat(rates.exchange_rate).toLocaleString()} ៛/USD</p>
                <p><span className="font-medium">Water rate:</span> {parseFloat(rates.water_rate_riel).toLocaleString()} ៛/{t('unit_kib')}</p>
                <p><span className="font-medium">Electric rate:</span> {parseFloat(rates.electric_rate_riel).toLocaleString()} ៛/{t('unit_kw')}</p>
                <p><span className="font-medium">Late penalty:</span> ${parseFloat(rates.late_penalty_usd)}/day</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  )
}
