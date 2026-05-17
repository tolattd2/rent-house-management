'use client'

import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Download, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatCurrency, formatDate, formatMonth, roomLabel } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'

interface Props {
  billing: {
    id: string; billingMonth: string; roomRentUsd: number
    waterUsage: number; waterCostRiel: number; electricUsage: number; electricCostRiel: number
    outstandingDebtUsd: number; lateDays: number; latePenaltyUsd: number; discountUsd: number
    totalUsd: number; totalRiel: number; exchangeRate: number
    paymentStatus: string; paymentDate: string
    payments: Array<{ id: string; amountUsd: number; paymentMethod: string; createdAt: Date }>
    tenant: {
      id: string; fullName: string; phone: string; nationalId: string; occupation: string; room: {
        id: string; roomNumber: string; branch?: string; roomType: string
      } | null
    } | null
    room: { id: string; roomNumber: string; branch?: string } | null
  }
  invoice: { id: string; invoiceNumber: string; sentEmail: boolean; sentTelegram: boolean }
  settings: Record<string, string>
}

export function InvoiceClient({ billing, invoice, settings }: Props) {
  const { t } = useLanguage()
  const printRef = useRef<HTMLDivElement>(null)
  const [sending, setSending] = useState<string | null>(null)
  const xRate = billing.exchangeRate || parseFloat(settings.exchange_rate ?? '4100')
  const totalPaid = billing.payments.reduce((s, p) => s + p.amountUsd, 0)
  const balance = Math.max(0, billing.totalUsd - totalPaid)

  const handlePrint = () => window.print()

  const handleSendTelegram = async () => {
    setSending('telegram')
    const res = await fetch(`/api/invoices/${billing.id}/send-telegram`, { method: 'POST' })
    const data = await res.json()
    toast(data.ok ? { title: 'Sent via Telegram!' } : { title: 'Error', description: data.error, variant: 'destructive' })
    setSending(null)
  }

  return (
    <div className="space-y-4 animate-fade-in max-w-3xl">
      {/* Toolbar */}
      <div className="flex items-center gap-3 no-print">
        <Link href="/billing"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />{t('back')}</Button></Link>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleSendTelegram} disabled={sending === 'telegram'}>
          <MessageSquare className="w-4 h-4 mr-2" />
          {invoice.sentTelegram ? t('invoice_resend_telegram') : t('invoice_send_telegram')}
        </Button>
        <Button onClick={handlePrint}>
          <Download className="w-4 h-4 mr-2" />{t('invoice_print')}
        </Button>
      </div>

      {/* Invoice document */}
      <motion.div
        ref={printRef}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white text-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-200 print:shadow-none print:rounded-none"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-8 py-6 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold">{settings.company_name || 'Takmao Rental'}</h1>
              <p className="text-blue-200 text-sm">{settings.company_address || 'Phnom Penh, Cambodia'}</p>
              {settings.company_phone && <p className="text-blue-200 text-sm">{settings.company_phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-blue-200 text-xs uppercase tracking-wider">{t('invoices_title')}</p>
              <p className="text-xl font-mono font-bold">{invoice.invoiceNumber}</p>
              <p className="text-blue-200 text-sm">{formatMonth(billing.billingMonth)}</p>
            </div>
          </div>
        </div>

        {/* Tenant info */}
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t('invoice_bill_to')}</p>
              <p className="font-bold text-lg">{billing.tenant?.fullName}</p>
              <p className="text-slate-600 text-sm print:hidden">{billing.tenant?.phone}</p>
              {billing.tenant?.occupation && <p className="text-slate-500 text-sm print:hidden">{billing.tenant.occupation}</p>}
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t('invoice_room_details')}</p>
              <p className="font-bold">{t('room')} {billing.room ? roomLabel(billing.room) : '—'}</p>
              <div className="mt-2">
                <Badge className={billing.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} variant="outline">
                  {billing.paymentStatus === 'paid'
                    ? `${t('paid_on')} ${formatDate(billing.paymentDate)}`
                    : t('invoice_unpaid')}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="px-8 py-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left py-2 font-semibold text-slate-600">{t('invoice_description')}</th>
                <th className="text-right py-2 font-semibold text-slate-600">{t('invoice_qty')}</th>
                <th className="text-right py-2 font-semibold text-slate-600">{t('invoice_rate')}</th>
                <th className="text-right py-2 font-semibold text-slate-600">{t('amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3">{t('invoice_monthly_rent')} — {formatMonth(billing.billingMonth)}</td>
                <td className="py-3 text-right">1 {t('billing_col_month')}</td>
                <td className="py-3 text-right">{formatCurrency(billing.roomRentUsd)}</td>
                <td className="py-3 text-right font-medium">{formatCurrency(billing.roomRentUsd)}</td>
              </tr>
              <tr>
                <td className="py-3">
                  {t('invoice_water_usage')}
                  <p className="text-xs text-slate-400">({billing.waterUsage} {t('unit_kib')} × {(billing.waterUsage > 0 ? billing.waterCostRiel / billing.waterUsage : 0).toLocaleString()} ៛)</p>
                </td>
                <td className="py-3 text-right">{billing.waterUsage} {t('unit_kib')}</td>
                <td className="py-3 text-right">{billing.waterCostRiel.toLocaleString()} ៛</td>
                <td className="py-3 text-right font-medium">{formatCurrency(billing.waterCostRiel / xRate)}</td>
              </tr>
              <tr>
                <td className="py-3">
                  {t('invoice_electricity')}
                  <p className="text-xs text-slate-400">({billing.electricUsage} {t('unit_kw')} × {(billing.electricUsage > 0 ? billing.electricCostRiel / billing.electricUsage : 0).toLocaleString()} ៛)</p>
                </td>
                <td className="py-3 text-right">{billing.electricUsage} {t('unit_kw')}</td>
                <td className="py-3 text-right">{billing.electricCostRiel.toLocaleString()} ៛</td>
                <td className="py-3 text-right font-medium">{formatCurrency(billing.electricCostRiel / xRate)}</td>
              </tr>
              {billing.outstandingDebtUsd > 0 && (
                <tr className="text-red-600">
                  <td className="py-3">{t('invoice_outstanding_debt')}</td>
                  <td className="py-3 text-right">—</td>
                  <td className="py-3 text-right">—</td>
                  <td className="py-3 text-right font-medium">{formatCurrency(billing.outstandingDebtUsd)}</td>
                </tr>
              )}
              {billing.lateDays > 0 && (
                <tr className="text-orange-600">
                  <td className="py-3">{t('invoice_late_penalty')} ({billing.lateDays} days)</td>
                  <td className="py-3 text-right">{billing.lateDays} days</td>
                  <td className="py-3 text-right">${parseFloat(settings.late_penalty_usd ?? '1')}/day</td>
                  <td className="py-3 text-right font-medium">{formatCurrency(billing.latePenaltyUsd)}</td>
                </tr>
              )}
              {billing.discountUsd > 0 && (
                <tr className="text-green-600">
                  <td className="py-3">{t('discount')}</td>
                  <td className="py-3 text-right">—</td>
                  <td className="py-3 text-right">—</td>
                  <td className="py-3 text-right font-medium">-{formatCurrency(billing.discountUsd)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-4 pt-4 border-t-2 border-slate-200">
            <div className="flex justify-end">
              <div className="w-72 space-y-2 text-sm">
                {totalPaid > 0 && (
                  <div className="print:hidden">
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t('invoice_subtotal')}</span>
                      <span>{formatCurrency(billing.totalUsd)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>{t('invoice_payments_received')}</span>
                      <span>-{formatCurrency(totalPaid)}</span>
                    </div>
                    <Separator />
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold">
                  <span>{t('invoice_total_due_usd')}</span>
                  <span className="text-blue-700">{formatCurrency(balance > 0 ? balance : billing.totalUsd)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{t('invoice_total_due_khr')}</span>
                  <span>{Math.round(billing.totalRiel).toLocaleString()} ៛</span>
                </div>
                <p className="text-xs text-slate-400">{t('invoice_exchange_rate')}: 1 USD = {xRate.toLocaleString()} ៛</p>
              </div>
            </div>
          </div>

          {/* Payments */}
          {billing.payments.length > 0 && (
            <div className="mt-6 print:hidden">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">{t('payment_history')}</p>
              <div className="space-y-1">
                {billing.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                    <span className="text-slate-600">{new Date(p.createdAt).toLocaleDateString()} — {p.paymentMethod.replace('_', ' ')}</span>
                    <span className="font-medium text-green-700">{formatCurrency(p.amountUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-400">
          <p>{t('invoice_footer')}</p>
          <p className="mt-1">{settings.company_name || 'Takmao Rental'} · {settings.company_phone || ''} · {settings.company_address || ''}</p>
        </div>
      </motion.div>
    </div>
  )
}
