import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import * as path from 'path'
import * as fs from 'fs'

// Khmer field name constants (verified against JSON)
const F_ROOM       = 'លេខបន្ទប់'
const F_TENANT     = 'អតិថិជន'
const F_PHONE      = 'ទំនាក់ទំនង'
const F_DEPOSIT    = 'ប្រាក់កក់'
const F_PREV_WATER = 'ទឹកលេខចាស់'
const F_CURR_WATER = 'ទឹកលេខថ្មី'
const F_RENT       = 'ថ្លៃជួលផ្ទះ'
const F_DEBT       = 'ជំពាក់'
const F_LATE_DAYS  = 'រយៈពេលបង់ប្រាក់យឺត'
const F_DISCOUNT   = 'ប្រាក់បញ្ចុះតំលៃ'
const F_NOTES      = 'ផ្សេងៗ'
const F_MOVE_IN    = 'កាលបរិច្ឆេទចូលនៅ'
const F_CONTRACT   = 'កិច្ចសន្យា'

const HAS = 'មាន' // contract = yes

// 17 monthly sheets in chronological order (skip Past/Invoice sheets)
const SHEETS: Array<[string, string]> = [
  ['Jan25',         '2025-01'],
  ['Feb25',         '2025-02'],
  ['Mar25',         '2025-03'],
  ['April25',       '2025-04'],
  ['May(25)',       '2025-05'],
  ['June(25)',      '2025-06'],
  ['July(25)',      '2025-07'],
  ['August(25)',    '2025-08'],
  ['September(25)', '2025-09'],
  ['October(25)',   '2025-10'],
  ['November(25)',  '2025-11'],
  ['December(25)',  '2025-12'],
  ['Janurary(26)',  '2026-01'],
  ['February(26)',  '2026-02'],
  ['March(26)',     '2026-03'],
  ['April(26)',     '2026-04'],
  ['May(26)',       '2026-05'],
]

const CURRENT_MONTH = '2026-05'

const WATER_RATE    = 2000
const WATER_EXCH    = 4000
const BILL_EXCH     = 4100
const LATE_RATE_USD = 1

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
  months: string[]        // billing months this tenant appeared
  rentInLatestMonth: number
}

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'Not allowed in production' }, { status: 403 })
  }

  try {
    const dataPath = path.join(process.cwd(), 'all_tenant_data.json')
    const rawData: Record<string, Row[]> = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))

    // ── Validate sheets exist ─────────────────────────────────────────────
    for (const [sheetName] of SHEETS) {
      if (!rawData[sheetName]?.length) {
        return NextResponse.json({ ok: false, error: `Missing sheet: ${sheetName}` }, { status: 400 })
      }
    }

    // ── Pass 1: build per-room tenant history from all 17 sheets ─────────
    // roomHistory[roomNumber][tenantName] = TenantHistory
    const roomHistory: Record<string, Record<string, TenantHistory>> = {}

    for (const [sheetName, billingMonth] of SHEETS) {
      const sheet: Row[] = rawData[sheetName]
      for (const row of sheet) {
        const roomNumber = String(num(row, F_ROOM))
        if (!roomNumber || roomNumber === '0') continue

        const name = str(row, F_TENANT)
        const rent = num(row, F_RENT)
        if (!rent || !name || name.toLowerCase() === 'office') continue

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

    // Determine which tenant is CURRENT for each room (the one in May(26))
    const may26: Row[] = rawData['May(26)']
    const currentTenantByRoom: Record<string, string> = {}
    for (const row of may26) {
      const roomNumber = String(num(row, F_ROOM))
      const name = str(row, F_TENANT)
      const rent = num(row, F_RENT)
      if (rent > 0 && name && name.toLowerCase() !== 'office') {
        currentTenantByRoom[roomNumber] = name
      }
    }

    // ── Clear all data (FK-safe order) ───────────────────────────────────
    await db.expense.deleteMany()
    await db.notification.deleteMany()
    await db.invoice.deleteMany()
    await db.payment.deleteMany()
    await db.billing.deleteMany()
    await db.contract.deleteMany()
    await db.maintenance.deleteMany()
    await db.tenant.deleteMany()
    await db.room.deleteMany()

    // ── Settings ──────────────────────────────────────────────────────────
    const settingsDefs = [
      { key: 'exchange_rate',      value: '4100', label: 'USD to KHR Rate' },
      { key: 'water_rate_riel',    value: '2000', label: 'Water Rate (KHR/unit)' },
      { key: 'electric_rate_riel', value: '720',  label: 'Electric Rate (KHR/unit)' },
      { key: 'late_penalty_mode',           value: 'flat', label: 'Late Penalty Mode' },
      { key: 'late_penalty_flat_usd',       value: '10',   label: 'Late Penalty (flat USD)' },
      { key: 'late_penalty_threshold_days', value: '10',   label: 'Late Penalty After (days)' },
      { key: 'late_penalty_usd',   value: '1',    label: 'Late Penalty (USD/day)' },
      { key: 'company_name',       value: 'Takmao Rental Management', label: 'Company Name' },
      { key: 'company_phone',      value: '',     label: 'Company Phone' },
      { key: 'company_address',    value: 'Phnom Penh, Cambodia', label: 'Company Address' },
      { key: 'telegram_token',     value: '',     label: 'Telegram Bot Token' },
      { key: 'telegram_chat_id',   value: '',     label: 'Telegram Chat ID' },
    ]
    for (const s of settingsDefs) {
      await db.setting.upsert({ where: { key: s.key }, update: {}, create: s })
    }

    // ── Admin user ────────────────────────────────────────────────────────
    if (!await db.user.findUnique({ where: { email: 'admin@takmao.com' } })) {
      await db.user.create({
        data: {
          name: 'Administrator',
          email: 'admin@takmao.com',
          password: await bcrypt.hash('admin123', 10),
          role: 'admin',
          phone: '',
        },
      })
    }

    // ── Rooms — all unique room numbers from May(26), Takmoa branch ──────
    const may26Rows: Row[] = rawData['May(26)']
    const roomMap: Record<string, string> = {}

    for (const row of may26Rows) {
      const roomNumber = String(num(row, F_ROOM))
      if (!roomNumber || roomNumber === '0') continue

      const currentName = currentTenantByRoom[roomNumber]
      const room = await db.room.create({
        data: {
          roomNumber,
          branch: 'Takmoa',
          floor: String(Math.floor(parseInt(roomNumber) / 100)),
          roomType: 'Standard',
          rentPriceUsd: num(row, F_RENT),
          depositAmount: parseDeposit(row[F_DEPOSIT]),
          status: currentName ? 'occupied' : 'vacant',
          waterRateRiel: WATER_RATE,
          electricRateRiel: 720,
          notes: '',
        },
      })
      roomMap[roomNumber] = room.id
    }

    // ── Pass 2: create all tenants (active + inactive) ───────────────────
    // tenantIdMap[roomNumber][tenantName] = tenantId
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
        const moveOutDate = isActive ? undefined : `${lastMonth}-28`

        const tenant = await db.tenant.create({
          data: {
            fullName: th.name,
            gender: 'Male',
            phone: th.phone,
            nationalId: '',
            emergencyContact: '',
            occupation: '',
            moveInDate: th.moveIn,
            ...(moveOutDate && { moveOutDate }),
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

    // ── Pass 3: billing records — link to the tenant for each month ───────
    let totalBillings = 0

    for (const [sheetName, billingMonth] of SHEETS) {
      const sheet: Row[] = rawData[sheetName]
      const isPast = billingMonth < CURRENT_MONTH

      for (const row of sheet) {
        const roomNumber = String(num(row, F_ROOM))
        const roomId     = roomMap[roomNumber]
        if (!roomId) continue

        const rent = num(row, F_RENT)
        if (!rent) continue

        const tenantName = str(row, F_TENANT)
        if (!tenantName || tenantName.toLowerCase() === 'office') continue

        const tenantId = tenantIdMap[roomNumber]?.[tenantName]
        if (!tenantId) continue

        const prevWater     = num(row, F_PREV_WATER)
        const currWater     = num(row, F_CURR_WATER)
        const waterUsage    = Math.max(0, currWater - prevWater)
        const waterCostRiel = waterUsage * WATER_RATE
        const debt          = num(row, F_DEBT)
        const lateDays      = num(row, F_LATE_DAYS)
        const latePenalty   = parseFloat((lateDays * LATE_RATE_USD).toFixed(2))
        const discount      = num(row, F_DISCOUNT)
        const notes         = str(row, F_NOTES)

        const totalUsd = parseFloat(
          (waterCostRiel / WATER_EXCH + rent + debt + latePenalty - discount).toFixed(2)
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
            prevElectricReading: 0,
            currElectricReading: 0,
            electricUsage: 0,
            electricCostRiel: 0,
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
      message: 'Takmoa branch data seeded successfully',
      summary: {
        rooms: Object.keys(roomMap).length,
        activetenants: activeCount,
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
