'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'

const schema = z.object({
  amountUsd: z.coerce.number().min(0.01, 'Amount must be > 0'),
  paymentMethod: z.enum(['Cash', 'ABA_Pay', 'Wing', 'TrueMoney', 'Bank_Transfer', 'Other']),
  transactionRef: z.string().default(''),
  notes: z.string().default(''),
})

type FormData = z.infer<typeof schema>

interface Props {
  billing: {
    id: string
    totalUsd: number
    totalRiel: number
    billingMonth: string
    tenant: { fullName: string } | null
    room: { roomNumber: string } | null
    payments: Array<{ amountUsd: number }>
  }
  onClose: () => void
  onSave: () => void
}

export function PaymentDialog({ billing, onClose, onSave }: Props) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const totalPaid = billing.payments.reduce((s, p) => s + p.amountUsd, 0)
  const balance = Math.max(0, billing.totalUsd - totalPaid)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { amountUsd: balance, paymentMethod: 'Cash', transactionRef: '', notes: '' },
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    const xRate = billing.totalRiel / billing.totalUsd
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, billingId: billing.id, amountRiel: data.amountUsd * (xRate || 4100) }),
    })
    const result = await res.json()
    if (result.ok) {
      toast({ title: t('payment_recorded') })
      onSave()
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' })
    }
    setLoading(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('record_payment')}</DialogTitle>
        </DialogHeader>

        <div className="p-3 bg-muted/50 rounded-lg text-sm mb-2">
          <p><span className="text-muted-foreground">{t('payment_tenant_label')}:</span> <span className="font-medium">{billing.tenant?.fullName}</span></p>
          <p><span className="text-muted-foreground">{t('month')}:</span> {billing.billingMonth} · {t('room')} {billing.room?.roomNumber}</p>
          <div className="mt-2 flex justify-between">
            <span className="text-muted-foreground">{t('payment_total_due')}:</span>
            <span className="font-bold">{formatCurrency(billing.totalUsd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('payment_already_paid')}:</span>
            <span className="text-green-600 font-medium">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="flex justify-between border-t border-border mt-1 pt-1">
            <span className="font-medium">{t('payment_balance')}:</span>
            <span className="font-bold text-red-600">{formatCurrency(balance)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('payment_amount_usd')} *</Label>
            <Input type="number" step="0.01" {...register('amountUsd')} />
            {errors.amountUsd && <p className="text-xs text-destructive">{errors.amountUsd.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t('payment_method_label')}</Label>
            <Select onValueChange={(v) => setValue('paymentMethod', v as FormData['paymentMethod'])} defaultValue="Cash">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">{t('payment_cash')}</SelectItem>
                <SelectItem value="ABA_Pay">{t('payment_aba')}</SelectItem>
                <SelectItem value="Wing">{t('payment_wing')}</SelectItem>
                <SelectItem value="TrueMoney">{t('payment_truemoney')}</SelectItem>
                <SelectItem value="Bank_Transfer">{t('payment_bank')}</SelectItem>
                <SelectItem value="Other">{t('expense_cat_other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('payment_ref_label')}</Label>
            <Input {...register('transactionRef')} placeholder={t('payment_ref_placeholder')} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('notes')}</Label>
            <Textarea {...register('notes')} rows={2} />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" loading={loading} className="bg-green-600 hover:bg-green-700">
              {t('record_payment')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
