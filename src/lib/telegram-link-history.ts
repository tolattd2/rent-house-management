import { db } from './db'

/**
 * Per-tenant history of Telegram chat IDs we've ever stored, kept in the
 * Setting table so we don't need a schema migration. Key shape:
 *   tg_history_<tenantId> → JSON string array of chat IDs, newest first.
 *
 * This lets us recover a tenant's link if it gets accidentally cleared,
 * without ever asking the tenant to re-link.
 */

const HISTORY_KEY_PREFIX = 'tg_history_'
const HISTORY_LIMIT = 10

function historyKey(tenantId: string): string {
  return `${HISTORY_KEY_PREFIX}${tenantId}`
}

export async function readChatIdHistory(tenantId: string): Promise<string[]> {
  const row = await db.setting.findUnique({ where: { key: historyKey(tenantId) } })
  if (!row?.value) return []
  try {
    const parsed = JSON.parse(row.value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}

/**
 * Record a chat ID for this tenant. Most-recent-first, deduped, capped.
 * Call this every time a tenant's chat ID is observed as valid (linking via
 * the bot, or admin pasting a value) so we always have a recovery path.
 */
export async function recordChatId(tenantId: string, chatId: string): Promise<void> {
  if (!tenantId || !chatId) return
  const existing = await readChatIdHistory(tenantId)
  const next = [chatId, ...existing.filter((c) => c !== chatId)].slice(0, HISTORY_LIMIT)
  await db.setting.upsert({
    where: { key: historyKey(tenantId) },
    update: { value: JSON.stringify(next) },
    create: { key: historyKey(tenantId), value: JSON.stringify(next), label: 'Telegram link history' },
  })
}

/** Most recent chat ID for this tenant, or null if no history exists. */
export async function latestChatId(tenantId: string): Promise<string | null> {
  const history = await readChatIdHistory(tenantId)
  return history[0] ?? null
}
