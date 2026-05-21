import type { BillingCalculation } from '@/types'

interface BillingInput {
  prevWaterReading?: number
  currWaterReading?: number
  prevElectricReading?: number
  currElectricReading?: number
  roomRentUsd?: number
  outstandingDebtUsd?: number
  lateDays?: number
  discountUsd?: number
}

interface RateSettings {
  exchange_rate?: string
  water_rate_riel?: string
  electric_rate_riel?: string
  late_penalty_usd?: string
}

interface RoomRates {
  waterRateRiel?: number
  electricRateRiel?: number
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

export function calculateBilling(
  input: BillingInput,
  settings: RateSettings,
  roomRates?: RoomRates | null
): BillingCalculation {
  // A zero or invalid exchange rate would break the USD ⇄ KHR conversion.
  const exchangeRate = num(settings.exchange_rate, 4100) || 4100
  const waterRate = roomRates?.waterRateRiel ?? num(settings.water_rate_riel, 2000)
  const electricRate = roomRates?.electricRateRiel ?? num(settings.electric_rate_riel, 720)
  const penaltyRate = num(settings.late_penalty_usd, 1)

  const waterUsage = Math.max(0, num(input.currWaterReading) - num(input.prevWaterReading))
  const electricUsage = Math.max(0, num(input.currElectricReading) - num(input.prevElectricReading))

  const waterCostRiel = Math.round(waterUsage * waterRate)
  const electricCostRiel = Math.round(electricUsage * electricRate)

  const rent = num(input.roomRentUsd)
  const debt = num(input.outstandingDebtUsd)
  const latePenalty = num(input.lateDays) * penaltyRate
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
