import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
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
  // Allocate the next number from the highest existing one for this year (not
  // `count + 1`, which collides once any invoice has been deleted — leaving gaps).
  // Retry on P2002 to absorb the rare race (two people opening the same invoice,
  // or two new invoices grabbing the same number concurrently).
  for (let attempt = 0; !invoice && attempt < 10; attempt++) {
    const prefix = `INV-${new Date().getFullYear()}-`
    const last = await db.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    })
    const lastSeq = last ? Number(last.invoiceNumber.slice(prefix.length)) || 0 : 0
    try {
      invoice = await db.invoice.create({
        data: {
          invoiceNumber: generateInvoiceNumber(lastSeq + 1),
          tenantId: billing.tenantId,
          billingId,
        },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Someone else won the race — re-fetch (it may now exist) and retry.
        invoice = await db.invoice.findUnique({ where: { billingId } })
        continue
      }
      throw e
    }
  }
  if (!invoice) throw new Error('Could not allocate a unique invoice number')

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
