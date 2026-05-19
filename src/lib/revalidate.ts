import { revalidateTag } from 'next/cache'
import { TAGS } from './cached-queries'

export type EntityTag = keyof typeof TAGS

export function invalidate(...tags: EntityTag[]) {
  for (const t of tags) revalidateTag(TAGS[t])
}
