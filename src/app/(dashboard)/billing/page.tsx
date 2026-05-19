import { getBillingsList } from '@/lib/cached-queries'
import { BillingListClient } from './billing-list-client'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const billings = await getBillingsList()
  return <BillingListClient billings={billings} />
}
