import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 })
  }

  try {
    const form = await req.formData()
    const branch = (form.get('branch') as string) || 'takmoa'  // 'takmoa' | 'chamkadong'
    const slot = form.get('slot') as string                     // '1' | '2'
    const clear = form.get('clear') === 'true'
    const key = `qr_${branch}_${slot}`

    if (clear) {
      await db.setting.upsert({
        where: { key },
        update: { value: '' },
        create: { key, value: '', label: `QR Code ${branch} ${slot}` },
      })
      return NextResponse.json({ ok: true, value: '' })
    }

    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ ok: false, error: 'No file' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = file.type || 'image/png'
    const dataUrl = `data:${mimeType};base64,${base64}`

    await db.setting.upsert({
      where: { key },
      update: { value: dataUrl },
      create: { key, value: dataUrl, label: `QR Code ${branch} ${slot}` },
    })

    return NextResponse.json({ ok: true, value: dataUrl })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
