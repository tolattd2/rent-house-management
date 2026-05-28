import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { readAllPromises } from '@/lib/promise-history'
import { PromisesClient, type PromiseTimelineEntry } from './promises-client'

export const dynamic = 'force-dynamic'

type FocusMode = 'all' | 'tenant' | 'billing'

export default async function PromisesPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; tenant?: string; scope?: string }>
}) {
  const session = await auth()
  const role = session?.user?.role
  if (role !== 'admin' && role !== 'manager') redirect('/dashboard')

  const { billing: billingParam, tenant: tenantParam, scope } = await searchParams

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

  const all: PromiseTimelineEntry[] = []
  for (const b of billings) {
    const rec = promises.get(b.id)
    if (!rec) continue
    const paid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
    const balanceUsd = Math.max(0, b.totalUsd - paid)
    const base = {
      billingId: b.id,
      tenantId: b.tenant?.id ?? null,
      tenantName: b.tenant?.fullName ?? '—',
      tenantPhone: b.tenant?.phone ?? '',
      roomNumber: b.room?.roomNumber ?? '—',
      branch: b.room?.branch ?? '—',
      billingMonth: b.billingMonth,
      totalUsd: b.totalUsd,
      balanceUsd,
      paymentStatus: b.paymentStatus,
    }
    if (rec.current) {
      const d = new Date(rec.current)
      d.setHours(0, 0, 0, 0)
      const isOverdue = !Number.isNaN(d.getTime()) && d < today && balanceUsd > 0
      all.push({ ...base, date: rec.current, setAt: rec.currentSetAt ?? '', by: null, isCurrent: true, isOverdue })
    }
    for (const h of rec.history) {
      all.push({ ...base, date: h.date, setAt: h.setAt, by: h.by ?? null, isCurrent: false, isOverdue: false })
    }
  }

  // Decide the focus: a single billing (the clicked month), a whole tenant's
  // history, or everything. The badge links by billing; the dialog "View"
  // button adds scope=tenant to widen to the tenant's full history.
  let mode: FocusMode = 'all'
  let tenantId: string | null = null
  let tenantName: string | null = null
  let focusMonth: string | null = null

  if (billingParam) {
    const ref = all.find((e) => e.billingId === billingParam)
    tenantId = ref?.tenantId ?? null
    tenantName = ref?.tenantName ?? null
    if (scope === 'tenant' && tenantId) {
      mode = 'tenant'
    } else {
      mode = 'billing'
      focusMonth = ref?.billingMonth ?? null
    }
  } else if (tenantParam) {
    mode = 'tenant'
    tenantId = tenantParam
    tenantName = all.find((e) => e.tenantId === tenantParam)?.tenantName ?? null
  }

  let entries = all
  if (mode === 'billing' && billingParam) entries = all.filter((e) => e.billingId === billingParam)
  else if (mode === 'tenant' && tenantId) entries = all.filter((e) => e.tenantId === tenantId)

  entries.sort((a, b) => (b.setAt || '').localeCompare(a.setAt || ''))

  return (
    <PromisesClient
      entries={entries}
      mode={mode}
      tenantId={tenantId}
      tenantName={tenantName}
      focusMonth={focusMonth}
      billingId={billingParam ?? null}
    />
  )
}
