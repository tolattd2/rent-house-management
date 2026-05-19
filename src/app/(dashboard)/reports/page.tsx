import { getReportsData } from '@/lib/cached-queries'
import { ReportsClient } from './reports-client'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const { billings, expenses } = await getReportsData()
  return <ReportsClient billings={billings} expenses={expenses} />
}
