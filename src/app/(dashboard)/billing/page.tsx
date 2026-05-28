import { getBillingsList } from '@/lib/cached-queries'
import { readPromisesForBillings } from '@/lib/promise-history'
import { BillingListClient } from './billing-list-client'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const billings = await getBillingsList()

  // Promise dates live in the Setting table, outside the billings cache. Load
  // them here (the page is force-dynamic) so the inline badges stay fresh.
  const unpaidIds = billings.filter((b) => b.paymentStatus !== 'paid').map((b) => b.id)
  const promises = await readPromisesForBillings(unpaidIds)

  const withPromises = billings.map((b) => {
    const rec = promises.get(b.id)
    return { ...b, promiseDate: rec?.current ?? null, promiseSetAt: rec?.currentSetAt ?? null }
  })

  return <BillingListClient billings={withPromises} />
}
