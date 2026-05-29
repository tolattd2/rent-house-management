import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createUploadUrl, isStorageConfigured } from '@/lib/storage'

const MAX_IMAGE = 5 * 1024 * 1024   // Telegram sendPhoto-by-URL limit
const MAX_VIDEO = 20 * 1024 * 1024  // Telegram sendVideo-by-URL limit

/** Issues a short-lived presigned URL so the browser can upload media straight to object storage. */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Object storage is not configured.' },
      { status: 400 },
    )
  }

  try {
    const { filename, contentType, size } = (await req.json()) as {
      filename?: string; contentType?: string; size?: number
    }
    if (!filename || !contentType) {
      return NextResponse.json({ ok: false, error: 'Missing file info' }, { status: 400 })
    }

    const isVideo = contentType.startsWith('video/')
    const isImage = contentType.startsWith('image/')
    if (!isVideo && !isImage) {
      return NextResponse.json({ ok: false, error: 'Only images and videos are allowed.' }, { status: 400 })
    }
    if (typeof size === 'number' && size > (isVideo ? MAX_VIDEO : MAX_IMAGE)) {
      return NextResponse.json(
        { ok: false, error: `File too large — max ${isVideo ? '20' : '5'} MB.` },
        { status: 400 },
      )
    }

    const ext = filename.includes('.') ? filename.split('.').pop() : isVideo ? 'mp4' : 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`

    const result = await createUploadUrl(path, contentType)
    if (!result) {
      return NextResponse.json({ ok: false, error: 'Could not create upload URL.' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      kind: isVideo ? 'video' : 'photo',
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 400 })
  }
}
