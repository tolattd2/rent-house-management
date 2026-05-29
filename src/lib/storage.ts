import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/** Storage bucket that holds Custom Reminder pictures and videos. Must allow public read. */
export const REMINDER_BUCKET = process.env.S3_BUCKET?.trim() || 'reminder-media'

const endpoint = process.env.S3_ENDPOINT?.trim() || undefined
const region = process.env.S3_REGION?.trim() || 'us-east-1'
const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim() || undefined
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim() || undefined
// Public base URL Telegram fetches media from, e.g. https://media.happyhomebyhas.com
const publicBase = process.env.S3_PUBLIC_URL?.trim().replace(/\/$/, '') || undefined

let client: S3Client | null | undefined

/** S3 client for MinIO (or any S3-compatible store). `null` when storage isn't configured. */
function s3(): S3Client | null {
  if (client === undefined) {
    client =
      endpoint && accessKeyId && secretAccessKey
        ? new S3Client({
            endpoint,
            region,
            credentials: { accessKeyId, secretAccessKey },
            forcePathStyle: true, // MinIO addresses buckets by path, not subdomain
          })
        : null
  }
  return client
}

/** True when both the S3 client and a public base URL are configured. */
export function isStorageConfigured(): boolean {
  return s3() !== null && !!publicBase
}

/**
 * Returns a short-lived presigned PUT URL so the browser can upload media straight
 * to MinIO, plus the public URL the file will be reachable at afterwards.
 * `null` when storage isn't configured.
 */
export async function createUploadUrl(
  path: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string } | null> {
  const c = s3()
  if (!c || !publicBase) return null

  const command = new PutObjectCommand({
    Bucket: REMINDER_BUCKET,
    Key: path,
    ContentType: contentType,
  })
  const uploadUrl = await getSignedUrl(c, command, { expiresIn: 300 })
  const publicUrl = `${publicBase}/${REMINDER_BUCKET}/${path}`
  return { uploadUrl, publicUrl }
}
