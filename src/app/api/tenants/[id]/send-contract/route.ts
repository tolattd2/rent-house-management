import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendTelegramDocument } from '@/lib/notifications'

/**
 * Forward a tenant-agreement PDF (uploaded as multipart/form-data) to the
 * tenant's Telegram chat. Admin-only. The PDF is generated in the browser via
 * jsPDF so this route stays serverless-friendly and never renders HTML itself.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const tenant = await db.tenant.findUnique({
    where: { id },
    select: { telegramChatId: true, fullName: true },
  })
  if (!tenant) return NextResponse.json({ ok: false, error: 'Tenant not found' }, { status: 404 })
  if (!tenant.telegramChatId) {
    return NextResponse.json(
      { ok: false, error: 'Tenant has not linked their Telegram.' },
      { status: 400 },
    )
  }

  let fd: FormData
  try {
    fd = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid upload' }, { status: 400 })
  }

  const file = fd.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const safeName = tenant.fullName.replace(/[^\wក-៿ -]+/gu, '').trim() || 'tenant'
  const result = await sendTelegramDocument(
    tenant.telegramChatId,
    { buffer, filename: `Contract - ${safeName}.pdf`, mime: 'application/pdf' },
    '📄 Your rental agreement',
  )

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
