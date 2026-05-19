'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Receipt, CreditCard, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { PaymentDialog } from '@/components/billing/payment-dialog'
import { formatCurrency, formatDate, roomLabel } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'

interface Billing {
  id: string; billingMonth: string; roomRentUsd: number
  prevWaterReading: number; currWaterReading: number; waterUsage: number; waterCostRiel: number
  prevElectricReading: number; currElectricReading: number; electricUsage: number; electricCostRiel: number
  outstandingDebtUsd: number; lateDays: number; latePenaltyUsd: number; discountUsd: number
  totalUsd: number; totalRiel: number; exchangeRate: number
  paymentStatus: string; paymentDate: string; notes: string; createdAt: Date
  tenant: { id: string; fullName: string; phone: string } | null
  room: { id: string; roomNumber: string; branch?: string } | null
  payments: Array<{
    id: string; amountUsd: number; amountRiel: number; paymentMethod: string
    transactionRef: string; createdAt: Date
    receivedBy: { id: string; name: string } | null
  }>
}

export function BillingDetailClient({ billing }: { billing: Billing }) {
  const router = useRouter()
  const { t } = useLanguage()
  const [showPay, setShowPay] = useState(false)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()

  const totalPaid = billing.payments.reduce((s, p) => s + p.amountUsd, 0)
  const balance = Math.max(0, billing.totalUsd - totalPaid)

  const handleDelete = () => {
    triggerDelete({
      itemName: `${billing.billingMonth} — ${billing.tenant?.fullName ?? ''}`,
      onExecute: () => fetch(`/api/billing/${billing.id}`, { method: 'DELETE' }).then((r) => r.json()),
      onSuccess: () => router.push('/billing'),
    })
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/billing"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />{t('back')}</Button></Link>
        <div className="flex-1" />
        {billing.paymentStatus !== 'paid' && (
          <Button onClick={() => setShowPay(true)}>
            <CreditCard className="w-4 h-4 mr-2" />{t('record_payment')}
          </Button>
        )}
        <Link href={`/invoices/${billing.id}`}>
          <Button variant="outline"><Receipt className="w-4 h-4 mr-2" />{t('invoices_title')}</Button>
        </Link>
        <Button variant="outline" onClick={handleDelete} className="text-destructive border-destructive/30 hover:bg-destructive/10">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Header info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">{billing.billingMonth} — {t('billing_title')}</h1>
              <p className="text-muted-foreground">
                <Link href={`/tenants/${billing.tenant?.id}`} className="hover:text-primary font-medium">
                  {billing.tenant?.fullName}
                </Link> · {t('room')} {billing.room ? roomLabel(billing.room) : '—'}
              </p>
            </div>
            <Badge variant={billing.paymentStatus === 'paid' ? 'success' : billing.paymentStatus === 'partial' ? 'warning' : 'error'}
              className="capitalize text-sm px-3 py-1">
              {t(billing.paymentStatus === 'paid' ? 'status_paid' : billing.paymentStatus === 'partial' ? 'status_partial' : 'status_unpaid')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('billing_charges')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t('monthly_rent')}</span><span className="font-medium">{formatCurrency(billing.roomRentUsd)}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('water')} ({billing.waterUsage} {t('unit_kib')})</span>
              <span className="font-medium">{billing.waterCostRiel.toLocaleString()} ៛</span>
            </div>
            <div className="flex justify-between pl-4 text-xs text-muted-foreground">
              <span>{billing.prevWaterReading} → {billing.currWaterReading}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('electric')} ({billing.electricUsage} {t('unit_kw')})</span>
              <span className="font-medium">{billing.electricCostRiel.toLocaleString()} ៛</span>
            </div>
            <div className="flex justify-between pl-4 text-xs text-muted-foreground">
              <span>{billing.prevElectricReading} → {billing.currElectricReading}</span>
            </div>
            {billing.outstandingDebtUsd > 0 && (
              <div className="flex justify-between text-red-600"><span>{t('outstanding_debt')}</span><span>{formatCurrency(billing.outstandingDebtUsd)}</span></div>
            )}
            {billing.lateDays > 0 && (
              <div className="flex justify-between text-orange-600"><span>{t('late_penalty')} ({billing.lateDays}d)</span><span>{formatCurrency(billing.latePenaltyUsd)}</span></div>
            )}
            {billing.discountUsd > 0 && (
              <div className="flex justify-between text-green-600"><span>{t('discount')}</span><span>-{formatCurrency(billing.discountUsd)}</span></div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-base">
              <span>{t('billing_total_usd')}</span><span className="text-primary">{formatCurrency(billing.totalUsd)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{t('billing_total_khr')}</span><span>{Math.round(billing.totalRiel).toLocaleString()} ៛</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('invoice_exchange_rate')}: 1 USD = {billing.exchangeRate.toLocaleString()} ៛</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('billing_payment_status_card')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('total_charged')}</span><span className="font-medium">{formatCurrency(billing.totalUsd)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('total_paid')}</span><span className="text-green-600 font-medium">{formatCurrency(totalPaid)}</span></div>
            <div className="flex justify-between text-sm font-bold"><span>{t('balance_due')}</span><span className={balance > 0 ? 'text-red-600' : 'text-green-600'}>{formatCurrency(balance)}</span></div>

            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${billing.totalUsd > 0 ? Math.min(100, (totalPaid / billing.totalUsd) * 100) : 0}%` }} />
            </div>

            {billing.paymentDate && (
              <p className="text-xs text-muted-foreground">{t('paid_on')} {formatDate(billing.paymentDate)}</p>
            )}

            {billing.notes && (
              <div className="p-3 bg-muted/50 rounded-lg mt-2">
                <p className="text-xs text-muted-foreground">{t('notes')}: {billing.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payments table */}
      {billing.payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{t('payment_history')}</CardTitle></CardHeader>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('date')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('method')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('billing_pay_amount_usd')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('billing_pay_amount_khr')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('received_by')}</th>
                </tr>
              </thead>
              <tbody>
                {billing.payments.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">{new Date(p.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">{p.paymentMethod.replace('_', ' ')}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-green-600">{formatCurrency(p.amountUsd)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{Math.round(p.amountRiel).toLocaleString()} ៛</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.receivedBy?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DeleteConfirmDialog
        open={dialogState.open}
        itemName={dialogState.itemName}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
      />

      {showPay && (
        <PaymentDialog
          billing={{ ...billing, tenant: billing.tenant ? { fullName: billing.tenant.fullName } : null, room: billing.room, payments: billing.payments }}
          onClose={() => setShowPay(false)}
          onSave={() => { setShowPay(false); router.refresh() }}
        />
      )}
    </div>
  )
}
