import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { z } from 'zod'

const schema = z.object({
  agreementText: z.string().default(''),
  contractStart: z.string().default(''),
  contractEnd: z.string().default(''),
  monthlyRent: z.coerce.number().min(0).default(0),
  depositAmount: z.coerce.number().min(0).default(0),
})

/**
 * Save a generated bilingual agreement for a tenant.
 *
 * Strategy: if an active contract exists, update its agreement text in place
 * (avoids piling up duplicate Contract rows for the same lease). Otherwise
 * create a fresh active contract.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const { id: tenantId } = await params

  try {
    const body = schema.parse(await req.json())
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 })

    const existing = await db.contract.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    })

    if (existing) {
      await db.contract.update({
        where: { id: existing.id },
        data: {
          agreementText: body.agreementText,
          // Only overwrite lease fields if caller provided non-empty values.
          ...(body.contractStart && { contractStart: body.contractStart }),
          ...(body.contractEnd && { contractEnd: body.contractEnd }),
          ...(body.monthlyRent > 0 && { monthlyRent: body.monthlyRent }),
          ...(body.depositAmount > 0 && { depositAmount: body.depositAmount }),
        },
      })
    } else {
      await db.contract.create({
        data: {
          tenantId,
          contractStart: body.contractStart || new Date().toISOString().slice(0, 10),
          contractEnd: body.contractEnd,
          monthlyRent: body.monthlyRent,
          depositAmount: body.depositAmount,
          agreementText: body.agreementText,
          status: 'active',
        },
      })
    }

    invalidate('tenants')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Error' },
      { status: 400 },
    )
  }
}
