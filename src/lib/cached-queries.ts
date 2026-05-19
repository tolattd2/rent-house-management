import { unstable_cache } from 'next/cache'
import { db } from './db'

export const TAGS = {
  rooms: 'rooms',
  tenants: 'tenants',
  billings: 'billings',
  invoices: 'invoices',
  expenses: 'expenses',
  payments: 'payments',
  settings: 'settings',
  maintenance: 'maintenance',
} as const

const REVALIDATE_SECONDS = 300

export const getRoomsList = unstable_cache(
  async () =>
    db.room.findMany({
      include: {
        tenants: {
          where: { status: 'active' },
          select: { id: true, fullName: true, phone: true, moveInDate: true },
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
          tenant: { select: { id: true, fullName: true, phone: true } },
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
