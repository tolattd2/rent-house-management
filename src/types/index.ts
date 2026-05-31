export type UserRole = 'admin' | 'manager' | 'staff' | 'guest'
export type RoomStatus = 'occupied' | 'vacant' | 'reserved' | 'maintenance'
export type TenantStatus = 'active' | 'inactive'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type ContractStatus = 'active' | 'expired' | 'terminated'
export type PaymentMethod = 'Cash' | 'ABA_Pay' | 'Wing' | 'TrueMoney' | 'Bank_Transfer' | 'Other'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  phone: string
  createdAt: string
}

export interface Room {
  id: string
  roomNumber: string
  floor: string
  roomType: string
  rentPriceUsd: number
  depositAmount: number
  status: RoomStatus
  waterRateRiel: number
  electricRateRiel: number
  notes: string
  createdAt: string
  tenant?: TenantSummary | null
}

export interface TenantSummary {
  id: string
  fullName: string
  phone: string
  moveInDate: string
}

export interface Tenant {
  id: string
  fullName: string
  gender: string
  phone: string
  phonesExtra: string[]
  nationalId: string
  emergencyContact: string
  emergencyName: string
  emergencyPhone: string
  occupation: string
  moveInDate: string
  moveOutDate: string
  depositAmount: number
  contractFileUrl: string
  status: TenantStatus
  notes: string
  createdAt: string
  roomId?: string | null
  room?: RoomSummary | null
}

export interface RoomSummary {
  id: string
  roomNumber: string
  floor: string
  rentPriceUsd: number
}

export interface TenantWithDetails extends Tenant {
  contracts: Contract[]
  billings: BillingWithPayments[]
}

export interface Contract {
  id: string
  tenantId: string
  contractStart: string
  contractEnd: string
  monthlyRent: number
  depositAmount: number
  contractPdf: string
  status: ContractStatus
  notes: string
  createdAt: string
}

export interface Billing {
  id: string
  tenantId: string
  roomId: string
  billingMonth: string
  prevWaterReading: number
  currWaterReading: number
  waterUsage: number
  waterCostRiel: number
  prevElectricReading: number
  currElectricReading: number
  electricUsage: number
  electricCostRiel: number
  roomRentUsd: number
  outstandingDebtUsd: number
  lateDays: number
  latePenaltyUsd: number
  discountUsd: number
  totalUsd: number
  totalRiel: number
  exchangeRate: number
  paymentStatus: PaymentStatus
  paymentDate: string
  notes: string
  createdAt: string
  tenant?: TenantSummary | null
  room?: { id: string; roomNumber: string } | null
}

export interface BillingWithPayments extends Billing {
  payments: Payment[]
  totalPaid: number
  balance: number
}

export interface Payment {
  id: string
  billingId: string
  amountUsd: number
  amountRiel: number
  paymentMethod: PaymentMethod
  transactionRef: string
  notes: string
  createdAt: string
  receivedBy?: { id: string; name: string } | null
}

export interface Invoice {
  id: string
  invoiceNumber: string
  tenantId: string
  billingId: string
  pdfUrl: string
  sentEmail: boolean
  sentTelegram: boolean
  sentSms: boolean
  createdAt: string
  tenant?: TenantSummary
  billing?: Billing
}

export interface Notification {
  id: string
  tenantId: string
  type: string
  message: string
  status: 'sent' | 'failed' | 'pending'
  createdAt: string
  tenant?: TenantSummary
}

export interface Settings {
  exchange_rate: string
  water_rate_riel: string
  electric_rate_riel: string
  late_penalty_mode: string
  late_penalty_flat_usd: string
  late_penalty_threshold_days: string
  late_penalty_usd: string
  company_name: string
  company_phone: string
  company_address: string
  telegram_token: string
  telegram_chat_id: string
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_pass: string
  email_from: string
  twilio_sid: string
  twilio_token: string
  twilio_phone: string
}

export interface DashboardStats {
  totalRooms: number
  occupied: number
  vacant: number
  maintenance: number
  activeTenants: number
  monthlyRevenue: string
  outstanding: string
  monthlyExpenses: string
  netIncome: string
  occupancyRate: string
  paidBillings: number
  unpaidBillings: number
  revenueChart: { month: string; label: string; revenue: number; expenses: number }[]
}

export interface BillingCalculation {
  waterUsage: number
  waterCostRiel: number
  electricUsage: number
  electricCostRiel: number
  latePenaltyUsd: number
  totalUsd: number
  totalRiel: number
  exchangeRate: number
}

export interface MonthlyReport {
  month: string
  bills: BillingWithPayments[]
  totalRevenue: string
  totalOutstanding: string
  paidCount: number
  unpaidCount: number
}

export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  message?: string
}
