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
          select: { id: true, totalUsd: true, paymentStatus: true },
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
    const [rooms, tenants, billings, expenses, unpaidBillings] = await Promise.all([
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
    ])
    return { rooms, tenants, billings, expenses, unpaidBillings }
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
        select: { id: true, fullName: true },
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
    const [billings, expenses] = await Promise.all([
      db.billing.findMany({
        include: {
          tenant: { select: { id: true, fullName: true } },
          room: { select: { id: true, roomNumber: true, branch: true } },
          payments: true,
        },
        orderBy: { billingMonth: 'desc' },
      }),
      db.expense.findMany({
        include: { room: { select: { id: true, roomNumber: true, branch: true } } },
        orderBy: { expenseDate: 'desc' },
      }),
    ])
    return { billings, expenses }
  },
  ['reports-data'],
  {
    tags: [TAGS.billings, TAGS.expenses, TAGS.payments, TAGS.tenants, TAGS.rooms],
    revalidate: REVALIDATE_SECONDS,
  },
)

export const getNotificationsData = unstable_cache(
  async () => {
    const [notifications, unpaidBillings, linkedTenants] = await Promise.all([
      db.notification.findMany({
        include: {
          tenant: {
            select: {
              id: true, fullName: true, phone: true,
              room: { select: { branch: true } },
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
      db.tenant.findMany({
        where: { status: 'active', telegramChatId: { not: '' } },
        select: { id: true, room: { select: { branch: true } } },
      }),
    ])
    return { notifications, unpaidBillings, linkedTenants }
  },
  ['notifications-data'],
  {
    tags: [TAGS.notifications, TAGS.billings, TAGS.tenants, TAGS.rooms],
    revalidate: REVALIDATE_SECONDS,
  },
)
