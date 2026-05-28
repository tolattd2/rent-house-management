import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { readAllPromises } from '@/lib/promise-history'
import { PromisesClient, type PromiseTimelineEntry } from './promises-client'

export const dynamic = 'force-dynamic'

export default async function PromisesPage() {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'manager') redirect('/dashboard')

  const promises = await readAllPromises()
  const billingIds = [...promises.keys()]
  const billings = billingIds.length
    ? await db.billing.findMany({
        where: { id: { in: billingIds } },
        include: {
          tenant: { select: { id: true, fullName: true, phone: true } },
          room: { select: { roomNumber: true, branch: true } },
          payments: { select: { amountUsd: true } },
        },
      })
    : []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const entries: PromiseTimelineEntry[] = []
  for (const billing of billings) {
    const rec = promises.get(billing.id)
    if (!rec) continue
    const paid = billing.payments.reduce((s, p) => s + p.amountUsd, 0)
    const balanceUsd = Math.max(0, billing.totalUsd - paid)

    const base = {
      billingId: billing.id,
      tenantId: billing.tenant?.id ?? null,
      tenantName: billing.tenant?.fullName ?? '—',
      tenantPhone: billing.tenant?.phone ?? '',
      roomNumber: billing.room?.roomNumber ?? '—',
      branch: billing.room?.branch ?? '—',
      billingMonth: billing.billingMonth,
      totalUsd: billing.totalUsd,
      balanceUsd,
      paymentStatus: billing.paymentStatus,
    }

    if (rec.current) {
      const d = new Date(rec.current)
      d.setHours(0, 0, 0, 0)
      const isOverdue = !Number.isNaN(d.getTime()) && d < today && balanceUsd > 0
      entries.push({
        ...base,
        date: rec.current,
        setAt: rec.currentSetAt ?? '',
        by: null,
        isCurrent: true,
        isOverdue,
      })
    }

    for (const h of rec.history) {
      entries.push({
        ...base,
        date: h.date,
        setAt: h.setAt,
        by: h.by ?? null,
        isCurrent: false,
        isOverdue: false,
      })
    }
  }

  entries.sort((a, b) => (b.setAt || '').localeCompare(a.setAt || ''))

  return <PromisesClient entries={entries} />
}
