import { getInvoicesList } from '@/lib/cached-queries'
import { InvoicesClient } from './invoices-client'

export default async function InvoicesPage() {
  const invoices = await getInvoicesList()
  return <InvoicesClient invoices={invoices} />
}
