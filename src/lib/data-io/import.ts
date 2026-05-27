import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { db } from '@/lib/db'
import type { Prisma, PrismaClient } from '@prisma/client'
import {
  SHEETS, SHEET_BY_NAME, IMPORT_ORDER,
  type SheetSchema,
} from './schemas'
import { loadRefs, roomKey, tenantKey, billingKey, type RefData } from './refs'
import type { ImportPlan, RowPlan, SheetPlan } from './types'

// Read the user upload into a map of { sheetName → rows }. Accepts both
// `.xlsx` (one workbook with multiple sheets) and `.zip` (one CSV per
// sheet). Unknown sheet names are surfaced in the plan so the user can spot
// typos but don't block the rest.
async function readUpload(
  file: { name: string; data: Buffer },
): Promise<{ bySheet: Record<string, Record<string, unknown>[]>; unknownSheets: string[] }> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'zip') return readCsvZip(file.data)
  // default: xlsx (or xls — xlsx-js handles both)
  return readWorkbook(file.data)
}

function readWorkbook(buf: Buffer): { bySheet: Record<string, Record<string, unknown>[]>; unknownSheets: string[] } {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const bySheet: Record<string, Record<string, unknown>[]> = {}
  const unknownSheets: string[] = []
  for (const name of wb.SheetNames) {
    if (name.startsWith('_')) continue            // hidden reference sheets
    const schema = SHEET_BY_NAME[name]
    if (!schema) { unknownSheets.push(name); continue }
    const ws = wb.Sheets[name]
    bySheet[name] = parseSheet(ws, schema)
  }
  return { bySheet, unknownSheets }
}

async function readCsvZip(buf: Buffer): Promise<{ bySheet: Record<string, Record<string, unknown>[]>; unknownSheets: string[] }> {
  const zip = await JSZip.loadAsync(buf)
  const bySheet: Record<string, Record<string, unknown>[]> = {}
  const unknownSheets: string[] = []
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const base = entry.name.split('/').pop() ?? entry.name
    const name = base.replace(/\.csv$/i, '')
    if (name.startsWith('_')) continue
    const schema = SHEET_BY_NAME[name]
    if (!schema) { unknownSheets.push(base); continue }
    const csv = await entry.async('string')
    const ws = XLSX.read(csv, { type: 'string' }).Sheets.Sheet1
    bySheet[name] = parseSheet(ws, schema)
  }
  return { bySheet, unknownSheets }
}

// Convert a worksheet to row objects, skipping the optional "hint" row that
// templates ship with. The hint row is detected as any row whose values for
// REQUIRED columns are clearly documentation rather than data (contains
// "REQUIRED" or "one of:" tokens). Plain blank rows get filtered out too.
function parseSheet(ws: XLSX.WorkSheet, schema: SheetSchema): Record<string, unknown>[] {
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  const requiredHeaders = schema.columns.filter((c) => c.required).map((c) => c.header)
  return rows.filter((row) => {
    // skip rows that are entirely blank
    const anyVal = Object.values(row).some((v) => v !== '' && v !== null && v !== undefined)
    if (!anyVal) return false
    // skip the hint row from our own templates
    if (requiredHeaders.some((h) => /REQUIRED|one of:/i.test(String(row[h] ?? '')))) return false
    return true
  })
}

// ---------- planning ----------

type RawPlanRow = RowPlan & { payload: Record<string, unknown> | null }

interface SheetWorkingPlan {
  sheet: string
  rows: RawPlanRow[]
}

function buildSheetPlan(
  schema: SheetSchema,
  rawRows: Record<string, unknown>[],
  refs: RefData,
  existingIds: Set<string>,
  existingByNaturalKey: Map<string, string>,
): SheetWorkingPlan {
  const out: RawPlanRow[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    const parsed = schema.fromRow(row, refs)
    const idValue = String(row.id ?? '').trim()

    if (parsed.errors.length > 0) {
      out.push({
        rowIndex: i,
        outcome: 'error',
        errors: parsed.errors,
        label: parsed.label,
        payload: null,
      })
      continue
    }

    // Identity resolution: id > naturalKey > new.
    let existingId: string | undefined
    let matchedBy: 'id' | 'naturalKey' | undefined
    if (idValue && existingIds.has(idValue)) {
      existingId = idValue
      matchedBy = 'id'
    } else if (schema.upsertByNaturalKey && parsed.naturalKey) {
      const hit = existingByNaturalKey.get(parsed.naturalKey)
      if (hit) { existingId = hit; matchedBy = 'naturalKey' }
    } else if (idValue && !existingIds.has(idValue)) {
      // user provided an id that doesn't exist — treat as error rather than
      // silently creating with a different id
      out.push({
        rowIndex: i,
        outcome: 'error',
        errors: [{ column: 'id', message: `id "${idValue}" not found — leave id blank to create new` }],
        label: parsed.label,
        payload: null,
      })
      continue
    }

    out.push({
      rowIndex: i,
      outcome: existingId ? 'update' : 'create',
      existingId,
      matchedBy,
      label: parsed.label,
      payload: parsed.data,
    })
  }

  return { sheet: schema.name, rows: out }
}

function toSheetPlan(working: SheetWorkingPlan): SheetPlan {
  const create = working.rows.filter((r) => r.outcome === 'create').length
  const update = working.rows.filter((r) => r.outcome === 'update').length
  const skip   = working.rows.filter((r) => r.outcome === 'skip').length
  const error  = working.rows.filter((r) => r.outcome === 'error').length
  return {
    sheet: working.sheet,
    total: working.rows.length,
    create, update, skip, error,
    // strip internal `payload` before returning to caller
    rows: working.rows.map(({ payload: _payload, ...r }) => r),
  }
}

// ---------- public entrypoint ----------

export interface ImportResult {
  plan: ImportPlan
  applied: boolean
}

export async function planAndApplyImport(
  file: { name: string; data: Buffer },
  options: { dryRun: boolean },
): Promise<ImportResult> {
  const { bySheet, unknownSheets } = await readUpload(file)
  const refs = await loadRefs()

  // Pre-load existing-id sets per sheet so identity resolution is one
  // in-memory check rather than a per-row db round-trip.
  const existingIdsBySheet: Record<string, Set<string>> = {}
  const existingByNatKey: Record<string, Map<string, string>> = {}
  for (const schema of SHEETS) {
    existingIdsBySheet[schema.name] = await loadIdSet(schema)
    existingByNatKey[schema.name] = await loadNaturalKeyIndex(schema)
  }

  // Build the plan in dependency order, even though FK resolution happens
  // entirely against `refs` (loaded fresh and updated as we go through
  // each sheet during apply()).
  const workingPlans: SheetWorkingPlan[] = []
  for (const name of IMPORT_ORDER) {
    const rawRows = bySheet[name] ?? []
    if (rawRows.length === 0) continue
    const schema = SHEET_BY_NAME[name]
    workingPlans.push(
      buildSheetPlan(schema, rawRows, refs, existingIdsBySheet[name], existingByNatKey[name]),
    )
  }

  const planSheets = workingPlans.map(toSheetPlan)
  const hasErrors = planSheets.some((p) => p.error > 0)
  const plan: ImportPlan = { sheets: planSheets, hasErrors, unknownSheets }

  if (options.dryRun || hasErrors) {
    return { plan, applied: false }
  }

  await db.$transaction(async (tx) => {
    for (const wp of workingPlans) {
      const schema = SHEET_BY_NAME[wp.sheet]
      for (const row of wp.rows) {
        if (row.outcome === 'error' || row.outcome === 'skip' || !row.payload) continue
        await applyRow(tx, schema, row, refs)
      }
    }
  }, { timeout: 60_000, maxWait: 10_000 })

  return { plan, applied: true }
}

// ---------- apply step ----------

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

async function applyRow(
  tx: Tx,
  schema: SheetSchema,
  row: RawPlanRow,
  refs: RefData,
): Promise<void> {
  const data = { ...(row.payload as Record<string, unknown>) }
  // Some sheets need extra adjustments at apply time (e.g. billings inherit
  // their roomId from the tenant if blank).
  if (schema.model === 'billing' && (!data.roomId || data.roomId === '')) {
    const tenant = await tx.tenant.findUnique({
      where: { id: data.tenantId as string },
      select: { roomId: true },
    })
    data.roomId = tenant?.roomId ?? null
    if (!data.roomId) {
      throw new Error(`Billing row "${row.label}" — tenant has no room assigned and no room_ref was supplied`)
    }
  }

  switch (schema.model) {
    case 'room': {
      if (row.outcome === 'update' && row.existingId) {
        await tx.room.update({ where: { id: row.existingId }, data: data as Prisma.RoomUpdateInput })
      } else {
        const created = await tx.room.create({ data: data as Prisma.RoomCreateInput })
        refs.roomByKey.set(roomKey(created.roomNumber, created.branch), created.id)
        refs.roomById.set(created.id, { roomNumber: created.roomNumber, branch: created.branch })
      }
      return
    }
    case 'tenant': {
      if (row.outcome === 'update' && row.existingId) {
        await tx.tenant.update({ where: { id: row.existingId }, data: data as Prisma.TenantUpdateInput })
      } else {
        const created = await tx.tenant.create({ data: data as Prisma.TenantCreateInput })
        refs.tenantByKey.set(tenantKey(created.fullName, created.phone), created.id)
        refs.tenantById.set(created.id, { fullName: created.fullName, phone: created.phone })
      }
      return
    }
    case 'contract': {
      if (row.outcome === 'update' && row.existingId) {
        await tx.contract.update({ where: { id: row.existingId }, data: data as Prisma.ContractUpdateInput })
      } else {
        await tx.contract.create({ data: data as Prisma.ContractCreateInput })
      }
      return
    }
    case 'billing': {
      if (row.outcome === 'update' && row.existingId) {
        await tx.billing.update({ where: { id: row.existingId }, data: data as Prisma.BillingUpdateInput })
      } else {
        const created = await tx.billing.create({ data: data as Prisma.BillingCreateInput })
        refs.billingByKey.set(billingKey(created.tenantId, created.billingMonth), created.id)
        refs.billingById.set(created.id, { tenantId: created.tenantId, billingMonth: created.billingMonth })
      }
      return
    }
    case 'payment': {
      if (row.outcome === 'update' && row.existingId) {
        await tx.payment.update({ where: { id: row.existingId }, data: data as Prisma.PaymentUpdateInput })
      } else {
        await tx.payment.create({ data: data as Prisma.PaymentCreateInput })
      }
      return
    }
    case 'maintenance': {
      if (row.outcome === 'update' && row.existingId) {
        await tx.maintenance.update({ where: { id: row.existingId }, data: data as Prisma.MaintenanceUpdateInput })
      } else {
        const created = await tx.maintenance.create({ data: data as Prisma.MaintenanceCreateInput })
        refs.maintenanceById.set(created.id, { title: created.title, reportedDate: created.reportedDate })
      }
      return
    }
    case 'expense': {
      if (row.outcome === 'update' && row.existingId) {
        await tx.expense.update({ where: { id: row.existingId }, data: data as Prisma.ExpenseUpdateInput })
      } else {
        await tx.expense.create({ data: data as Prisma.ExpenseCreateInput })
      }
      return
    }
    case 'tenantNotice': {
      if (row.outcome === 'update' && row.existingId) {
        await tx.tenantNotice.update({ where: { id: row.existingId }, data: data as Prisma.TenantNoticeUpdateInput })
      } else {
        await tx.tenantNotice.create({ data: data as Prisma.TenantNoticeCreateInput })
      }
      return
    }
  }
}

// ---------- existence indexes ----------

async function loadIdSet(schema: SheetSchema): Promise<Set<string>> {
  const ids = await fetchIds(schema.model)
  return new Set(ids)
}

async function fetchIds(model: SheetSchema['model']): Promise<string[]> {
  switch (model) {
    case 'room':         return (await db.room.findMany({ select: { id: true } })).map((r) => r.id)
    case 'tenant':       return (await db.tenant.findMany({ select: { id: true } })).map((r) => r.id)
    case 'contract':     return (await db.contract.findMany({ select: { id: true } })).map((r) => r.id)
    case 'billing':      return (await db.billing.findMany({ select: { id: true } })).map((r) => r.id)
    case 'payment':      return (await db.payment.findMany({ select: { id: true } })).map((r) => r.id)
    case 'maintenance':  return (await db.maintenance.findMany({ select: { id: true } })).map((r) => r.id)
    case 'expense':      return (await db.expense.findMany({ select: { id: true } })).map((r) => r.id)
    case 'tenantNotice': return (await db.tenantNotice.findMany({ select: { id: true } })).map((r) => r.id)
  }
}

async function loadNaturalKeyIndex(schema: SheetSchema): Promise<Map<string, string>> {
  if (!schema.upsertByNaturalKey) return new Map()
  if (schema.name === 'Rooms') {
    const rows = await db.room.findMany({ select: { id: true, roomNumber: true, branch: true } })
    return new Map(rows.map((r) => [roomKey(r.roomNumber, r.branch), r.id]))
  }
  if (schema.name === 'Tenants') {
    const rows = await db.tenant.findMany({ select: { id: true, fullName: true, phone: true } })
    return new Map(rows.map((r) => [tenantKey(r.fullName, r.phone), r.id]))
  }
  if (schema.name === 'Billings') {
    const rows = await db.billing.findMany({ select: { id: true, tenantId: true, billingMonth: true } })
    return new Map(rows.map((r) => [billingKey(r.tenantId, r.billingMonth), r.id]))
  }
  return new Map()
}
