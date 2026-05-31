import { resolveBranchRates, parseLatePenaltyMode, type Branch, type LatePenaltyMode } from './branches'

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
 * always agree. Honours the branch's late-penalty mode: 'flat' applies a flat
 * amount once past the threshold of days; 'perday' charges per day late.
 */
export function computeLateFee(
  settings: Record<string, string>,
  branches: Branch[],
  branchName: string | null | undefined,
  billingMonth: string,
  payDay: number,
): { days: number; mode: LatePenaltyMode; thresholdDays: number; flatUsd: number; perDayUsd: number; penaltyUsd: number } {
  const days = daysLate(billingMonth, payDay)
  const rates = resolveBranchRates(settings, branches, branchName)
  const mode = parseLatePenaltyMode(rates.late_penalty_mode)
  const flatUsd = Number(rates.late_penalty_flat_usd) || 0
  const thresholdDays = Number(rates.late_penalty_threshold_days) || 0
  const perDayUsd = Number(rates.late_penalty_usd) || 0
  const penaltyUsd = mode === 'perday' ? perDayUsd * days : (days > thresholdDays ? flatUsd : 0)
  return { days, mode, thresholdDays, flatUsd, perDayUsd, penaltyUsd }
}
