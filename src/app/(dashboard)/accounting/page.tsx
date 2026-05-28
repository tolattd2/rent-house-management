import { getAccountingData } from '@/lib/cached-queries'
import { AccountingClient } from './accounting-client'

export const dynamic = 'force-dynamic'

export default async function AccountingPage() {
  const { billings, expenses, tenants, locks } = await getAccountingData()
  return <AccountingClient billings={billings} expenses={expenses} tenants={tenants} locks={locks} />
}
