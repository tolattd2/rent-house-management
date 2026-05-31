import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

const WATER_RATE = 2000
const ELEC_RATE = 720
const X_RATE = 4100
const PENALTY_RATE = 1

function calcBilling(
  prevW: number, currW: number, prevE: number, currE: number,
  rent: number, debt: number, lateDays: number, discount: number,
) {
  const wu = Math.max(0, currW - prevW)
  const eu = Math.max(0, currE - prevE)
  const wRiel = Math.round(wu * WATER_RATE)
  const eRiel = Math.round(eu * ELEC_RATE)
  const penalty = lateDays * PENALTY_RATE
  const total = Math.max(0, rent + (wRiel + eRiel) / X_RATE + debt + penalty - discount)
  return {
    waterUsage: wu, waterCostRiel: wRiel,
    electricUsage: eu, electricCostRiel: eRiel,
    latePenaltyUsd: parseFloat(penalty.toFixed(2)),
    totalUsd: parseFloat(total.toFixed(2)),
    totalRiel: Math.round(total * X_RATE),
  }
}

function monthOffset(offset: number) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Room definitions ────────────────────────────────────────────────────────
type RoomStatus = 'occupied' | 'vacant' | 'maintenance'

interface RoomDef {
  roomNumber: string
  branch: string
  floor: string
  roomType: string
  rentPriceUsd: number
  status: RoomStatus
  waterRateRiel: number
  electricRateRiel: number
  notes: string
  depositAmount: number
}

function makeTakmoaRooms(): RoomDef[] {
  const floors = [
    { floor: 1, count: 14, type: 'Standard', rent: 150 },
    { floor: 2, count: 14, type: 'Deluxe',   rent: 200 },
    { floor: 3, count: 14, type: 'Studio',   rent: 180 },
    { floor: 4, count: 14, type: 'Standard', rent: 150 },
    { floor: 5, count: 14, type: 'Suite',    rent: 250 },
  ]
  // rooms per floor that will be occupied (1-indexed)
  const occupiedPerFloor: Record<number, number[]> = {
    1: [1,2,3,4,5,6],
    2: [1,2,3,4,5],
    3: [1,2,3,4],
    4: [1,2,3],
    5: [1,2,3,4],
  }
  const maintenancePerFloor: Record<number, number[]> = {
    1: [7], 2: [6], 3: [], 4: [], 5: [5],
  }
  const rooms: RoomDef[] = []
  for (const { floor, count, type, rent } of floors) {
    for (let n = 1; n <= count; n++) {
      const roomNumber = `${floor}${String(n).padStart(2, '0')}`
      let status: RoomStatus = 'vacant'
      if (occupiedPerFloor[floor]?.includes(n)) status = 'occupied'
      else if (maintenancePerFloor[floor]?.includes(n)) status = 'maintenance'
      rooms.push({ roomNumber, branch: 'Takmoa', floor: `Floor ${floor}`, roomType: type, rentPriceUsd: rent, status, waterRateRiel: 2000, electricRateRiel: 720, notes: '', depositAmount: rent })
    }
  }
  return rooms
}

function makeChamkadongRooms(): RoomDef[] {
  const floors = [
    { floor: 1, count: 8,  type: 'Standard', rent: 150 },
    { floor: 2, count: 9,  type: 'Deluxe',   rent: 200 },
    { floor: 3, count: 8,  type: 'Studio',   rent: 180 },
  ]
  const occupiedPerFloor: Record<number, number[]> = {
    1: [1,2,3], 2: [1,2,3,4], 3: [1,2],
  }
  const maintenancePerFloor: Record<number, number[]> = {
    1: [4], 2: [], 3: [],
  }
  const rooms: RoomDef[] = []
  for (const { floor, count, type, rent } of floors) {
    for (let n = 1; n <= count; n++) {
      const roomNumber = `${floor}${String(n).padStart(2, '0')}`
      let status: RoomStatus = 'vacant'
      if (occupiedPerFloor[floor]?.includes(n)) status = 'occupied'
      else if (maintenancePerFloor[floor]?.includes(n)) status = 'maintenance'
      rooms.push({ roomNumber, branch: 'Chamkadong', floor: `Floor ${floor}`, roomType: type, rentPriceUsd: rent, status, waterRateRiel: 2000, electricRateRiel: 720, notes: '', depositAmount: rent })
    }
  }
  return rooms
}

// ── Tenant pool ─────────────────────────────────────────────────────────────
const tenantPool = [
  { fullName: 'Sok Dara',      gender: 'Male',   phone: '012 345 678', occupation: 'Teacher',          payDay: 5  },
  { fullName: 'Chan Sophea',   gender: 'Female', phone: '078 234 567', occupation: 'Nurse',             payDay: 1  },
  { fullName: 'Lim Piseth',    gender: 'Male',   phone: '017 345 678', occupation: 'Engineer',          payDay: 10 },
  { fullName: 'Phan Kimly',    gender: 'Female', phone: '096 456 789', occupation: 'Business Owner',    payDay: 1  },
  { fullName: 'Nget Bopha',    gender: 'Female', phone: '089 567 890', occupation: 'Student',           payDay: 15 },
  { fullName: 'Keo Bunna',     gender: 'Male',   phone: '011 678 901', occupation: 'Driver',            payDay: 5  },
  { fullName: 'Yem Sreymom',   gender: 'Female', phone: '097 789 012', occupation: 'Accountant',        payDay: 1  },
  { fullName: 'Heng Sothea',   gender: 'Male',   phone: '016 890 123', occupation: 'Security Guard',    payDay: 10 },
  { fullName: 'Pov Chanda',    gender: 'Female', phone: '077 901 234', occupation: 'Shop Owner',        payDay: 5  },
  { fullName: 'Ros Veasna',    gender: 'Male',   phone: '015 012 345', occupation: 'Mechanic',          payDay: 15 },
  { fullName: 'Mam Kalyanee',  gender: 'Female', phone: '069 123 456', occupation: 'Pharmacist',        payDay: 1  },
  { fullName: 'Kong Borin',    gender: 'Male',   phone: '013 234 567', occupation: 'IT Technician',     payDay: 5  },
  { fullName: 'Chhun Dalin',   gender: 'Female', phone: '092 345 678', occupation: 'Seamstress',        payDay: 10 },
  { fullName: 'Tep Kosal',     gender: 'Male',   phone: '018 456 789', occupation: 'Chef',              payDay: 1  },
  { fullName: 'Bun Sokvanny',  gender: 'Female', phone: '098 567 890', occupation: 'Hairdresser',       payDay: 5  },
  { fullName: 'Nget Makara',   gender: 'Male',   phone: '012 678 901', occupation: 'Farmer',            payDay: 15 },
  { fullName: 'Hor Sreynich',  gender: 'Female', phone: '078 789 012', occupation: 'Factory Worker',    payDay: 1  },
  { fullName: 'Oun Sopheak',   gender: 'Male',   phone: '017 890 123', occupation: 'Salesman',          payDay: 10 },
  { fullName: 'Kem Botum',     gender: 'Female', phone: '096 901 234', occupation: 'Social Worker',     payDay: 5  },
  { fullName: 'Mean Sovann',   gender: 'Male',   phone: '089 012 345', occupation: 'Police Officer',    payDay: 1  },
  { fullName: 'Srey Leak',     gender: 'Female', phone: '011 123 456', occupation: 'Nurse',             payDay: 10 },
  { fullName: 'Im Bunthoeun',  gender: 'Male',   phone: '097 234 567', occupation: 'Construction Worker', payDay: 5 },
  // Chamkadong tenants
  { fullName: 'Sam Chanmony',  gender: 'Male',   phone: '016 345 678', occupation: 'Barber',            payDay: 1  },
  { fullName: 'Kang Chanmony', gender: 'Female', phone: '077 456 789', occupation: 'Teacher',           payDay: 5  },
  { fullName: 'Touch Vibol',   gender: 'Male',   phone: '015 567 890', occupation: 'Electrician',       payDay: 10 },
  { fullName: 'Leng Sotheary', gender: 'Female', phone: '069 678 901', occupation: 'Accountant',        payDay: 1  },
  { fullName: 'Pich Rathana',  gender: 'Male',   phone: '013 789 012', occupation: 'Doctor',            payDay: 5  },
  { fullName: 'Mao Chanthy',   gender: 'Female', phone: '092 890 123', occupation: 'Lecturer',          payDay: 15 },
  { fullName: 'Khy Solida',    gender: 'Female', phone: '018 901 234', occupation: 'Banker',            payDay: 1  },
  // Inactive tenants
  { fullName: 'Rin Sophana',   gender: 'Male',   phone: '098 012 345', occupation: 'Graduated Student', payDay: 1  },
  { fullName: 'Chan Pisey',    gender: 'Female', phone: '012 111 222', occupation: 'Returned Home',     payDay: 1  },
  { fullName: 'Sok Virak',     gender: 'Male',   phone: '078 222 333', occupation: 'Relocated',         payDay: 1  },
  { fullName: 'Neang Ratana',  gender: 'Female', phone: '017 333 444', occupation: 'Moved Abroad',      payDay: 1  },
]

const payMethods = ['Cash', 'ABA_Pay', 'Wing', 'TrueMoney', 'Bank_Transfer'] as const

async function main() {
  console.log('🌱 Seeding database...')

  await db.notification.deleteMany()
  await db.invoice.deleteMany()
  await db.payment.deleteMany()
  await db.billing.deleteMany()
  await db.contract.deleteMany()
  await db.tenant.deleteMany()
  await db.room.deleteMany()

  // Settings
  const defaultSettings = [
    { key: 'exchange_rate',     value: '4100', label: 'USD to KHR Rate' },
    { key: 'water_rate_riel',   value: '2000', label: 'Water Rate (KHR/Kib)' },
    { key: 'electric_rate_riel',value: '720',  label: 'Electric Rate (KHR/KW)' },
    { key: 'late_penalty_mode',           value: 'flat', label: 'Late Penalty Mode' },
    { key: 'late_penalty_flat_usd',       value: '10',   label: 'Late Penalty (flat USD)' },
    { key: 'late_penalty_threshold_days', value: '10',   label: 'Late Penalty After (days)' },
    { key: 'late_penalty_usd',  value: '1',    label: 'Late Penalty (USD/day)' },
    { key: 'company_name',      value: 'Takmao Rental Management', label: 'Company Name' },
    { key: 'company_phone',     value: '012 999 888', label: 'Company Phone' },
    { key: 'company_address',   value: 'Takmoa, Kandal Province, Cambodia', label: 'Company Address' },
    { key: 'telegram_token',    value: '', label: 'Telegram Bot Token' },
    { key: 'telegram_chat_id',  value: '', label: 'Telegram Chat ID' },
  ]
  for (const s of defaultSettings) {
    await db.setting.upsert({ where: { key: s.key }, update: {}, create: s })
  }
  console.log('✅ Settings seeded')

  // Admin user
  await db.user.upsert({
    where: { email: 'admin@takmao.com' },
    update: {},
    create: { name: 'Administrator', email: 'admin@takmao.com', password: await bcrypt.hash('admin123', 10), role: 'admin', phone: '012 999 888' },
  })
  console.log('✅ Admin user seeded')

  // ── Rooms ──────────────────────────────────────────────────────────────────
  const allRoomDefs = [...makeTakmoaRooms(), ...makeChamkadongRooms()]
  await db.room.createMany({ data: allRoomDefs as any })
  console.log(`✅ ${allRoomDefs.length} rooms created (70 Takmoa + 25 Chamkadong)`)

  // Fetch created rooms
  const allRooms = await db.room.findMany({ orderBy: [{ branch: 'asc' }, { floor: 'asc' }, { roomNumber: 'asc' }] })
  const occupiedRooms = allRooms.filter((r) => r.status === 'occupied')
  console.log(`   ${occupiedRooms.length} occupied, ${allRooms.filter(r => r.status === 'vacant').length} vacant, ${allRooms.filter(r => r.status === 'maintenance').length} maintenance`)

  // ── Active tenants (one per occupied room) ─────────────────────────────────
  const moveInYears = ['2023-06', '2023-08', '2023-10', '2024-01', '2024-03', '2024-05', '2024-07', '2024-09', '2025-01', '2025-03']
  const activeTenants = []

  for (let i = 0; i < occupiedRooms.length; i++) {
    const room = occupiedRooms[i]
    const profile = tenantPool[i % (tenantPool.length - 4)] // exclude last 4 (inactive)
    const moveInDate = `${moveInYears[i % moveInYears.length]}-0${(i % 9) + 1}`.replace('-0', '-').replace(/-(\d{2})-0/, '-$1-0')
    // clean up date
    const [y, m] = moveInYears[i % moveInYears.length].split('-')
    const day = String((i % 25) + 1).padStart(2, '0')
    const cleanMoveIn = `${y}-${m}-${day}`

    // some tenants have custom rent (different from room default)
    const monthlyRent = i % 5 === 0 ? room.rentPriceUsd - 10 : room.rentPriceUsd

    const tenant = await db.tenant.create({
      data: {
        fullName: `${profile.fullName}${i >= tenantPool.length - 4 ? ` ${i}` : ''}`,
        gender: profile.gender,
        phone: profile.phone,
        nationalId: `${100000000 + i * 7}`,
        emergencyContact: `Family 01${i % 9} ${String(i * 111).padStart(6, '0')}`,
        occupation: profile.occupation,
        moveInDate: cleanMoveIn,
        depositAmount: room.rentPriceUsd,
        monthlyRent,
        payDay: profile.payDay,
        status: 'active',
        roomId: room.id,
        notes: i % 7 === 0 ? 'Long-term tenant' : '',
      },
    })
    activeTenants.push({ tenant, room, monthlyRent })
  }
  console.log(`✅ ${activeTenants.length} active tenants created`)

  // ── Inactive tenants (moved out) ──────────────────────────────────────────
  const inactiveProfiles = tenantPool.slice(-4)
  const inactiveRooms = allRooms.filter((r) => r.branch === 'Takmoa' && r.status === 'vacant').slice(0, 4)
  const inactiveTenants = []
  for (let i = 0; i < inactiveProfiles.length; i++) {
    const p = inactiveProfiles[i]
    const t = await db.tenant.create({
      data: {
        fullName: p.fullName, gender: p.gender, phone: p.phone,
        nationalId: `${900000000 + i * 3}`,
        occupation: p.occupation,
        moveInDate: `2023-0${i + 1}-10`,
        moveOutDate: `2025-0${i + 1}-28`,
        depositAmount: 150, monthlyRent: 150, payDay: 1,
        status: 'inactive',
        roomId: null,
        notes: 'Moved out',
      },
    })
    inactiveTenants.push({ tenant: t, room: inactiveRooms[i] })
  }
  console.log(`✅ ${inactiveTenants.length} inactive tenants created`)

  // ── Contracts ─────────────────────────────────────────────────────────────
  for (const { tenant, room, monthlyRent } of activeTenants) {
    await db.contract.create({
      data: {
        tenantId: tenant.id,
        contractStart: tenant.moveInDate,
        contractEnd: '', // open-ended
        monthlyRent,
        depositAmount: room.rentPriceUsd,
        status: 'active',
      },
    })
  }
  // Expired contracts for inactive tenants
  for (let i = 0; i < inactiveTenants.length; i++) {
    const { tenant } = inactiveTenants[i]
    await db.contract.create({
      data: {
        tenantId: tenant.id,
        contractStart: tenant.moveInDate,
        contractEnd: tenant.moveOutDate,
        monthlyRent: 150, depositAmount: 150,
        status: 'expired',
      },
    })
  }
  console.log('✅ Contracts created')

  // ── Billings: 4 months per active tenant ─────────────────────────────────
  let billingCount = 0
  let paymentCount = 0
  const overdueNotifications: string[] = []

  for (let ti = 0; ti < activeTenants.length; ti++) {
    const { tenant, room, monthlyRent } = activeTenants[ti]
    let prevW = 100 + ti * 10
    let prevE = 400 + ti * 15

    for (let mo = -3; mo <= 0; mo++) {
      const month = monthOffset(mo)
      const wUsed = 10 + Math.floor(ti % 5) + mo + 3
      const eUsed = 40 + Math.floor(ti % 8) + mo * 2 + 6
      const currW = prevW + Math.max(1, wUsed)
      const currE = prevE + Math.max(1, eUsed)

      // some tenants have late fees or discounts
      const lateDays = (ti % 6 === 0 && mo === -1) ? 5 : (ti % 9 === 0 && mo === 0) ? 8 : 0
      const discount = (ti % 7 === 0 && mo === 0) ? 5 : 0
      const debt = (mo === -1 && ti % 11 === 0) ? 10 : 0

      const calc = calcBilling(prevW, currW, prevE, currE, monthlyRent, debt, lateDays, discount)

      const billing = await db.billing.create({
        data: {
          tenantId: tenant.id, roomId: room.id, billingMonth: month,
          prevWaterReading: prevW, currWaterReading: currW,
          waterUsage: calc.waterUsage, waterCostRiel: calc.waterCostRiel,
          prevElectricReading: prevE, currElectricReading: currE,
          electricUsage: calc.electricUsage, electricCostRiel: calc.electricCostRiel,
          roomRentUsd: monthlyRent, outstandingDebtUsd: debt,
          lateDays, latePenaltyUsd: calc.latePenaltyUsd,
          discountUsd: discount,
          totalUsd: calc.totalUsd, totalRiel: calc.totalRiel,
          exchangeRate: X_RATE, paymentStatus: 'unpaid',
        },
      })
      billingCount++

      // Payment logic:
      // months -3 and -2: fully paid
      // month -1: mostly paid, a few partial
      // month 0 (current): some paid, some unpaid, some partial
      const isFullyPaid = mo <= -2
      const isPartial = !isFullyPaid && mo === -1 && ti % 5 === 0
      const isPaid = !isPartial && mo === 0 && ti % 3 !== 0

      if (isFullyPaid || isPaid) {
        const method = payMethods[ti % payMethods.length]
        await db.payment.create({
          data: { billingId: billing.id, amountUsd: calc.totalUsd, amountRiel: calc.totalRiel, paymentMethod: method, transactionRef: isFullyPaid ? '' : `REF${ti}${mo}` },
        })
        await db.billing.update({ where: { id: billing.id }, data: { paymentStatus: 'paid', paymentDate: `${month}-0${(ti % 9) + 1}` } })
        paymentCount++
      } else if (isPartial) {
        const partial = parseFloat((calc.totalUsd / 2).toFixed(2))
        await db.payment.create({
          data: { billingId: billing.id, amountUsd: partial, amountRiel: Math.round(partial * X_RATE), paymentMethod: 'Cash' },
        })
        await db.billing.update({ where: { id: billing.id }, data: { paymentStatus: 'partial' } })
        paymentCount++
      }
      // else: stays unpaid

      if (mo === 0 && ti % 3 !== 0 && !isPaid) {
        overdueNotifications.push(tenant.id)
      }

      prevW = currW
      prevE = currE
    }
  }
  console.log(`✅ ${billingCount} billings, ${paymentCount} payments created`)

  // ── Billing for inactive tenants (historical) ──────────────────────────────
  for (let i = 0; i < inactiveTenants.length; i++) {
    const { tenant } = inactiveTenants[i]
    const fakeRoom = inactiveRooms[i]
    if (!fakeRoom) continue
    for (let mo = -5; mo <= -2; mo++) {
      const month = monthOffset(mo)
      const calc = calcBilling(100 + i * 5, 110 + i * 5, 400 + i * 8, 440 + i * 8, 150, 0, 0, 0)
      const billing = await db.billing.create({
        data: {
          tenantId: tenant.id, roomId: fakeRoom.id, billingMonth: month,
          prevWaterReading: 100 + i * 5, currWaterReading: 110 + i * 5,
          waterUsage: calc.waterUsage, waterCostRiel: calc.waterCostRiel,
          prevElectricReading: 400 + i * 8, currElectricReading: 440 + i * 8,
          electricUsage: calc.electricUsage, electricCostRiel: calc.electricCostRiel,
          roomRentUsd: 150, outstandingDebtUsd: 0, lateDays: 0, latePenaltyUsd: 0,
          discountUsd: 0, totalUsd: calc.totalUsd, totalRiel: calc.totalRiel,
          exchangeRate: X_RATE, paymentStatus: 'paid', paymentDate: `${month}-05`,
        },
      })
      await db.payment.create({
        data: { billingId: billing.id, amountUsd: calc.totalUsd, amountRiel: calc.totalRiel, paymentMethod: 'Cash' },
      })
    }
  }
  console.log('✅ Inactive tenant billing history created')

  // ── Notifications ─────────────────────────────────────────────────────────
  for (const tenantId of overdueNotifications.slice(0, 10)) {
    await db.notification.create({
      data: { tenantId, type: 'reminder', message: 'Payment reminder: your bill for this month is overdue.', status: 'pending' },
    })
  }
  // A few "sent" notifications for variety
  if (activeTenants.length > 2) {
    await db.notification.create({
      data: { tenantId: activeTenants[0].tenant.id, type: 'reminder', message: 'Rent due reminder sent via Telegram.', status: 'sent' },
    })
    await db.notification.create({
      data: { tenantId: activeTenants[1].tenant.id, type: 'invoice', message: 'Invoice generated and sent.', status: 'sent' },
    })
    await db.notification.create({
      data: { tenantId: activeTenants[2].tenant.id, type: 'reminder', message: 'Late payment notice.', status: 'failed' },
    })
  }
  console.log('✅ Notifications created')

  const totals = {
    rooms: allRooms.length,
    occupied: occupiedRooms.length,
    tenants: activeTenants.length + inactiveTenants.length,
    active: activeTenants.length,
    inactive: inactiveTenants.length,
  }
  console.log(`\n🎉 Seed complete!`)
  console.log(`   Rooms: ${totals.rooms} (${totals.occupied} occupied)`)
  console.log(`   Tenants: ${totals.tenants} (${totals.active} active, ${totals.inactive} inactive)`)
  console.log(`   Billings: ${billingCount} | Payments: ${paymentCount}`)
  console.log(`   Login: admin@takmao.com / admin123`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
