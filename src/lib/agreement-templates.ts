import { db } from './db'

/**
 * Reusable agreement template stored under the `agreement_templates`
 * settings row (as JSON). Avoids adding a new Prisma table for what is
 * effectively a small piece of UI-managed configuration.
 */
export interface AgreementTemplate {
  id: string
  name: string
  html: string
  createdAt: string
  updatedAt: string
}

const KEY = 'agreement_templates'

export async function listTemplates(): Promise<AgreementTemplate[]> {
  const row = await db.setting.findUnique({ where: { key: KEY } })
  if (!row?.value) return []
  try {
    const parsed = JSON.parse(row.value)
    return Array.isArray(parsed)
      ? parsed.filter(
          (t): t is AgreementTemplate =>
            t && typeof t.id === 'string' && typeof t.name === 'string' && typeof t.html === 'string',
        )
      : []
  } catch {
    return []
  }
}

async function persist(templates: AgreementTemplate[]): Promise<void> {
  await db.setting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(templates) },
    create: { key: KEY, value: JSON.stringify(templates), label: 'Agreement Templates' },
  })
}

export async function createTemplate(name: string, html: string): Promise<AgreementTemplate> {
  const all = await listTemplates()
  const now = new Date().toISOString()
  const id = `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const record: AgreementTemplate = { id, name: name.trim() || 'Untitled', html, createdAt: now, updatedAt: now }
  await persist([record, ...all])
  return record
}

export async function updateTemplate(
  id: string,
  patch: { name?: string; html?: string },
): Promise<AgreementTemplate | null> {
  const all = await listTemplates()
  const idx = all.findIndex((t) => t.id === id)
  if (idx === -1) return null
  const next: AgreementTemplate = {
    ...all[idx],
    ...(patch.name !== undefined && { name: patch.name.trim() || all[idx].name }),
    ...(patch.html !== undefined && { html: patch.html }),
    updatedAt: new Date().toISOString(),
  }
  all[idx] = next
  await persist(all)
  return next
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const all = await listTemplates()
  const next = all.filter((t) => t.id !== id)
  if (next.length === all.length) return false
  await persist(next)
  return true
}
