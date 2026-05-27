import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { SHEETS, type SheetSchema } from './schemas'
import { loadRefs } from './refs'

// Pull every row for a given sheet's model. Kept in one place so export.ts
// and template.ts don't both need to know how each model is fetched.
async function fetchAll(model: SheetSchema['model']): Promise<Record<string, unknown>[]> {
  switch (model) {
    case 'room':         return db.room.findMany({ orderBy: [{ branch: 'asc' }, { roomNumber: 'asc' }] }) as unknown as Record<string, unknown>[]
    case 'tenant':       return db.tenant.findMany({ orderBy: { fullName: 'asc' } }) as unknown as Record<string, unknown>[]
    case 'contract':     return db.contract.findMany({ orderBy: { createdAt: 'asc' } }) as unknown as Record<string, unknown>[]
    case 'billing':      return db.billing.findMany({ orderBy: [{ billingMonth: 'desc' }, { createdAt: 'asc' }] }) as unknown as Record<string, unknown>[]
    case 'payment':      return db.payment.findMany({ orderBy: { createdAt: 'asc' } }) as unknown as Record<string, unknown>[]
    case 'maintenance':  return db.maintenance.findMany({ orderBy: { reportedDate: 'desc' } }) as unknown as Record<string, unknown>[]
    case 'expense':      return db.expense.findMany({ orderBy: { expenseDate: 'desc' } }) as unknown as Record<string, unknown>[]
    case 'tenantNotice': return db.tenantNotice.findMany({ orderBy: { createdAt: 'desc' } }) as unknown as Record<string, unknown>[]
  }
}

/** Build an .xlsx workbook with one sheet per entity, fully populated. */
export async function buildExportWorkbook(): Promise<Buffer> {
  const refs = await loadRefs()
  const wb = XLSX.utils.book_new()

  for (const sheet of SHEETS) {
    const records = await fetchAll(sheet.model)
    const headers = sheet.columns.map((c) => c.header)
    const rows = records.map((r) => sheet.toRow(r, refs))
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
