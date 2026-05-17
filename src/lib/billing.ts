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

export function calculateBilling(
  input: BillingInput,
  settings: RateSettings,
  roomRates?: RoomRates | null
): BillingCalculation {
  const exchangeRate = parseFloat(settings.exchange_rate ?? '4100')
  const waterRate = roomRates?.waterRateRiel ?? parseFloat(settings.water_rate_riel ?? '2000')
  const electricRate = roomRates?.electricRateRiel ?? parseFloat(settings.electric_rate_riel ?? '720')
  const penaltyRate = parseFloat(settings.late_penalty_usd ?? '1')

  const waterUsage = Math.max(0, (input.currWaterReading ?? 0) - (input.prevWaterReading ?? 0))
  const electricUsage = Math.max(0, (input.currElectricReading ?? 0) - (input.prevElectricReading ?? 0))

  const waterCostRiel = Math.round(waterUsage * waterRate)
  const electricCostRiel = Math.round(electricUsage * electricRate)

  const rent = input.roomRentUsd ?? 0
  const debt = input.outstandingDebtUsd ?? 0
  const latePenalty = (input.lateDays ?? 0) * penaltyRate
  const discount = input.discountUsd ?? 0

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
