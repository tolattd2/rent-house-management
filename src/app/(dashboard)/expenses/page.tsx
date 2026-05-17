import { db } from '@/lib/db'
import { ExpensesClient } from './expenses-client'

async function getExpenses() {
  return db.expense.findMany({
    include: {
      room: { select: { id: true, roomNumber: true, branch: true } },
      maintenance: { select: { id: true, title: true } },
    },
    orderBy: { expenseDate: 'desc' },
  })
}

async function getRooms() {
  return db.room.findMany({
    select: { id: true, roomNumber: true, branch: true },
    orderBy: { roomNumber: 'asc' },
  })
}

export default async function ExpensesPage() {
  const [expenses, rooms] = await Promise.all([getExpenses(), getRooms()])
  return <ExpensesClient expenses={expenses} rooms={rooms} />
}
