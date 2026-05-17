import { db } from '@/lib/db'
import { DashboardClient } from './dashboard-client'

async function getDashboardData() {
  try {
    const [rooms, tenants, billings, expenses, unpaidBillings] = await Promise.all([
      db.room.findMany({
        select: { id: true, branch: true, status: true },
      }),
      db.tenant.findMany({
        select: { id: true, status: true, roomId: true },
      }),
      db.billing.findMany({
        select: {
          id: true, billingMonth: true, totalUsd: true,
          paymentStatus: true,
          room: { select: { branch: true } },
          payments: { select: { amountUsd: true } },
        },
      }),
      db.expense.findMany({
        select: {
          id: true, amountUsd: true, expenseDate: true,
          room: { select: { branch: true } },
        },
      }),
      db.billing.findMany({
        where: { paymentStatus: { in: ['unpaid', 'partial'] } },
        select: {
          id: true, billingMonth: true, totalUsd: true, totalRiel: true, paymentStatus: true,
          tenant: { select: { id: true, fullName: true, phone: true } },
          room: { select: { id: true, roomNumber: true, branch: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])
    return { rooms, tenants, billings, expenses, unpaidBillings }
  } catch {
    return { rooms: [], tenants: [], billings: [], expenses: [], unpaidBillings: [] }
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <DashboardClient {...data} />
}
