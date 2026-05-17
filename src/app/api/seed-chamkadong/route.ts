import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as path from 'path'
import * as fs from 'fs'

// Shared Khmer field names (same as Takmoa)
const F_ROOM       = 'លេខបន្ទប់'
const F_TENANT     = 'អតិថិជន'
const F_PHONE      = 'ទំនាក់ទំនង'
const F_DEPOSIT    = 'ប្រាក់កក់'
const F_PREV_WATER = 'ទឹកលេខចាស់'
const F_CURR_WATER = 'ទឹកលេខថ្មី'
const F_RENT       = 'ថ្លៃជួលផ្ទះ'
const F_DEBT       = 'ជំពាក់'
const F_LATE_DAYS  = 'រយៈពេលបង់ប្រាក់យឺត'
const F_NOTES      = 'ផ្សេងៗ'
const F_MOVE_IN    = 'កាលបរិច្ឆេទចូលនៅ'
const F_CONTRACT   = 'កិច្ចសន្យា'
const F_HAS_TENANT = 'បន្ទប់មានភ្ញៀវ'
const F_DISCOUNT   = 'បញ្ចុះតំលៃ'

// Chamkadong-specific fields (electric readings)
const F_PREV_ELEC  = 'ភ្លើងលេខចាស់'
const F_CURR_ELEC  = 'ភ្លើងលេខថ្មី'

const HAS = 'មាន'

// 17 monthly billing sheets only (skip Paste Here For Invoice + Invoice sheets)
const SHEETS: Array<[string, string]> = [
  ['Jan(25)',       '2025-01'],
  ['Feb(25)',       '2025-02'],
  ['Mar(25)',       '2025-03'],
  ['Apr(25)',       '2025-04'],
  ['May(25)',       '2025-05'],
  ['June(25)',      '2025-06'],
  ['July(25)',      '2025-07'],
  ['August(25)',    '2025-08'],
  ['September(25)', '2025-09'],
  ['October(25)',   '2025-10'],
  ['Novembe(25)',   '2025-11'],
  ['December(25)',  '2025-12'],
  ['January(26)',   '2026-01'],
  ['February(26)',  '2026-02'],
  ['March(26)',     '2026-03'],
  ['April(26)',     '2026-04'],
  ['May(26)',       '2026-05'],
]

const CURRENT_MONTH = '2026-05'

const ELEC_RATE   = 800   // KHR per unit
const WATER_RATE  = 2000  // KHR per kib
const BILL_EXCH   = 4100  // KHR per USD
const LATE_RATE   = 1     // USD per late day

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function num(row: Row, field: string): number {
  const v = row[field]
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  if (typeof v === 'string') {
    if (v.startsWith('=')) return 0
    const n = parseFloat(v.replace(/[^0-9.-]/g, ''))
    return isNaN(n) ? 0 : n
  }
  return 0
}

function str(row: Row, field: string): string {
  const v = row[field]
  if (v == null) return ''
  if (typeof v === 'string') return v.startsWith('=') ? '' : v.trim()
  return String(v)
}

function parseDeposit(raw: unknown): number {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw
  const s = String(raw ?? '')
  if (!s || s === 'null' || s.includes('(') || s.length > 15) return 0
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : n
}

type TenantHistory = {
  name: string
  phone: string
  deposit: number
  moveIn: string
  contract: boolean
  months: string[]
  rentInLatestMonth: number
}

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'Not allowed in production' }, { status: 403 })
  }

  try {
    const dataPath = path.join(process.cwd(), 'all_tenant_data_CK.json')
    const rawData: Record<string, Row[]> = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))

    for (const [sheetName] of SHEETS) {
      if (!rawData[sheetName]?.length) {
        return NextResponse.json({ ok: false, error: `Missing sheet: ${sheetName}` }, { status: 400 })
      }
    }

    // ── Pass 1: build per-room tenant history across all 17 sheets ────────
    const roomHistory: Record<string, Record<string, TenantHistory>> = {}

    for (const [sheetName, billingMonth] of SHEETS) {
      const sheet: Row[] = rawData[sheetName]
      for (const row of sheet) {
        const roomNumber = String(num(row, F_ROOM))
        if (!roomNumber || roomNumber === '0') continue

        const name = str(row, F_TENANT)
        const rent = num(row, F_RENT)
        if (!rent || !name) continue

        if (!roomHistory[roomNumber]) roomHistory[roomNumber] = {}
        if (!roomHistory[roomNumber][name]) {
          const moveInRaw = str(row, F_MOVE_IN)
          roomHistory[roomNumber][name] = {
            name,
            phone: str(row, F_PHONE).split(/[,/]/)[0].trim(),
            deposit: parseDeposit(row[F_DEPOSIT]),
            moveIn: moveInRaw ? moveInRaw.slice(0, 10) : `${billingMonth}-01`,
            contract: str(row, F_CONTRACT) === HAS,
            months: [],
            rentInLatestMonth: rent,
          }
        }
        roomHistory[roomNumber][name].months.push(billingMonth)
        roomHistory[roomNumber][name].rentInLatestMonth = rent
      }
    }

    // Determine current tenant per room from May(26)
    const may26: Row[] = rawData['May(26)']
    const currentTenantByRoom: Record<string, string> = {}
    for (const row of may26) {
      const roomNumber = String(num(row, F_ROOM))
      const name = str(row, F_TENANT)
      const rent = num(row, F_RENT)
      if (rent > 0 && name) currentTenantByRoom[roomNumber] = name
    }

    // ── Remove existing Chamkadong data only ─────────────────────────────
    const existingRooms = await db.room.findMany({ where: { branch: 'Chamkadong' }, select: { id: true } })
    const existingRoomIds = existingRooms.map(r => r.id)

    if (existingRoomIds.length > 0) {
      // Delete in FK-safe order for Chamkadong rooms only
      await db.expense.deleteMany({ where: { roomId: { in: existingRoomIds } } })
      await db.payment.deleteMany({ where: { billing: { roomId: { in: existingRoomIds } } } })
      await db.billing.deleteMany({ where: { roomId: { in: existingRoomIds } } })
      await db.maintenance.deleteMany({ where: { roomId: { in: existingRoomIds } } })
      // Remove tenants linked to these rooms
      const ckTenants = await db.tenant.findMany({ where: { roomId: { in: existingRoomIds } }, select: { id: true } })
      const ckTenantIds = ckTenants.map(t => t.id)
      if (ckTenantIds.length > 0) {
        await db.contract.deleteMany({ where: { tenantId: { in: ckTenantIds } } })
        await db.invoice.deleteMany({ where: { tenantId: { in: ckTenantIds } } })
        await db.notification.deleteMany({ where: { tenantId: { in: ckTenantIds } } })
        await db.tenant.deleteMany({ where: { id: { in: ckTenantIds } } })
      }
      await db.room.deleteMany({ where: { id: { in: existingRoomIds } } })
    }

    // ── Create rooms (Chamkadong branch) ─────────────────────────────────
    const roomMap: Record<string, string> = {}

    for (const row of may26) {
      const roomNumber = String(num(row, F_ROOM))
      if (!roomNumber || roomNumber === '0') continue

      const room = await db.room.create({
        data: {
          roomNumber,
          branch: 'Chamkadong',
          floor: String(Math.floor(parseInt(roomNumber) / 100)),
          roomType: 'Standard',
          rentPriceUsd: num(row, F_RENT),
          depositAmount: parseDeposit(row[F_DEPOSIT]),
          status: currentTenantByRoom[roomNumber] ? 'occupied' : 'vacant',
          waterRateRiel: WATER_RATE,
          electricRateRiel: ELEC_RATE,
          notes: '',
        },
      })
      roomMap[roomNumber] = room.id
    }

    // ── Create tenants (active + inactive) ───────────────────────────────
    const tenantIdMap: Record<string, Record<string, string>> = {}
    let activeCount = 0, inactiveCount = 0, contractCount = 0

    for (const [roomNumber, byName] of Object.entries(roomHistory)) {
      const roomId = roomMap[roomNumber]
      if (!roomId) continue

      const currentName = currentTenantByRoom[roomNumber]
      tenantIdMap[roomNumber] = {}

      for (const th of Object.values(byName)) {
        const isActive = th.name === currentName
        const lastMonth = th.months[th.months.length - 1]

        const tenant = await db.tenant.create({
          data: {
            fullName: th.name,
            gender: 'Male',
            phone: th.phone,
            nationalId: '',
            emergencyContact: '',
            occupation: '',
            moveInDate: th.moveIn,
            ...(!isActive && { moveOutDate: `${lastMonth}-28` }),
            depositAmount: th.deposit,
            roomId,
            status: isActive ? 'active' : 'inactive',
            notes: '',
          },
        })

        tenantIdMap[roomNumber][th.name] = tenant.id
        isActive ? activeCount++ : inactiveCount++

        if (th.contract && isActive) {
          await db.contract.create({
            data: {
              tenantId: tenant.id,
              contractStart: th.moveIn,
              contractEnd: '',
              monthlyRent: th.rentInLatestMonth,
              depositAmount: th.deposit,
              status: 'active',
            },
          })
          contractCount++
        }
      }
    }

    // ── Create billing records per monthly sheet ──────────────────────────
    let totalBillings = 0

    for (const [sheetName, billingMonth] of SHEETS) {
      const sheet: Row[] = rawData[sheetName]
      const isPast = billingMonth < CURRENT_MONTH

      for (const row of sheet) {
        const roomNumber = String(num(row, F_ROOM))
        const roomId    = roomMap[roomNumber]
        const tenantName = str(row, F_TENANT)
        const tenantId   = tenantIdMap[roomNumber]?.[tenantName]
        if (!roomId || !tenantId) continue

        const rent = num(row, F_RENT)
        if (!rent) continue

        const prevElec      = num(row, F_PREV_ELEC)
        const currElec      = num(row, F_CURR_ELEC)
        const elecUsage     = Math.max(0, currElec - prevElec)
        const elecCostRiel  = elecUsage * ELEC_RATE

        const prevWater     = num(row, F_PREV_WATER)
        const currWater     = num(row, F_CURR_WATER)
        const waterUsage    = Math.max(0, currWater - prevWater)
        const waterCostRiel = waterUsage * WATER_RATE

        const debt          = num(row, F_DEBT)
        const lateDays      = num(row, F_LATE_DAYS)
        const latePenalty   = parseFloat((lateDays * LATE_RATE).toFixed(2))
        const discount      = num(row, F_DISCOUNT)
        const notes         = str(row, F_NOTES)

        const totalUsd = parseFloat(
          ((elecCostRiel + waterCostRiel) / BILL_EXCH + rent + debt + latePenalty - discount).toFixed(2)
        )
        const totalRiel = Math.round(totalUsd * BILL_EXCH)

        const billing = await db.billing.create({
          data: {
            tenantId,
            roomId,
            billingMonth,
            prevWaterReading: prevWater,
            currWaterReading: currWater,
            waterUsage,
            waterCostRiel,
            prevElectricReading: prevElec,
            currElectricReading: currElec,
            electricUsage: elecUsage,
            electricCostRiel: elecCostRiel,
            roomRentUsd: rent,
            outstandingDebtUsd: debt,
            lateDays,
            latePenaltyUsd: latePenalty,
            discountUsd: discount,
            totalUsd,
            totalRiel,
            exchangeRate: BILL_EXCH,
            paymentStatus: 'unpaid',
            notes,
          },
        })

        if (isPast) {
          await db.payment.create({
            data: {
              billingId: billing.id,
              amountUsd: totalUsd,
              amountRiel: totalRiel,
              paymentMethod: 'Cash',
              transactionRef: '',
            },
          })
          await db.billing.update({
            where: { id: billing.id },
            data: { paymentStatus: 'paid', paymentDate: `${billingMonth}-05` },
          })
        }

        totalBillings++
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Chamkadong branch data seeded successfully',
      summary: {
        rooms: Object.keys(roomMap).length,
        activeTenants: activeCount,
        inactiveTenants: inactiveCount,
        contracts: contractCount,
        billings: totalBillings,
      },
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
