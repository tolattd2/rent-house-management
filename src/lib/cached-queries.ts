import { unstable_cache } from 'next/cache'
import { db } from './db'
import { parseBranches, type Branch } from './branches'

export const TAGS = {
  rooms: 'rooms',
  tenants: 'tenants',
  billings: 'billings',
  invoices: 'invoices',
  expenses: 'expenses',
  payments: 'payments',
  settings: 'settings',
  maintenance: 'maintenance',
  notifications: 'notifications',
  period_locks: 'period_locks',
} as const

const REVALIDATE_SECONDS = 300

export const getRoomsList = unstable_cache(
  async () =>
    db.room.findMany({
      include: {
        tenants: {
          where: { status: 'active' },
          select: { id: true, fullName: true, phone: true, phonesExtra: true, moveInDate: true },
          take: 1,
        },
        // Count of open notices filed against this room so the room card
        // can surface a badge without a second round-trip.
        _count: {
          select: { notices: { where: { status: 'open' } } },
        },
      },
      orderBy: [{ roomNumber: 'asc' }],
    }),
  ['rooms-list'],
  { tags: [TAGS.rooms, TAGS.tenants], revalidate: REVALIDATE_SECONDS },
)

export const getTenantsList = unstable_cache(
  async () =>
    db.tenant.findMany({
      include: {
        room: { select: { id: true, roomNumber: true, branch: true, rentPriceUsd: true } },
        billings: {
          where: { paymentStatus: { in: ['unpaid', 'partial'] } },
          select: { id: true, totalUsd: true, paymentStatus: true, billingMonth: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ['tenants-list'],
  { tags: [TAGS.tenants, TAGS.rooms, TAGS.billings], revalidate: REVALIDATE_SECONDS },
)

export const getTenantsRoomsLookup = unstable_cache(
  async () =>
    db.room.findMany({
      where: { status: { in: ['vacant', 'occupied'] } },
      select: { id: true, roomNumber: true, branch: true, status: true, rentPriceUsd: true },
      orderBy: { roomNumber: 'asc' },
    }),
  ['tenants-rooms-lookup'],
  { tags: [TAGS.rooms], revalidate: REVALIDATE_SECONDS },
)

export const getBillingsList = unstable_cache(
  async () =>
    db.billing.findMany({
      include: {
        tenant: { select: { id: true, fullName: true, phone: true, payDay: true } },
        room: { select: { id: true, roomNumber: true, branch: true } },
        payments: { select: { id: true, amountUsd: true } },
      },
      orderBy: [{ billingMonth: 'desc' }, { createdAt: 'desc' }],
    }),
  ['billings-list'],
  { tags: [TAGS.billings, TAGS.payments, TAGS.tenants, TAGS.rooms], revalidate: REVALIDATE_SECONDS },
)

export const getInvoicesList = unstable_cache(
  async () =>
    db.invoice.findMany({
      include: {
        tenant: { select: { id: true, fullName: true } },
        billing: {
          select: {
            billingMonth: true,
            totalUsd: true,
            paymentStatus: true,
            room: { select: { id: true, roomNumber: true, branch: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ['invoices-list'],
  { tags: [TAGS.invoices, TAGS.billings, TAGS.tenants], revalidate: REVALIDATE_SECONDS },
)

export const getExpensesList = unstable_cache(
  async () =>
    db.expense.findMany({
      include: {
        room: { select: { id: true, roomNumber: true, branch: true } },
        maintenance: { select: { id: true, title: true } },
      },
      orderBy: { expenseDate: 'desc' },
    }),
  ['expenses-list'],
  { tags: [TAGS.expenses, TAGS.rooms, TAGS.maintenance], revalidate: REVALIDATE_SECONDS },
)

export const getExpensesRoomsLookup = unstable_cache(
  async () =>
    db.room.findMany({
      select: { id: true, roomNumber: true, branch: true },
      orderBy: { roomNumber: 'asc' },
    }),
  ['expenses-rooms-lookup'],
  { tags: [TAGS.rooms], revalidate: REVALIDATE_SECONDS },
)

export const getDashboardData = unstable_cache(
  async () => {
    const [rooms, tenants, billings, expenses, unpaidBillings, openNotices] = await Promise.all([
      db.room.findMany({ select: { id: true, branch: true, status: true } }),
      db.tenant.findMany({ select: { id: true, status: true, roomId: true } }),
      db.billing.findMany({
        select: {
          id: true,
          billingMonth: true,
          totalUsd: true,
          paymentStatus: true,
          room: { select: { branch: true } },
          payments: { select: { amountUsd: true } },
        },
      }),
      db.expense.findMany({
        select: {
          id: true,
          amountUsd: true,
          expenseDate: true,
          room: { select: { branch: true } },
        },
      }),
      db.billing.findMany({
        where: { paymentStatus: { in: ['unpaid', 'partial'] } },
        select: {
          id: true,
          billingMonth: true,
          totalUsd: true,
          totalRiel: true,
          paymentStatus: true,
          tenant: { select: { id: true, fullName: true, phone: true, phonesExtra: true } },
          room: { select: { id: true, roomNumber: true, branch: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.tenantNotice.findMany({
        where: { status: 'open' },
        select: {
          id: true, type: true, message: true, expectedDate: true, createdAt: true,
          tenant: {
            select: {
              id: true, fullName: true,
              room: { select: { roomNumber: true, branch: true } },
            },
          },
          // Room is independent so move-in / vacant-room notices still show
          // a location even when no tenant is attached.
          room: { select: { roomNumber: true, branch: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return { rooms, tenants, billings, expenses, unpaidBillings, openNotices }
  },
  ['dashboard-data'],
  {
    tags: [TAGS.rooms, TAGS.tenants, TAGS.billings, TAGS.expenses, TAGS.payments],
    revalidate: REVALIDATE_SECONDS,
  },
)

export const getSettingsMap = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const rows = await db.setting.findMany()
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  },
  ['settings-map'],
  { tags: [TAGS.settings], revalidate: REVALIDATE_SECONDS },
)

export const getBranches = unstable_cache(
  async (): Promise<Branch[]> => {
    const row = await db.setting.findUnique({ where: { key: 'branches' } })
    return parseBranches(row?.value)
  },
  ['branches'],
  { tags: [TAGS.settings], revalidate: REVALIDATE_SECONDS },
)

export const getMaintenanceData = unstable_cache(
  async () => {
    const [records, rooms, tenants] = await Promise.all([
      db.maintenance.findMany({
        include: {
          room: { select: { id: true, roomNumber: true, branch: true } },
          tenant: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.room.findMany({
        select: { id: true, roomNumber: true, branch: true },
        orderBy: { roomNumber: 'asc' },
      }),
      db.tenant.findMany({
        where: { status: 'active' },
        select: { id: true, fullName: true, roomId: true },
        orderBy: { fullName: 'asc' },
      }),
    ])
    return { records, rooms, tenants }
  },
  ['maintenance-data'],
  { tags: [TAGS.maintenance, TAGS.rooms, TAGS.tenants], revalidate: REVALIDATE_SECONDS },
)

export const getReportsData = unstable_cache(
  async () => {
    const [billings, expenses, rooms] = await Promise.all([
      db.billing.findMany({
        include: {
          tenant: { select: { id: true, fullName: true } },
          room: { select: { id: true, roomNumber: true, branch: true } },
          payments: { include: { receivedBy: { select: { name: true } } } },
        },
        orderBy: { billingMonth: 'desc' },
      }),
      db.expense.findMany({
        include: {
          room: { select: { id: true, roomNumber: true, branch: true } },
          maintenance: { select: { id: true, title: true } },
        },
        orderBy: { expenseDate: 'desc' },
      }),
      db.room.findMany({
        select: { id: true, branch: true, status: true },
      }),
    ])
    return { billings, expenses, rooms }
  },
  ['reports-data'],
  {
    tags: [TAGS.billings, TAGS.expenses, TAGS.payments, TAGS.tenants, TAGS.rooms, TAGS.maintenance],
    revalidate: REVALIDATE_SECONDS,
  },
)

export const getAccountingData = unstable_cache(
  async () => {
    type LockRow = { id: string; month: string; lockedAt: Date; notes: string; lockedBy: { id: string; name: string } | null }
    // periodLock table may not exist yet on deployments where `prisma db
    // push` hasn't been run — fail open (no locks) so the page still loads.
    const locksPromise: Promise<LockRow[]> = db.periodLock
      .findMany({
        include: { lockedBy: { select: { id: true, name: true } } },
        orderBy: { month: 'asc' },
      })
      .catch((err) => {
        console.warn('[accounting] periodLock query failed (run `prisma db push`?):', err instanceof Error ? err.message : err)
        return [] as LockRow[]
      })
    const [billings, expenses, tenants, locks] = await Promise.all([
      db.billing.findMany({
        include: {
          tenant: { select: { id: true, fullName: true } },
          room: { select: { id: true, roomNumber: true, branch: true } },
          payments: { include: { receivedBy: { select: { name: true } } } },
        },
        orderBy: { billingMonth: 'desc' },
      }),
      db.expense.findMany({
        include: {
          room: { select: { id: true, roomNumber: true, branch: true } },
          maintenance: { select: { id: true, title: true } },
        },
        orderBy: { expenseDate: 'desc' },
      }),
      db.tenant.findMany({
        select: {
          id: true, fullName: true, status: true,
          depositAmount: true, moveInDate: true, moveOutDate: true,
          room: { select: { roomNumber: true, branch: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      locksPromise,
    ])
    return { billings, expenses, tenants, locks }
  },
  ['accounting-data'],
  {
    tags: [TAGS.billings, TAGS.expenses, TAGS.payments, TAGS.tenants, TAGS.rooms, TAGS.period_locks, TAGS.maintenance],
    revalidate: REVALIDATE_SECONDS,
  },
)

export const getNoticesData = unstable_cache(
  async () => {
    const [notices, tenants, rooms] = await Promise.all([
      db.tenantNotice.findMany({
        include: {
          tenant: {
            select: {
              id: true, fullName: true,
              room: { select: { id: true, roomNumber: true, branch: true } },
            },
          },
          // Room is independently linked so move-in / vacant-room notices
          // still show a room when no tenant exists.
          room: { select: { id: true, roomNumber: true, branch: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      db.tenant.findMany({
        where: { status: 'active' },
        select: {
          id: true, fullName: true, roomId: true,
          room: { select: { roomNumber: true, branch: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      // Every room in every branch so the picker can offer vacant rooms.
      db.room.findMany({
        select: { id: true, roomNumber: true, branch: true, status: true },
        orderBy: [{ branch: 'asc' }, { roomNumber: 'asc' }],
      }),
    ])
    return { notices, tenants, rooms }
  },
  ['notices-data'],
  { tags: [TAGS.tenants, TAGS.rooms], revalidate: REVALIDATE_SECONDS },
)

/**
 * Property Summary needs per-branch totals across rooms, tenants, billings,
 * expenses, and maintenance — but only as aggregates. We push the grouping
 * into Postgres so the page payload is a handful of small rows instead of
 * every billing/expense/maintenance record in the database.
 */
export interface PropertyBillingAgg {
  branch: string | null
  billingMonth: string
  paid: number      // sum(totalUsd) where paymentStatus = 'paid'
  unpaid: number    // sum(totalUsd) where paymentStatus in ('unpaid','partial')
  paidOnBilling: number // sum(payments.amountUsd) on unpaid/partial billings (for outstanding)
  billings: number  // total billing count for this branch+month
  paidBillings: number // billing count where paymentStatus = 'paid'
}

export interface PropertyExpenseAgg {
  branch: string | null
  billingMonth: string  // YYYY-MM derived from expenseDate
  total: number
}

export interface PropertySummaryData {
  rooms: { branch: string; status: string; count: number }[]
  tenants: { branch: string | null; active: number; allTime: number }[]
  billings: PropertyBillingAgg[]
  expenses: PropertyExpenseAgg[]
  maintenance: { branch: string | null; open: number; total: number }[]
}

export const getPropertySummaryData = unstable_cache(
  async (): Promise<PropertySummaryData> => {
    type RoomRow = { branch: string; status: string; count: bigint }
    type TenantRow = { branch: string | null; active: bigint; allTime: bigint }
    type BillingRow = {
      branch: string | null
      billingMonth: string
      paid: number | null
      unpaid: number | null
      paidOnBilling: number | null
      billings: bigint
      paidBillings: bigint
    }
    type ExpenseRow = {
      branch: string | null
      billingMonth: string
      total: number | null
    }
    type MaintRow = { branch: string | null; open: bigint; total: bigint }

    const [roomRows, tenantRows, billingRows, expenseRows, maintRows] = await Promise.all([
      db.$queryRaw<RoomRow[]>`
        SELECT branch, status::text AS status, COUNT(*)::bigint AS count
        FROM rooms
        GROUP BY branch, status
      `,
      db.$queryRaw<TenantRow[]>`
        SELECT
          r.branch AS branch,
          COUNT(*) FILTER (WHERE t.status = 'active')::bigint AS active,
          COUNT(*)::bigint AS "allTime"
        FROM tenants t
        LEFT JOIN rooms r ON r.id = t."roomId"
        WHERE t."roomId" IS NOT NULL
        GROUP BY r.branch
      `,
      db.$queryRaw<BillingRow[]>`
        SELECT
          r.branch AS branch,
          b."billingMonth" AS "billingMonth",
          COALESCE(SUM(b."totalUsd") FILTER (WHERE b."paymentStatus" = 'paid'), 0)::float AS paid,
          COALESCE(SUM(b."totalUsd") FILTER (WHERE b."paymentStatus" IN ('unpaid','partial')), 0)::float AS unpaid,
          COALESCE((
            SELECT SUM(p."amountUsd")::float
            FROM payments p
            JOIN billings b2 ON b2.id = p."billingId"
            WHERE b2."roomId" = r.id
              AND b2."billingMonth" = b."billingMonth"
              AND b2."paymentStatus" IN ('unpaid','partial')
          ), 0) AS "paidOnBilling",
          COUNT(*)::bigint AS billings,
          COUNT(*) FILTER (WHERE b."paymentStatus" = 'paid')::bigint AS "paidBillings"
        FROM billings b
        LEFT JOIN rooms r ON r.id = b."roomId"
        GROUP BY r.id, r.branch, b."billingMonth"
      `,
      db.$queryRaw<ExpenseRow[]>`
        SELECT
          r.branch AS branch,
          SUBSTRING(e."expenseDate", 1, 7) AS "billingMonth",
          COALESCE(SUM(e."amountUsd"), 0)::float AS total
        FROM expenses e
        LEFT JOIN rooms r ON r.id = e."roomId"
        WHERE e."expenseDate" IS NOT NULL AND e."expenseDate" <> ''
        GROUP BY r.branch, SUBSTRING(e."expenseDate", 1, 7)
      `,
      db.$queryRaw<MaintRow[]>`
        SELECT
          r.branch AS branch,
          COUNT(*) FILTER (WHERE m.status <> 'completed')::bigint AS open,
          COUNT(*)::bigint AS total
        FROM maintenance m
        LEFT JOIN rooms r ON r.id = m."roomId"
        GROUP BY r.branch
      `,
    ])

    return {
      rooms: roomRows.map((r) => ({ branch: r.branch, status: r.status, count: Number(r.count) })),
      tenants: tenantRows.map((r) => ({
        branch: r.branch,
        active: Number(r.active),
        allTime: Number(r.allTime),
      })),
      billings: billingRows.map((r) => ({
        branch: r.branch,
        billingMonth: r.billingMonth,
        paid: Number(r.paid ?? 0),
        unpaid: Number(r.unpaid ?? 0),
        paidOnBilling: Number(r.paidOnBilling ?? 0),
        billings: Number(r.billings),
        paidBillings: Number(r.paidBillings),
      })),
      expenses: expenseRows.map((r) => ({
        branch: r.branch,
        billingMonth: r.billingMonth,
        total: Number(r.total ?? 0),
      })),
      maintenance: maintRows.map((r) => ({
        branch: r.branch,
        open: Number(r.open),
        total: Number(r.total),
      })),
    }
  },
  ['property-summary-data'],
  {
    tags: [TAGS.rooms, TAGS.tenants, TAGS.billings, TAGS.expenses, TAGS.payments, TAGS.maintenance],
    revalidate: REVALIDATE_SECONDS,
  },
)

/**
 * Data backing the "Create Billing" page. Combines the active-tenants list
 * (with last billing + open notices, slim selects only) and the existing
 * (tenantId, billingMonth) keys used to block duplicate bills. Cached and
 * tagged so the page loads as fast as the others.
 */
export const getCreateBillingData = unstable_cache(
  async () => {
    const [tenants, billedKeyRows] = await Promise.all([
      db.tenant.findMany({
        where: { status: 'active', roomId: { not: null } },
        select: {
          id: true, fullName: true, phone: true, monthlyRent: true, payDay: true,
          room: {
            select: {
              id: true, roomNumber: true, branch: true, rentPriceUsd: true,
              waterRateRiel: true, electricRateRiel: true,
            },
          },
          billings: {
            orderBy: { billingMonth: 'desc' },
            take: 1,
            select: {
              billingMonth: true, currWaterReading: true, currElectricReading: true,
              totalUsd: true, paymentStatus: true,
              payments: { select: { amountUsd: true } },
            },
          },
          notices: {
            where: { status: 'open' },
            orderBy: { createdAt: 'desc' },
            select: { id: true, type: true, message: true, expectedDate: true, createdAt: true },
          },
        },
        orderBy: { room: { roomNumber: 'asc' } },
      }),
      db.billing.findMany({ select: { tenantId: true, billingMonth: true } }),
    ])
    const billedKeys = billedKeyRows.map((r) => `${r.tenantId}|${r.billingMonth}`)
    return { tenants, billedKeys }
  },
  ['create-billing-data'],
  { tags: [TAGS.tenants, TAGS.rooms, TAGS.billings], revalidate: REVALIDATE_SECONDS },
)

export const getNotificationsData = unstable_cache(
  async () => {
    const [notifications, unpaidBillings, allBillings, linkedTenants] = await Promise.all([
      db.notification.findMany({
        include: {
          tenant: {
            select: {
              id: true, fullName: true, phone: true, telegramChatId: true,
              room: { select: { branch: true, roomNumber: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.billing.findMany({
        where: { paymentStatus: { in: ['unpaid', 'partial'] } },
        include: {
          tenant: { select: { id: true, fullName: true, phone: true, telegramChatId: true } },
          room: { select: { id: true, roomNumber: true, branch: true } },
        },
      }),
      db.billing.findMany({
        include: {
          tenant: { select: { id: true, fullName: true, phone: true, telegramChatId: true } },
          room: { select: { id: true, roomNumber: true, branch: true } },
        },
        orderBy: { billingMonth: 'desc' },
        take: 200,
      }),
      db.tenant.findMany({
        where: { status: 'active', telegramChatId: { not: '' } },
        select: { id: true, room: { select: { branch: true } } },
      }),
    ])
    return { notifications, unpaidBillings, allBillings, linkedTenants }
  },
  ['notifications-data'],
  {
    tags: [TAGS.notifications, TAGS.billings, TAGS.tenants, TAGS.rooms],
    revalidate: REVALIDATE_SECONDS,
  },
)
