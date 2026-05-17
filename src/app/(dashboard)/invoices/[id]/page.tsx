import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { InvoiceClient } from './invoice-client'
import { generateInvoiceNumber } from '@/lib/utils'

async function getOrCreateInvoice(billingId: string) {
  const billing = await db.billing.findUnique({
    where: { id: billingId },
    include: {
      tenant: {
        include: {
          room: { select: { id: true, roomNumber: true, branch: true, roomType: true } },
        },
      },
      room: true,
      payments: true,
    },
  })
  if (!billing) return null

  let invoice = await db.invoice.findUnique({ where: { billingId } })
  if (!invoice) {
    const count = await db.invoice.count()
    invoice = await db.invoice.create({
      data: {
        invoiceNumber: generateInvoiceNumber(count + 1),
        tenantId: billing.tenantId,
        billingId,
      },
    })
  }

  const settings = await db.setting.findMany()
  const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

  return { billing, invoice, settings: settingsMap }
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getOrCreateInvoice(id)
  if (!data) notFound()
  return <InvoiceClient {...data} />
}
