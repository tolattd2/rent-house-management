import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST multipart/form-data with field `file` (PDF or DOCX) → returns extracted plaintext.
 * Used by the "Generate Contract" dialog when a user uploads an existing agreement
 * to be converted into editable text.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'No file uploaded' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'File too large (max 10MB)' }, { status: 400 })
    }

    const name = file.name.toLowerCase()
    const buf = Buffer.from(await file.arrayBuffer())
    let text = ''

    if (name.endsWith('.docx') || file.type.includes('officedocument.wordprocessingml')) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer: buf })
      text = result.value || ''
    } else if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: new Uint8Array(buf) })
      try {
        const result = await parser.getText()
        text = result.text || ''
      } finally {
        await parser.destroy().catch(() => {})
      }
    } else if (name.endsWith('.doc')) {
      return NextResponse.json(
        { ok: false, error: 'Legacy .doc files not supported — please re-save as .docx or .pdf' },
        { status: 400 },
      )
    } else {
      return NextResponse.json({ ok: false, error: 'Unsupported file type (PDF or DOCX only)' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, text })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Failed to extract text' },
      { status: 500 },
    )
  }
}
