// Single source of truth for the import/export workbook shape.
//
// Each sheet defines its column layout, type coercion, and how to translate
// foreign keys to/from human-readable composites (e.g. a tenant row carries
// both `roomId` and `room_ref = "101|Takmoa"` so the spreadsheet stays
// editable by humans who don't know cuid values).
//
// Sheets are listed in IMPORT_ORDER below — parents before children — so the
// importer can rely on refs built from prior sheets when resolving FKs.

import type { RefData } from './refs'
import { roomKey, tenantKey, billingKey } from './refs'
import type { RowError } from './types'

export type ColumnType = 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'array-string'

export interface ColumnSpec {
  header: string
  type: ColumnType
  enum?: readonly string[]
  required?: boolean
  // Hint shown above the column header row in templates only.
  hint?: string
}

export interface SheetSchema {
  name: string                                   // workbook sheet name
  model: 'room' | 'tenant' | 'contract' | 'billing' | 'payment'
       | 'maintenance' | 'expense' | 'tenantNotice'
  columns: ColumnSpec[]
  // Composite natural-key headers used as a fallback when `id` is empty but
  // we still want upsert semantics (e.g. roomNumber+branch on Rooms).
  naturalKey?: string[]
  // Sheets that must be processed first so refs are populated.
  dependsOn?: string[]
  // Whether this sheet supports upsert-by-naturalKey. If false, missing id
  // always means CREATE.
  upsertByNaturalKey: boolean
  // Build a row object from a db record (export side).
  toRow(record: Record<string, unknown>, refs: RefData): Record<string, unknown>
  // Parse a row to a db payload (import side). May return errors instead.
  fromRow(row: Record<string, unknown>, refs: RefData): {
    data: Record<string, unknown> | null
    errors: RowError[]
    naturalKey: string | null
    label: string
  }
}

// ---------- enum values (kept in lockstep with prisma/schema.prisma) ----------

export const ROOM_STATUS = ['occupied', 'vacant', 'reserved', 'maintenance'] as const
export const TENANT_STATUS = ['active', 'inactive'] as const
export const CONTRACT_STATUS = ['active', 'expired', 'terminated'] as const
export const PAYMENT_STATUS = ['unpaid', 'partial', 'paid'] as const
export const PAYMENT_METHOD = ['Cash', 'ABA_Pay', 'Wing', 'TrueMoney', 'Bank_Transfer', 'Other'] as const
export const MAINTENANCE_STATUS = ['pending', 'in_progress', 'completed'] as const
export const NOTICE_TYPE = ['move_in', 'move_out', 'repair', 'complaint', 'general'] as const
export const NOTICE_STATUS = ['open', 'resolved'] as const

// ---------- coercion helpers ----------

const isBlank = (v: unknown) => v === undefined || v === null || v === ''

function str(v: unknown, fallback = ''): string {
  if (isBlank(v)) return fallback
  return String(v).trim()
}

function num(v: unknown, fallback = 0): number {
  if (isBlank(v)) return fallback
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : fallback
}

function int(v: unknown, fallback = 0): number {
  const n = num(v, fallback)
  return Math.trunc(n)
}

function enumVal<T extends string>(
  v: unknown, allowed: readonly T[], fallback: T,
): { value: T; ok: boolean } {
  if (isBlank(v)) return { value: fallback, ok: true }
  const s = String(v).trim()
  return (allowed as readonly string[]).includes(s)
    ? { value: s as T, ok: true }
    : { value: fallback, ok: false }
}

function arrString(v: unknown): string[] {
  if (isBlank(v)) return []
  if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean)
  return String(v).split(/[,;]/).map((s) => s.trim()).filter(Boolean)
}

function refLabel(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join('|')
}

// ---------- sheets ----------

const ROOMS: SheetSchema = {
  name: 'Rooms',
  model: 'room',
  naturalKey: ['roomNumber', 'branch'],
  upsertByNaturalKey: true,
  columns: [
    { header: 'id', type: 'string', hint: 'Leave empty for new rows' },
    { header: 'roomNumber', type: 'string', required: true },
    { header: 'branch', type: 'string', required: true },
    { header: 'floor', type: 'string' },
    { header: 'roomType', type: 'string' },
    { header: 'rentPriceUsd', type: 'number' },
    { header: 'depositAmount', type: 'number' },
    { header: 'status', type: 'enum', enum: ROOM_STATUS },
    { header: 'waterRateRiel', type: 'number' },
    { header: 'electricRateRiel', type: 'number' },
    { header: 'notes', type: 'string' },
  ],
  toRow(r) {
    return {
      id: r.id ?? '',
      roomNumber: r.roomNumber ?? '',
      branch: r.branch ?? '',
      floor: r.floor ?? '',
      roomType: r.roomType ?? '',
      rentPriceUsd: r.rentPriceUsd ?? 0,
      depositAmount: r.depositAmount ?? 0,
      status: r.status ?? 'vacant',
      waterRateRiel: r.waterRateRiel ?? 2000,
      electricRateRiel: r.electricRateRiel ?? 720,
      notes: r.notes ?? '',
    }
  },
  fromRow(row) {
    const errors: RowError[] = []
    const roomNumber = str(row.roomNumber)
    const branch = str(row.branch)
    if (!roomNumber) errors.push({ column: 'roomNumber', message: 'roomNumber is required' })
    if (!branch) errors.push({ column: 'branch', message: 'branch is required' })
    const status = enumVal(row.status, ROOM_STATUS, 'vacant')
    if (!status.ok) errors.push({ column: 'status', message: `invalid status "${row.status}"` })
    return {
      data: errors.length ? null : {
        roomNumber,
        branch,
        floor: str(row.floor, '1'),
        roomType: str(row.roomType, 'Standard'),
        rentPriceUsd: num(row.rentPriceUsd),
        depositAmount: num(row.depositAmount),
        status: status.value,
        waterRateRiel: num(row.waterRateRiel, 2000),
        electricRateRiel: num(row.electricRateRiel, 720),
        notes: str(row.notes),
      },
      errors,
      naturalKey: roomNumber && branch ? roomKey(roomNumber, branch) : null,
      label: `${roomNumber} — ${branch}`.trim(),
    }
  },
}

const TENANTS: SheetSchema = {
  name: 'Tenants',
  model: 'tenant',
  naturalKey: ['fullName', 'phone'],
  upsertByNaturalKey: true,
  dependsOn: ['Rooms'],
  columns: [
    { header: 'id', type: 'string', hint: 'Leave empty for new rows' },
    { header: 'fullName', type: 'string', required: true },
    { header: 'gender', type: 'string' },
    { header: 'phone', type: 'string' },
    { header: 'phonesExtra', type: 'array-string', hint: 'Separate with comma' },
    { header: 'telegramChatId', type: 'string' },
    { header: 'nationalId', type: 'string' },
    { header: 'emergencyName', type: 'string' },
    { header: 'emergencyPhone', type: 'string' },
    { header: 'occupation', type: 'string' },
    { header: 'age', type: 'integer' },
    { header: 'nationality', type: 'string' },
    { header: 'moveInDate', type: 'string', hint: 'YYYY-MM-DD' },
    { header: 'moveOutDate', type: 'string', hint: 'YYYY-MM-DD' },
    { header: 'depositAmount', type: 'number' },
    { header: 'monthlyRent', type: 'number' },
    { header: 'payDay', type: 'integer', hint: '1–31' },
    { header: 'status', type: 'enum', enum: TENANT_STATUS },
    { header: 'notes', type: 'string' },
    { header: 'roomId', type: 'string', hint: 'Internal id; leave empty and fill `room_ref` instead' },
    { header: 'room_ref', type: 'string', hint: 'Format: roomNumber|branch (e.g. 101|Takmoa)' },
  ],
  toRow(t, refs) {
    const room = t.roomId ? refs.roomById.get(t.roomId as string) : undefined
    return {
      id: t.id ?? '',
      fullName: t.fullName ?? '',
      gender: t.gender ?? '',
      phone: t.phone ?? '',
      phonesExtra: Array.isArray(t.phonesExtra) ? (t.phonesExtra as string[]).join(', ') : '',
      telegramChatId: t.telegramChatId ?? '',
      nationalId: t.nationalId ?? '',
      emergencyName: t.emergencyName ?? '',
      emergencyPhone: t.emergencyPhone ?? '',
      occupation: t.occupation ?? '',
      age: t.age ?? 0,
      nationality: t.nationality ?? '',
      moveInDate: t.moveInDate ?? '',
      moveOutDate: t.moveOutDate ?? '',
      depositAmount: t.depositAmount ?? 0,
      monthlyRent: t.monthlyRent ?? 0,
      payDay: t.payDay ?? 1,
      status: t.status ?? 'active',
      notes: t.notes ?? '',
      roomId: t.roomId ?? '',
      room_ref: room ? refLabel([room.roomNumber, room.branch]) : '',
    }
  },
  fromRow(row, refs) {
    const errors: RowError[] = []
    const fullName = str(row.fullName)
    if (!fullName) errors.push({ column: 'fullName', message: 'fullName is required' })

    // Room resolution: id wins; else parse "roomNumber|branch".
    let roomId: string | null = null
    const rawRoomId = str(row.roomId)
    if (rawRoomId) {
      if (refs.roomById.has(rawRoomId)) roomId = rawRoomId
      else errors.push({ column: 'roomId', message: `unknown roomId "${rawRoomId}"` })
    } else {
      const ref = str(row.room_ref)
      if (ref) {
        const [rn, br] = ref.split('|').map((s) => s.trim())
        const found = rn && br ? refs.roomByKey.get(roomKey(rn, br)) : undefined
        if (found) roomId = found
        else errors.push({ column: 'room_ref', message: `unknown room "${ref}" — use format roomNumber|branch` })
      }
    }

    const status = enumVal(row.status, TENANT_STATUS, 'active')
    if (!status.ok) errors.push({ column: 'status', message: `invalid status "${row.status}"` })
    const payDay = int(row.payDay, 1)
    if (payDay < 1 || payDay > 31) errors.push({ column: 'payDay', message: 'payDay must be 1–31' })

    const phone = str(row.phone)
    return {
      data: errors.length ? null : {
        fullName,
        gender: str(row.gender),
        phone,
        phonesExtra: arrString(row.phonesExtra),
        telegramChatId: str(row.telegramChatId),
        nationalId: str(row.nationalId),
        emergencyName: str(row.emergencyName),
        emergencyPhone: str(row.emergencyPhone),
        occupation: str(row.occupation),
        age: int(row.age),
        nationality: str(row.nationality),
        moveInDate: str(row.moveInDate),
        moveOutDate: str(row.moveOutDate),
        depositAmount: num(row.depositAmount),
        monthlyRent: num(row.monthlyRent),
        payDay,
        status: status.value,
        notes: str(row.notes),
        roomId,
      },
      errors,
      naturalKey: fullName ? tenantKey(fullName, phone) : null,
      label: fullName,
    }
  },
}

const CONTRACTS: SheetSchema = {
  name: 'Contracts',
  model: 'contract',
  upsertByNaturalKey: false,
  dependsOn: ['Tenants'],
  columns: [
    { header: 'id', type: 'string', hint: 'Leave empty for new rows' },
    { header: 'tenantId', type: 'string' },
    { header: 'tenant_ref', type: 'string', hint: 'Format: fullName|phone' },
    { header: 'contractStart', type: 'string', required: true, hint: 'YYYY-MM-DD' },
    { header: 'contractEnd', type: 'string', hint: 'YYYY-MM-DD' },
    { header: 'monthlyRent', type: 'number' },
    { header: 'depositAmount', type: 'number' },
    { header: 'agreementText', type: 'string' },
    { header: 'contractPdf', type: 'string' },
    { header: 'status', type: 'enum', enum: CONTRACT_STATUS },
    { header: 'notes', type: 'string' },
  ],
  toRow(c, refs) {
    const t = c.tenantId ? refs.tenantById.get(c.tenantId as string) : undefined
    return {
      id: c.id ?? '',
      tenantId: c.tenantId ?? '',
      tenant_ref: t ? refLabel([t.fullName, t.phone]) : '',
      contractStart: c.contractStart ?? '',
      contractEnd: c.contractEnd ?? '',
      monthlyRent: c.monthlyRent ?? 0,
      depositAmount: c.depositAmount ?? 0,
      agreementText: c.agreementText ?? '',
      contractPdf: c.contractPdf ?? '',
      status: c.status ?? 'active',
      notes: c.notes ?? '',
    }
  },
  fromRow(row, refs) {
    const errors: RowError[] = []
    const contractStart = str(row.contractStart)
    if (!contractStart) errors.push({ column: 'contractStart', message: 'contractStart is required' })

    const tenantId = resolveTenantId(row, refs, errors)
    if (!tenantId) errors.push({ column: 'tenant_ref', message: 'tenant could not be resolved' })

    const status = enumVal(row.status, CONTRACT_STATUS, 'active')
    if (!status.ok) errors.push({ column: 'status', message: `invalid status "${row.status}"` })

    return {
      data: errors.length ? null : {
        tenantId,
        contractStart,
        contractEnd: str(row.contractEnd),
        monthlyRent: num(row.monthlyRent),
        depositAmount: num(row.depositAmount),
        agreementText: str(row.agreementText),
        contractPdf: str(row.contractPdf),
        status: status.value,
        notes: str(row.notes),
      },
      errors,
      naturalKey: null,
      label: `${str(row.tenant_ref) || tenantId} — ${contractStart}`,
    }
  },
}

const BILLINGS: SheetSchema = {
  name: 'Billings',
  model: 'billing',
  naturalKey: ['tenantId', 'billingMonth'],
  upsertByNaturalKey: true,
  dependsOn: ['Tenants', 'Rooms'],
  columns: [
    { header: 'id', type: 'string', hint: 'Leave empty for new rows' },
    { header: 'tenantId', type: 'string' },
    { header: 'tenant_ref', type: 'string', hint: 'Format: fullName|phone' },
    { header: 'roomId', type: 'string', hint: 'Optional — auto-filled from tenant if blank' },
    { header: 'room_ref', type: 'string' },
    { header: 'billingMonth', type: 'string', required: true, hint: 'YYYY-MM' },
    { header: 'prevWaterReading', type: 'number' },
    { header: 'currWaterReading', type: 'number' },
    { header: 'waterUsage', type: 'number' },
    { header: 'waterCostRiel', type: 'number' },
    { header: 'prevElectricReading', type: 'number' },
    { header: 'currElectricReading', type: 'number' },
    { header: 'electricUsage', type: 'number' },
    { header: 'electricCostRiel', type: 'number' },
    { header: 'roomRentUsd', type: 'number' },
    { header: 'outstandingDebtUsd', type: 'number' },
    { header: 'lateDays', type: 'integer' },
    { header: 'latePenaltyUsd', type: 'number' },
    { header: 'discountUsd', type: 'number' },
    { header: 'totalUsd', type: 'number' },
    { header: 'totalRiel', type: 'number' },
    { header: 'exchangeRate', type: 'number' },
    { header: 'paymentStatus', type: 'enum', enum: PAYMENT_STATUS },
    { header: 'paymentDate', type: 'string', hint: 'YYYY-MM-DD' },
    { header: 'notes', type: 'string' },
  ],
  toRow(b, refs) {
    const t = b.tenantId ? refs.tenantById.get(b.tenantId as string) : undefined
    const r = b.roomId ? refs.roomById.get(b.roomId as string) : undefined
    return {
      id: b.id ?? '',
      tenantId: b.tenantId ?? '',
      tenant_ref: t ? refLabel([t.fullName, t.phone]) : '',
      roomId: b.roomId ?? '',
      room_ref: r ? refLabel([r.roomNumber, r.branch]) : '',
      billingMonth: b.billingMonth ?? '',
      prevWaterReading: b.prevWaterReading ?? 0,
      currWaterReading: b.currWaterReading ?? 0,
      waterUsage: b.waterUsage ?? 0,
      waterCostRiel: b.waterCostRiel ?? 0,
      prevElectricReading: b.prevElectricReading ?? 0,
      currElectricReading: b.currElectricReading ?? 0,
      electricUsage: b.electricUsage ?? 0,
      electricCostRiel: b.electricCostRiel ?? 0,
      roomRentUsd: b.roomRentUsd ?? 0,
      outstandingDebtUsd: b.outstandingDebtUsd ?? 0,
      lateDays: b.lateDays ?? 0,
      latePenaltyUsd: b.latePenaltyUsd ?? 0,
      discountUsd: b.discountUsd ?? 0,
      totalUsd: b.totalUsd ?? 0,
      totalRiel: b.totalRiel ?? 0,
      exchangeRate: b.exchangeRate ?? 4100,
      paymentStatus: b.paymentStatus ?? 'unpaid',
      paymentDate: b.paymentDate ?? '',
      notes: b.notes ?? '',
    }
  },
  fromRow(row, refs) {
    const errors: RowError[] = []
    const billingMonth = str(row.billingMonth)
    if (!billingMonth) errors.push({ column: 'billingMonth', message: 'billingMonth is required' })

    const tenantId = resolveTenantId(row, refs, errors)
    if (!tenantId) errors.push({ column: 'tenant_ref', message: 'tenant could not be resolved' })

    let roomId = resolveRoomId(row, refs, errors)
    // Billing requires roomId. If blank, leave null — the importer will
    // copy it from the tenant in apply() (we don't have that info here).
    if (!roomId) roomId = null

    const status = enumVal(row.paymentStatus, PAYMENT_STATUS, 'unpaid')
    if (!status.ok) errors.push({ column: 'paymentStatus', message: `invalid paymentStatus "${row.paymentStatus}"` })

    return {
      data: errors.length ? null : {
        tenantId,
        roomId,
        billingMonth,
        prevWaterReading: num(row.prevWaterReading),
        currWaterReading: num(row.currWaterReading),
        waterUsage: num(row.waterUsage),
        waterCostRiel: num(row.waterCostRiel),
        prevElectricReading: num(row.prevElectricReading),
        currElectricReading: num(row.currElectricReading),
        electricUsage: num(row.electricUsage),
        electricCostRiel: num(row.electricCostRiel),
        roomRentUsd: num(row.roomRentUsd),
        outstandingDebtUsd: num(row.outstandingDebtUsd),
        lateDays: int(row.lateDays),
        latePenaltyUsd: num(row.latePenaltyUsd),
        discountUsd: num(row.discountUsd),
        totalUsd: num(row.totalUsd),
        totalRiel: num(row.totalRiel),
        exchangeRate: num(row.exchangeRate, 4100),
        paymentStatus: status.value,
        paymentDate: str(row.paymentDate),
        notes: str(row.notes),
      },
      errors,
      naturalKey: tenantId && billingMonth ? billingKey(tenantId, billingMonth) : null,
      label: `${str(row.tenant_ref) || tenantId} — ${billingMonth}`,
    }
  },
}

const PAYMENTS: SheetSchema = {
  name: 'Payments',
  model: 'payment',
  upsertByNaturalKey: false,
  dependsOn: ['Billings'],
  columns: [
    { header: 'id', type: 'string', hint: 'Leave empty for new rows' },
    { header: 'billingId', type: 'string' },
    { header: 'billing_ref', type: 'string', hint: 'Format: tenantId|billingMonth or "fullName|phone|YYYY-MM"' },
    { header: 'amountUsd', type: 'number', required: true },
    { header: 'amountRiel', type: 'number' },
    { header: 'paymentMethod', type: 'enum', enum: PAYMENT_METHOD },
    { header: 'transactionRef', type: 'string' },
    { header: 'notes', type: 'string' },
  ],
  toRow(p, refs) {
    const billing = p.billingId ? refs.billingById.get(p.billingId as string) : undefined
    let billingRef = ''
    if (billing) {
      const t = refs.tenantById.get(billing.tenantId)
      billingRef = t
        ? refLabel([t.fullName, t.phone, billing.billingMonth])
        : refLabel([billing.tenantId, billing.billingMonth])
    }
    return {
      id: p.id ?? '',
      billingId: p.billingId ?? '',
      billing_ref: billingRef,
      amountUsd: p.amountUsd ?? 0,
      amountRiel: p.amountRiel ?? 0,
      paymentMethod: p.paymentMethod ?? 'Cash',
      transactionRef: p.transactionRef ?? '',
      notes: p.notes ?? '',
    }
  },
  fromRow(row, refs) {
    const errors: RowError[] = []
    const billingId = resolveBillingId(row, refs, errors)
    if (!billingId) errors.push({ column: 'billing_ref', message: 'billing could not be resolved' })

    const amountUsd = num(row.amountUsd)
    if (amountUsd <= 0) errors.push({ column: 'amountUsd', message: 'amountUsd must be > 0' })

    const method = enumVal(row.paymentMethod, PAYMENT_METHOD, 'Cash')
    if (!method.ok) errors.push({ column: 'paymentMethod', message: `invalid paymentMethod "${row.paymentMethod}"` })

    return {
      data: errors.length ? null : {
        billingId,
        amountUsd,
        amountRiel: num(row.amountRiel),
        paymentMethod: method.value,
        transactionRef: str(row.transactionRef),
        notes: str(row.notes),
      },
      errors,
      naturalKey: null,
      label: `${str(row.billing_ref) || billingId} — $${amountUsd}`,
    }
  },
}

const MAINTENANCE: SheetSchema = {
  name: 'Maintenance',
  model: 'maintenance',
  upsertByNaturalKey: false,
  dependsOn: ['Rooms', 'Tenants'],
  columns: [
    { header: 'id', type: 'string', hint: 'Leave empty for new rows' },
    { header: 'roomId', type: 'string' },
    { header: 'room_ref', type: 'string', hint: 'Format: roomNumber|branch' },
    { header: 'tenantId', type: 'string', hint: 'Optional' },
    { header: 'tenant_ref', type: 'string', hint: 'Optional — format: fullName|phone' },
    { header: 'title', type: 'string', required: true },
    { header: 'description', type: 'string' },
    { header: 'category', type: 'string' },
    { header: 'status', type: 'enum', enum: MAINTENANCE_STATUS },
    { header: 'repairFeeUsd', type: 'number' },
    { header: 'reportedDate', type: 'string', required: true, hint: 'YYYY-MM-DD' },
    { header: 'completedDate', type: 'string', hint: 'YYYY-MM-DD' },
    { header: 'notes', type: 'string' },
  ],
  toRow(m, refs) {
    const r = m.roomId ? refs.roomById.get(m.roomId as string) : undefined
    const t = m.tenantId ? refs.tenantById.get(m.tenantId as string) : undefined
    return {
      id: m.id ?? '',
      roomId: m.roomId ?? '',
      room_ref: r ? refLabel([r.roomNumber, r.branch]) : '',
      tenantId: m.tenantId ?? '',
      tenant_ref: t ? refLabel([t.fullName, t.phone]) : '',
      title: m.title ?? '',
      description: m.description ?? '',
      category: m.category ?? 'general',
      status: m.status ?? 'pending',
      repairFeeUsd: m.repairFeeUsd ?? 0,
      reportedDate: m.reportedDate ?? '',
      completedDate: m.completedDate ?? '',
      notes: m.notes ?? '',
    }
  },
  fromRow(row, refs) {
    const errors: RowError[] = []
    const title = str(row.title)
    if (!title) errors.push({ column: 'title', message: 'title is required' })
    const reportedDate = str(row.reportedDate)
    if (!reportedDate) errors.push({ column: 'reportedDate', message: 'reportedDate is required' })

    const roomId = resolveRoomId(row, refs, errors)
    if (!roomId) errors.push({ column: 'room_ref', message: 'room could not be resolved' })

    let tenantId: string | null = null
    if (str(row.tenantId) || str(row.tenant_ref)) {
      tenantId = resolveTenantId(row, refs, errors)
    }

    const status = enumVal(row.status, MAINTENANCE_STATUS, 'pending')
    if (!status.ok) errors.push({ column: 'status', message: `invalid status "${row.status}"` })

    return {
      data: errors.length ? null : {
        roomId,
        tenantId,
        title,
        description: str(row.description),
        category: str(row.category, 'general'),
        status: status.value,
        repairFeeUsd: num(row.repairFeeUsd),
        reportedDate,
        completedDate: str(row.completedDate),
        notes: str(row.notes),
      },
      errors,
      naturalKey: null,
      label: title,
    }
  },
}

const EXPENSES: SheetSchema = {
  name: 'Expenses',
  model: 'expense',
  upsertByNaturalKey: false,
  dependsOn: ['Rooms', 'Maintenance'],
  columns: [
    { header: 'id', type: 'string', hint: 'Leave empty for new rows' },
    { header: 'title', type: 'string', required: true },
    { header: 'category', type: 'string' },
    { header: 'amountUsd', type: 'number' },
    { header: 'expenseDate', type: 'string', required: true, hint: 'YYYY-MM-DD' },
    { header: 'paidTo', type: 'string' },
    { header: 'receiptUrl', type: 'string' },
    { header: 'notes', type: 'string' },
    { header: 'roomId', type: 'string', hint: 'Optional' },
    { header: 'room_ref', type: 'string', hint: 'Optional — format: roomNumber|branch' },
    { header: 'maintenanceId', type: 'string', hint: 'Optional' },
  ],
  toRow(e, refs) {
    const r = e.roomId ? refs.roomById.get(e.roomId as string) : undefined
    return {
      id: e.id ?? '',
      title: e.title ?? '',
      category: e.category ?? 'other',
      amountUsd: e.amountUsd ?? 0,
      expenseDate: e.expenseDate ?? '',
      paidTo: e.paidTo ?? '',
      receiptUrl: e.receiptUrl ?? '',
      notes: e.notes ?? '',
      roomId: e.roomId ?? '',
      room_ref: r ? refLabel([r.roomNumber, r.branch]) : '',
      maintenanceId: e.maintenanceId ?? '',
    }
  },
  fromRow(row, refs) {
    const errors: RowError[] = []
    const title = str(row.title)
    if (!title) errors.push({ column: 'title', message: 'title is required' })
    const expenseDate = str(row.expenseDate)
    if (!expenseDate) errors.push({ column: 'expenseDate', message: 'expenseDate is required' })

    let roomId: string | null = null
    if (str(row.roomId) || str(row.room_ref)) {
      roomId = resolveRoomId(row, refs, errors)
    }

    let maintenanceId: string | null = null
    const rawMaint = str(row.maintenanceId)
    if (rawMaint) {
      if (refs.maintenanceById.has(rawMaint)) maintenanceId = rawMaint
      else errors.push({ column: 'maintenanceId', message: `unknown maintenanceId "${rawMaint}"` })
    }

    return {
      data: errors.length ? null : {
        title,
        category: str(row.category, 'other'),
        amountUsd: num(row.amountUsd),
        expenseDate,
        paidTo: str(row.paidTo),
        receiptUrl: str(row.receiptUrl),
        notes: str(row.notes),
        roomId,
        maintenanceId,
      },
      errors,
      naturalKey: null,
      label: title,
    }
  },
}

const NOTICES: SheetSchema = {
  name: 'TenantNotices',
  model: 'tenantNotice',
  upsertByNaturalKey: false,
  dependsOn: ['Tenants'],
  columns: [
    { header: 'id', type: 'string', hint: 'Leave empty for new rows' },
    { header: 'tenantId', type: 'string' },
    { header: 'tenant_ref', type: 'string', hint: 'Format: fullName|phone' },
    { header: 'type', type: 'enum', enum: NOTICE_TYPE },
    { header: 'message', type: 'string' },
    { header: 'expectedDate', type: 'string', hint: 'YYYY-MM-DD' },
    { header: 'status', type: 'enum', enum: NOTICE_STATUS },
  ],
  toRow(n, refs) {
    const t = n.tenantId ? refs.tenantById.get(n.tenantId as string) : undefined
    return {
      id: n.id ?? '',
      tenantId: n.tenantId ?? '',
      tenant_ref: t ? refLabel([t.fullName, t.phone]) : '',
      type: n.type ?? 'general',
      message: n.message ?? '',
      expectedDate: n.expectedDate ?? '',
      status: n.status ?? 'open',
    }
  },
  fromRow(row, refs) {
    const errors: RowError[] = []
    const tenantId = resolveTenantId(row, refs, errors)
    if (!tenantId) errors.push({ column: 'tenant_ref', message: 'tenant could not be resolved' })
    const type = enumVal(row.type, NOTICE_TYPE, 'general')
    if (!type.ok) errors.push({ column: 'type', message: `invalid type "${row.type}"` })
    const status = enumVal(row.status, NOTICE_STATUS, 'open')
    if (!status.ok) errors.push({ column: 'status', message: `invalid status "${row.status}"` })

    return {
      data: errors.length ? null : {
        tenantId,
        type: type.value,
        message: str(row.message),
        expectedDate: str(row.expectedDate),
        status: status.value,
      },
      errors,
      naturalKey: null,
      label: `${str(row.tenant_ref) || tenantId} — ${type.value}`,
    }
  },
}

// ---------- shared FK resolvers ----------

function resolveRoomId(
  row: Record<string, unknown>, refs: RefData, errors: RowError[],
): string | null {
  const raw = str(row.roomId)
  if (raw) {
    if (refs.roomById.has(raw)) return raw
    errors.push({ column: 'roomId', message: `unknown roomId "${raw}"` })
    return null
  }
  const ref = str(row.room_ref)
  if (!ref) return null
  const [rn, br] = ref.split('|').map((s) => s.trim())
  if (!rn || !br) {
    errors.push({ column: 'room_ref', message: `room_ref "${ref}" must be roomNumber|branch` })
    return null
  }
  const found = refs.roomByKey.get(roomKey(rn, br))
  if (!found) errors.push({ column: 'room_ref', message: `unknown room "${ref}"` })
  return found ?? null
}

function resolveTenantId(
  row: Record<string, unknown>, refs: RefData, errors: RowError[],
): string | null {
  const raw = str(row.tenantId)
  if (raw) {
    if (refs.tenantById.has(raw)) return raw
    errors.push({ column: 'tenantId', message: `unknown tenantId "${raw}"` })
    return null
  }
  const ref = str(row.tenant_ref)
  if (!ref) return null
  const [name, phone] = ref.split('|').map((s) => s.trim())
  if (!name) {
    errors.push({ column: 'tenant_ref', message: `tenant_ref "${ref}" must be fullName|phone` })
    return null
  }
  const found = refs.tenantByKey.get(tenantKey(name, phone ?? ''))
  if (!found) errors.push({ column: 'tenant_ref', message: `unknown tenant "${ref}"` })
  return found ?? null
}

function resolveBillingId(
  row: Record<string, unknown>, refs: RefData, errors: RowError[],
): string | null {
  const raw = str(row.billingId)
  if (raw) {
    if (refs.billingById.has(raw)) return raw
    errors.push({ column: 'billingId', message: `unknown billingId "${raw}"` })
    return null
  }
  const ref = str(row.billing_ref)
  if (!ref) return null
  const parts = ref.split('|').map((s) => s.trim())
  // Two-part form: "tenantId|billingMonth"
  if (parts.length === 2) {
    const [tid, month] = parts
    const found = refs.billingByKey.get(billingKey(tid, month))
    if (!found) errors.push({ column: 'billing_ref', message: `unknown billing "${ref}"` })
    return found ?? null
  }
  // Three-part form: "fullName|phone|billingMonth"
  if (parts.length === 3) {
    const [name, phone, month] = parts
    const tid = refs.tenantByKey.get(tenantKey(name, phone))
    if (!tid) {
      errors.push({ column: 'billing_ref', message: `unknown tenant in "${ref}"` })
      return null
    }
    const found = refs.billingByKey.get(billingKey(tid, month))
    if (!found) errors.push({ column: 'billing_ref', message: `unknown billing "${ref}"` })
    return found ?? null
  }
  errors.push({ column: 'billing_ref', message: `billing_ref "${ref}" must be tenantId|YYYY-MM or fullName|phone|YYYY-MM` })
  return null
}

// ---------- registry ----------

export const SHEETS: readonly SheetSchema[] = [
  ROOMS,
  TENANTS,
  CONTRACTS,
  BILLINGS,
  PAYMENTS,
  MAINTENANCE,
  EXPENSES,
  NOTICES,
]

export const SHEET_BY_NAME: Record<string, SheetSchema> = Object.fromEntries(
  SHEETS.map((s) => [s.name, s]),
)

// Sheets in dependency-safe order for import.
export const IMPORT_ORDER: readonly string[] = SHEETS.map((s) => s.name)
