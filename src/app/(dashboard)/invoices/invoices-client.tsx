'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useLanguage } from '@/contexts/language-context'

interface Invoice {
  id: string
  invoiceNumber: string
  billingId: string
  tenant: { id: string; fullName: string } | null
  billing: { billingMonth: string; totalUsd: number; paymentStatus: string } | null
}

interface Props {
  invoices: Invoice[]
}

export function InvoicesClient({ invoices }: Props) {
  const { t } = useLanguage()

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">{t('nav_invoices')}</h1>
        <p className="text-muted-foreground text-sm">{invoices.length} {t('invoices_generated')}</p>
      </div>
      <Card>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('invoices_col_invoice')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('tenant')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{t('billing_col_month')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('amount')}</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">{t('status')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    <Link href={`/tenants/${inv.tenant?.id}`} className="hover:text-primary font-medium">
                      {inv.tenant?.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{inv.billing?.billingMonth}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(inv.billing?.totalUsd ?? 0)}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={inv.billing?.paymentStatus === 'paid' ? 'success' : 'error'} className="capitalize">
                      {inv.billing?.paymentStatus === 'paid' ? t('status_paid') : t('status_unpaid')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/invoices/${inv.billingId}`} className="text-primary text-xs hover:underline">
                      {t('view')}
                    </Link>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">{t('invoices_empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
