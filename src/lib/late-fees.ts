import { resolveBranchRates, type Branch } from './branches'

/**
 * Days past the tenant's pay-day for this billing month. Negative results are
 * clamped to 0 so callers can treat the return as "days actually late".
 */
export function daysLate(billingMonth: string, payDay: number): number {
  const [year, month] = billingMonth.split('-').map(Number)
  if (!year || !month) return 0
  const due = new Date(year, month - 1, payDay || 1)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - due.getTime()) / 86_400_000)
  return Math.max(0, diff)
}

/**
 * Single source of truth for the late-fee numbers shown to a tenant — used by
 * both the auto-overdue cron and the manual "late notified" button so they
 * always agree. Returns the days late, the per-day penalty for the billing's
 * branch (USD), and their product.
 */
export function computeLateFee(
  settings: Record<string, string>,
  branches: Branch[],
  branchName: string | null | undefined,
  billingMonth: string,
  payDay: number,
): { days: number; penaltyPerDay: number; penaltyUsd: number } {
  const days = daysLate(billingMonth, payDay)
  const penaltyPerDay = Number(resolveBranchRates(settings, branches, branchName).late_penalty_usd) || 0
  return { days, penaltyPerDay, penaltyUsd: penaltyPerDay * days }
}
