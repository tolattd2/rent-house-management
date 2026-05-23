import { db } from './db'

/**
 * Per-billing "promise to pay" date tracking, kept in the Setting table so we
 * don't need a schema migration. Key shape:
 *   promise_<billingId> → JSON { current, currentSetAt, history[], alerted[] }
 *
 * `alerted` tracks which promise dates the landlord has already been notified
 * about, so that updating the promise to a fresh date naturally re-arms the
 * alert without spamming.
 */

const KEY_PREFIX = 'promise_'

export type PromiseEntry = { date: string; setAt: string; by?: string }
export type PromiseRecord = {
  current: string | null
  currentSetAt: string | null
  history: PromiseEntry[]
  alerted: string[]
}

function key(billingId: string): string {
  return `${KEY_PREFIX}${billingId}`
}

function blank(): PromiseRecord {
  return { current: null, currentSetAt: null, history: [], alerted: [] }
}

export async function readPromise(billingId: string): Promise<PromiseRecord> {
  const row = await db.setting.findUnique({ where: { key: key(billingId) } })
  if (!row?.value) return blank()
  try {
    const parsed = JSON.parse(row.value)
    return {
      current: typeof parsed.current === 'string' ? parsed.current : null,
      currentSetAt: typeof parsed.currentSetAt === 'string' ? parsed.currentSetAt : null,
      history: Array.isArray(parsed.history) ? parsed.history.filter(
        (h: unknown): h is PromiseEntry =>
          typeof h === 'object' && h !== null && typeof (h as PromiseEntry).date === 'string',
      ) : [],
      alerted: Array.isArray(parsed.alerted)
        ? parsed.alerted.filter((x: unknown): x is string => typeof x === 'string')
        : [],
    }
  } catch {
    return blank()
  }
}

async function write(billingId: string, record: PromiseRecord): Promise<void> {
  await db.setting.upsert({
    where: { key: key(billingId) },
    update: { value: JSON.stringify(record) },
    create: { key: key(billingId), value: JSON.stringify(record), label: 'Promise to pay' },
  })
}

/**
 * Set the current promise date for a billing. Appends the previous current
 * (if any) to history before overwriting, so every promise the admin ever
 * recorded is preserved.
 */
export async function setPromise(billingId: string, date: string, by?: string): Promise<PromiseRecord> {
  const record = await readPromise(billingId)
  const now = new Date().toISOString()
  if (record.current) {
    record.history.unshift({
      date: record.current,
      setAt: record.currentSetAt ?? now,
      ...(by ? { by } : {}),
    })
  }
  record.current = date
  record.currentSetAt = now
  await write(billingId, record)
  return record
}

export async function clearPromise(billingId: string): Promise<PromiseRecord> {
  const record = await readPromise(billingId)
  const now = new Date().toISOString()
  if (record.current) {
    record.history.unshift({
      date: record.current,
      setAt: record.currentSetAt ?? now,
    })
  }
  record.current = null
  record.currentSetAt = null
  await write(billingId, record)
  return record
}

/**
 * Mark a promise date as "landlord has been alerted about this" so the cron
 * does not re-send. Cleared automatically when the admin records a new
 * promise date (the new value won't be in `alerted` yet).
 */
export async function markAlerted(billingId: string, date: string): Promise<void> {
  const record = await readPromise(billingId)
  if (!record.alerted.includes(date)) {
    record.alerted.push(date)
    await write(billingId, record)
  }
}
