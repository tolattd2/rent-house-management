import { getExpensesList, getExpensesRoomsLookup } from '@/lib/cached-queries'
import { ExpensesClient } from './expenses-client'

export default async function ExpensesPage() {
  const [expenses, rooms] = await Promise.all([getExpensesList(), getExpensesRoomsLookup()])
  return <ExpensesClient expenses={expenses} rooms={rooms} />
}
