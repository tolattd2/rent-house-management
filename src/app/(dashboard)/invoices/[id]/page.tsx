import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { InvoiceClient } from './invoice-client'
import { nextInvoiceNumber, isUniqueViolation } from '@/lib/invoice-number'

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

  // Create-on-first-view. The invoice number is derived from the highest
  // existing number for the year (not a row count), so deletions that shrink
  // the count can't make us regenerate a number that already exists. A unique
  // collision can still happen under concurrent opens, so retry a few times —
  // re-checking the billing's existing invoice each pass keeps it idempotent.
  let invoice = await db.invoice.findUnique({ where: { billingId } })
  for (let attempt = 0; !invoice && attempt < 5; attempt++) {
    try {
      invoice = await db.invoice.create({
        data: {
          invoiceNumber: await nextInvoiceNumber(),
          tenantId: billing.tenantId,
          billingId,
        },
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      // Either another request created this billing's invoice, or our number
      // raced another insert. Re-read; if it now exists we're done, else retry.
      invoice = await db.invoice.findUnique({ where: { billingId } })
    }
  }
  if (!invoice) throw new Error('Could not allocate an invoice number')

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
