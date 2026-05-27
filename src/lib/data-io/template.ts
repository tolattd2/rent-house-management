import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { SHEETS } from './schemas'

// Build the empty .xlsx template. Each data sheet is just the header row.
// A hidden `_enums` sheet lists every enum's allowed values. A hidden
// `_refs` sheet lists existing rooms/tenants so the human filling in the
// template can look up the right `room_ref` / `tenant_ref` values.
export async function buildTemplateWorkbook(): Promise<Buffer> {
  const wb = XLSX.utils.book_new()

  // Entity sheets — header row only, plus a hint comment row beneath where
  // useful. We don't add full data-validation lists (xlsx-js can't write the
  // validation feature), but we DO ship the `_enums` sheet so users can copy
  // the right value, and we make the column hints visible by adding a
  // second row of grayed-out hints. The hint row is on purpose left as
  // text data — it'll get blown away on the user's first save, which is
  // exactly what we want (it's documentation, not data).
  for (const sheet of SHEETS) {
    const headers = sheet.columns.map((c) => c.header)
    const hints = sheet.columns.map((c) => {
      const bits: string[] = []
      if (c.required) bits.push('REQUIRED')
      if (c.enum) bits.push(`one of: ${c.enum.join(', ')}`)
      if (c.hint) bits.push(c.hint)
      return bits.join(' • ')
    })
    const hasAnyHint = hints.some(Boolean)
    const aoa: unknown[][] = [headers]
    if (hasAnyHint) aoa.push(hints)
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }

  // _enums sheet — one column per enum, header = enum name.
  {
    const enumCols: Array<{ name: string; values: readonly string[] }> = []
    const seen = new Set<string>()
    for (const sheet of SHEETS) {
      for (const col of sheet.columns) {
        if (!col.enum) continue
        const key = col.enum.join('|')
        if (seen.has(key)) continue
        seen.add(key)
        enumCols.push({ name: col.header, values: col.enum })
      }
    }
    // Lay out columns side-by-side.
    const maxLen = Math.max(0, ...enumCols.map((e) => e.values.length))
    const aoa: string[][] = [enumCols.map((e) => e.name)]
    for (let i = 0; i < maxLen; i++) {
      aoa.push(enumCols.map((e) => e.values[i] ?? ''))
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, '_enums')
  }

  // _refs sheet — current rooms + tenants so users have a copy-pasteable
  // source for the *_ref columns.
  {
    const [rooms, tenants] = await Promise.all([
      db.room.findMany({ select: { id: true, roomNumber: true, branch: true }, orderBy: [{ branch: 'asc' }, { roomNumber: 'asc' }] }),
      db.tenant.findMany({ select: { id: true, fullName: true, phone: true }, orderBy: { fullName: 'asc' } }),
    ])
    const aoa: string[][] = [
      ['room_ref', 'roomId', '', 'tenant_ref', 'tenantId'],
    ]
    const maxLen = Math.max(rooms.length, tenants.length)
    for (let i = 0; i < maxLen; i++) {
      const r = rooms[i]
      const t = tenants[i]
      aoa.push([
        r ? `${r.roomNumber}|${r.branch}` : '',
        r ? r.id : '',
        '',
        t ? `${t.fullName}|${t.phone}` : '',
        t ? t.id : '',
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, '_refs')
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
