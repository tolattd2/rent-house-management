import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { invalidate } from '@/lib/revalidate'
import { parseBranches, RATE_KEYS, branchRateKey } from '@/lib/branches'

// Hard delete a branch and every record/setting that mentions it. Used by
// the settings page after a typed-name confirmation — the user explicitly
// asked for "no track" of the branch to remain, so this is intentionally
// destructive (rooms, tenants in those rooms, billings, invoices, etc.).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  const { slug } = await params

  try {
    const branchesRow = await db.setting.findUnique({ where: { key: 'branches' } })
    const branches = parseBranches(branchesRow?.value)
    const target = branches.find((b) => b.slug === slug)
    if (!target) {
      return NextResponse.json({ ok: false, error: 'Branch not found' }, { status: 404 })
    }

    // Defense-in-depth: client sends the typed name; refuse if it doesn't
    // match. The UI also gates the Delete button on the same check.
    let body: { name?: string } = {}
    try { body = await req.json() } catch { /* no body is acceptable too */ }
    if (typeof body.name === 'string' && body.name.trim() !== target.name) {
      return NextResponse.json({ ok: false, error: 'Confirmation name does not match.' }, { status: 400 })
    }

    const branchName = target.name

    await db.$transaction(async (tx) => {
      // 1. Find every room currently assigned to this branch and the tenants
      //    living in them. Tenant → Room is SetNull on delete, so if we
      //    dropped rooms first the tenants would survive as orphans.
      const rooms = await tx.room.findMany({ where: { branch: branchName }, select: { id: true } })
      const roomIds = rooms.map((r) => r.id)

      if (roomIds.length > 0) {
        const tenants = await tx.tenant.findMany({
          where: { roomId: { in: roomIds } },
          select: { id: true },
        })
        const tenantIds = tenants.map((t) => t.id)
        if (tenantIds.length > 0) {
          // Cascades to contracts, billings, invoices, notifications, notices.
          // Maintenance.tenantId is SetNull — handled by the room delete next.
          await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
        }
        // Cascades remaining billings/maintenances/room_map_layouts; nulls expense.roomId.
        await tx.room.deleteMany({ where: { id: { in: roomIds } } })
      }

      // 2. Remove every per-branch setting key keyed by this slug.
      //    company_<slug>_*  |  qr_<slug>_*  |  <rateKey>_<slug>
      const rateKeys = RATE_KEYS.map((k) => branchRateKey(k, slug))
      await tx.setting.deleteMany({
        where: {
          OR: [
            { key: { startsWith: `company_${slug}_` } },
            { key: { startsWith: `qr_${slug}_` } },
            { key: { startsWith: `qr_${slug}` } },
            { key: { in: rateKeys } },
          ],
        },
      })

      // 3. Drop the branch from the branches JSON setting.
      const remaining = branches.filter((b) => b.slug !== slug)
      await tx.setting.upsert({
        where: { key: 'branches' },
        update: { value: JSON.stringify(remaining) },
        create: { key: 'branches', value: JSON.stringify(remaining), label: 'Branches' },
      })
    })

    invalidate('rooms', 'tenants', 'billings', 'invoices', 'payments', 'maintenance', 'notifications', 'expenses', 'settings')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Error' },
      { status: 400 },
    )
  }
}
