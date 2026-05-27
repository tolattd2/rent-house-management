import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { getExpensesList, getExpensesRoomsLookup } from '@/lib/cached-queries'
import { ExpensesClient } from './expenses-client'

export const dynamic = 'force-dynamic'

/**
 * One-shot backfill: any completed maintenance record with a repair fee that
 * doesn't already have a linked Expense gets one created. Existing records
 * predate the auto-create logic on the maintenance PATCH endpoint, so without
 * this they'd never appear as expenses. The query is idempotent — a 1:1 join
 * on Maintenance.expense means once we create the expense, the orphan list
 * drops to zero and subsequent visits short-circuit.
 */
async function backfillMaintenanceExpenses(): Promise<boolean> {
  const orphans = await db.maintenance.findMany({
    where: { status: 'completed', repairFeeUsd: { gt: 0 }, expense: null },
    select: { id: true, title: true, repairFeeUsd: true, completedDate: true, reportedDate: true, roomId: true },
  })
  if (orphans.length === 0) return false
  await db.$transaction(
    orphans.map((m) =>
      db.expense.create({
        data: {
          title: m.title,
          category: 'maintenance',
          amountUsd: m.repairFeeUsd,
          expenseDate: m.completedDate || m.reportedDate,
          notes: `Auto-created from maintenance #${m.id}`,
          roomId: m.roomId,
          maintenanceId: m.id,
        },
      }),
    ),
  )
  return true
}

export default async function ExpensesPage() {
  const created = await backfillMaintenanceExpenses()
  if (created) invalidate('expenses')
  const [expenses, rooms] = await Promise.all([getExpensesList(), getExpensesRoomsLookup()])
  return <ExpensesClient expenses={expenses} rooms={rooms} />
}
