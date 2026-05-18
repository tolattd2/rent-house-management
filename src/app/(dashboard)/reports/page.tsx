import { db } from '@/lib/db'
import { ReportsClient } from './reports-client'

async function getReportData() {
  const [billings, expenses] = await Promise.all([
    db.billing.findMany({
      include: {
        tenant: { select: { id: true, fullName: true } },
        room: { select: { id: true, roomNumber: true, branch: true } },
        payments: true,
      },
      orderBy: { billingMonth: 'desc' },
    }),
    db.expense.findMany({
      include: { room: { select: { id: true, roomNumber: true, branch: true } } },
      orderBy: { expenseDate: 'desc' },
    }),
  ])
  return { billings, expenses }
}

export default async function ReportsPage() {
  const { billings, expenses } = await getReportData()
  return <ReportsClient billings={billings} expenses={expenses} />
}
