import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { db } from '@/lib/db'
import { SHEETS, type SheetSchema } from './schemas'
import { loadRefs } from './refs'

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

/** Build a .zip containing one CSV per entity. */
export async function buildExportCsvZip(): Promise<Buffer> {
  const refs = await loadRefs()
  const zip = new JSZip()

  for (const sheet of SHEETS) {
    const records = await fetchAll(sheet.model)
    const headers = sheet.columns.map((c) => c.header)
    const rows = records.map((r) => sheet.toRow(r, refs))
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers })
    // Excel-friendly CSV (commas, quotes, CRLF).
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ',', RS: '\r\n' })
    zip.file(`${sheet.name}.csv`, csv)
  }

  return zip.generateAsync({ type: 'nodebuffer' })
}
