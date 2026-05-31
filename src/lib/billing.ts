import type { BillingCalculation } from '@/types'

interface BillingInput {
  prevWaterReading?: number
  currWaterReading?: number
  prevElectricReading?: number
  currElectricReading?: number
  roomRentUsd?: number
  outstandingDebtUsd?: number
  lateDays?: number
  /**
   * Explicit penalty override. When a finite number is supplied it is used
   * verbatim (this is what makes the late penalty editable on the form). When
   * omitted, the penalty defaults to the flat amount if `lateDays` exceeds the
   * configured threshold, otherwise 0.
   */
  latePenaltyUsd?: number
  discountUsd?: number
}

interface RateSettings {
  exchange_rate?: string
  water_rate_riel?: string
  electric_rate_riel?: string
  late_penalty_mode?: string
  late_penalty_flat_usd?: string
  late_penalty_threshold_days?: string
  late_penalty_usd?: string
}

/**
 * Coerce a value of unknown runtime type into a finite number.
 *
 * Form fields (react-hook-form `watch()`) hand numeric inputs back as
 * *strings* once the user types in them. That made `rent + utilityUsd`
 * silently concatenate instead of add (e.g. "50" + 20 → "5020"), which
 * is what blew up the billing total. Every value entering the math below
 * is funnelled through this helper so a string can never reach an operator.
 */
function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(n) ? n : fallback
}

/**
 * Compute a single billing row from inputs + the BRANCH rates. Per-room
 * rate overrides were removed: callers must resolve the branch rates via
 * `resolveBranchRates(settings, branches, room.branch)` and pass them as
 * `settings` here. This keeps every room in a branch consistent with the
 * configured water/electric/exchange rates.
 */
export function calculateBilling(
  input: BillingInput,
  settings: RateSettings,
): BillingCalculation {
  // A zero or invalid exchange rate would break the USD ⇄ KHR conversion.
  const exchangeRate = num(settings.exchange_rate, 4100) || 4100
  const waterRate = num(settings.water_rate_riel, 2000)
  const electricRate = num(settings.electric_rate_riel, 720)
  const flatPenalty = num(settings.late_penalty_flat_usd, 10)
  const thresholdDays = num(settings.late_penalty_threshold_days, 10)
  const perDayRate = num(settings.late_penalty_usd, 1)
  const flatMode = settings.late_penalty_mode !== 'perday'

  const waterUsage = Math.max(0, num(input.currWaterReading) - num(input.prevWaterReading))
  const electricUsage = Math.max(0, num(input.currElectricReading) - num(input.prevElectricReading))

  const waterCostRiel = Math.round(waterUsage * waterRate)
  const electricCostRiel = Math.round(electricUsage * electricRate)

  const rent = num(input.roomRentUsd)
  const debt = num(input.outstandingDebtUsd)
  // Flat penalty past the threshold, or per-day, depending on the branch mode.
  // An explicit override (when the user edits the penalty field) always wins.
  const days = num(input.lateDays)
  const defaultPenalty = flatMode
    ? (days > thresholdDays ? flatPenalty : 0)
    : days * perDayRate
  const latePenalty = input.latePenaltyUsd != null && Number.isFinite(input.latePenaltyUsd)
    ? Math.max(0, input.latePenaltyUsd)
    : defaultPenalty
  const discount = num(input.discountUsd)

  const utilityUsd = (waterCostRiel + electricCostRiel) / exchangeRate
  const totalUsd = Math.max(0, rent + utilityUsd + debt + latePenalty - discount)
  const totalRiel = Math.round(totalUsd * exchangeRate)

  return {
    waterUsage,
    waterCostRiel,
    electricUsage,
    electricCostRiel,
    latePenaltyUsd: parseFloat(latePenalty.toFixed(2)),
    totalUsd: parseFloat(totalUsd.toFixed(2)),
    totalRiel,
    exchangeRate,
  }
}
