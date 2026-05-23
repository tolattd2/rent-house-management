import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listTemplates, createTemplate } from '@/lib/agreement-templates'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const templates = await listTemplates()
  return NextResponse.json({ ok: true, data: templates })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const name = typeof body?.name === 'string' ? body.name : ''
    const html = typeof body?.html === 'string' ? body.html : ''
    if (!name.trim() || !html.trim()) {
      return NextResponse.json({ ok: false, error: 'Name and content are required' }, { status: 400 })
    }
    const record = await createTemplate(name, html)
    return NextResponse.json({ ok: true, data: record })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Error' },
      { status: 400 },
    )
  }
}
