'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Download, MessageSquare, CalendarClock } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { InvoiceCard, type InvoiceCardData } from '@/components/invoices/invoice-card'
import { PromiseDialog } from '@/components/invoices/promise-dialog'

interface Props {
  billing: {
    id: string; billingMonth: string; roomRentUsd: number
    prevWaterReading: number; currWaterReading: number
    waterUsage: number; waterCostRiel: number
    prevElectricReading: number; currElectricReading: number
    electricUsage: number; electricCostRiel: number
    outstandingDebtUsd: number; lateDays: number; latePenaltyUsd: number; discountUsd: number
    totalUsd: number; totalRiel: number; exchangeRate: number
    paymentStatus: string; paymentDate: string
    payments: Array<{ id: string; amountUsd: number; paymentMethod: string; createdAt: Date }>
    tenant: {
      id: string; fullName: string; phone: string; phonesExtra: string[]; nationalId: string; occupation: string; payDay: number; room: {
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
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [sending, setSending] = useState<string | null>(null)
  const [showPromise, setShowPromise] = useState(false)
  const xRate = billing.exchangeRate || parseFloat(settings.exchange_rate ?? '4100')

  const cardData: InvoiceCardData = {
    invoiceNumber: invoice.invoiceNumber,
    billingMonth: billing.billingMonth,
    roomRentUsd: billing.roomRentUsd,
    prevWaterReading: billing.prevWaterReading,
    currWaterReading: billing.currWaterReading,
    waterUsage: billing.waterUsage,
    waterCostRiel: billing.waterCostRiel,
    prevElectricReading: billing.prevElectricReading,
    currElectricReading: billing.currElectricReading,
    electricUsage: billing.electricUsage,
    electricCostRiel: billing.electricCostRiel,
    outstandingDebtUsd: billing.outstandingDebtUsd,
    lateDays: billing.lateDays,
    latePenaltyUsd: billing.latePenaltyUsd,
    discountUsd: billing.discountUsd,
    totalUsd: billing.totalUsd,
    totalRiel: billing.totalRiel,
    paymentStatus: billing.paymentStatus,
    payDay: billing.tenant?.payDay,
    tenant: billing.tenant ? { fullName: billing.tenant.fullName, phone: billing.tenant.phone, phonesExtra: billing.tenant.phonesExtra } : null,
    room: billing.room ? { roomNumber: billing.room.roomNumber, branch: billing.room.branch ?? null } : null,
  }

  const handlePrint = () => window.print()

  const handleSendTelegram = async () => {
    setSending('telegram')
    const res = await fetch(`/api/invoices/${billing.id}/send-telegram`, { method: 'POST' })
    const data = await res.json()
    toast(data.ok ? { title: 'Sent via Telegram!' } : { title: 'Error', description: data.error, variant: 'destructive' })
    setSending(null)
  }

  return (
    <div className="animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-2 no-print mb-4">
        <Link href="/billing">
          <Button variant="ghost" size="sm" className="h-10">
            <ArrowLeft className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">{t('back')}</span>
          </Button>
        </Link>
        <div className="flex-1" />
        {isAdmin && (
          <Button variant="outline" size="sm" className="h-10" onClick={() => setShowPromise(true)}>
            <CalendarClock className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Promise to Pay</span>
          </Button>
        )}
        {isAdmin && (
          <Button variant="outline" size="sm" className="h-10" onClick={handleSendTelegram} disabled={sending === 'telegram'}>
            <MessageSquare className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{invoice.sentTelegram ? t('invoice_resend_telegram') : t('invoice_send_telegram')}</span>
          </Button>
        )}
        <Button className="h-10" onClick={handlePrint}>
          <Download className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('invoice_print')}</span>
        </Button>
      </div>

      {showPromise && (
        <PromiseDialog billingId={billing.id} onClose={() => setShowPromise(false)} />
      )}

      {/* Single landscape A4 page — same invoice design as batch print, scaled up */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          main > div { padding: 0 !important; }
        }
      `}</style>
      <div className="overflow-auto">
        <div
          className="bg-white shadow-xl print:shadow-none"
          style={{ width: '297mm', height: '210mm', overflow: 'hidden' }}
        >
          <div style={{ transform: 'scale(2)', transformOrigin: 'top left', width: '148.5mm', height: '105mm' }}>
            <InvoiceCard data={cardData} settings={settings} xRate={xRate} />
          </div>
        </div>
      </div>
    </div>
  )
}
