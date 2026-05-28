import { unstable_cache } from 'next/cache'
import { db } from './db'
import { TAGS } from './cached-queries'

export class PeriodLockedError extends Error {
  readonly month: string
  constructor(month: string) {
    super(`Period ${month} is locked`)
    this.name = 'PeriodLockedError'
    this.month = month
  }
}

export const getLockedMonths = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db.periodLock.findMany({
      select: { month: true },
      orderBy: { month: 'asc' },
    })
    return rows.map((r) => r.month)
  },
  ['period-locks-list'],
  { tags: [TAGS.period_locks], revalidate: 300 },
)

export async function getLockedMonthsDetailed() {
  return db.periodLock.findMany({
    include: { lockedBy: { select: { id: true, name: true } } },
    orderBy: { month: 'asc' },
  })
}

export async function isPeriodLocked(month: string): Promise<boolean> {
  const locked = await getLockedMonths()
  return locked.includes(month)
}

export async function assertPeriodOpen(month: string): Promise<void> {
  if (await isPeriodLocked(month)) throw new PeriodLockedError(month)
}
