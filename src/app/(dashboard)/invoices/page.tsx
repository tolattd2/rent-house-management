import { getInvoicesList } from '@/lib/cached-queries'
import { InvoicesClient } from './invoices-client'

export const dynamic = 'force-dynamic'

export default async function InvoicesPage() {
  const invoices = await getInvoicesList()
  return <InvoicesClient invoices={invoices} />
}
