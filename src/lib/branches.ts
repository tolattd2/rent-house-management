export type PropertyType = 'house' | 'apartment'
export type PropertyStructure = 'single' | 'complex'

export type Branch = {
  slug: string
  name: string
  prefix: string
  // Top-level classification — house vs. apartment. Mostly informational
  // for reporting, but also sets sensible defaults for hasFloors when a
  // legacy record is parsed without that field.
  propertyType: PropertyType
  // Single building or a complex of buildings.
  structure: PropertyStructure
  // Explicit toggle: when true, the Add/Edit Room dialog asks for a floor
  // and the Room Map splits the canvas by floor. Stays independent of
  // propertyType so a single-storey apartment or a multi-floor house can
  // both be modelled.
  hasFloors: boolean
  // How many floors this branch has when hasFloors is true. Drives the
  // Floor dropdown in Add Room and the Floor selector on the Room Map.
  floorCount: number
}

export const DEFAULT_BRANCHES: Branch[] = [
  { slug: 'takmoa', name: 'Takmoa', prefix: '', propertyType: 'house', structure: 'single', hasFloors: false, floorCount: 1 },
  { slug: 'chamkadong', name: 'Chamkadong', prefix: 'Rckd', propertyType: 'house', structure: 'single', hasFloors: false, floorCount: 1 },
]

/** Parse the `branches` setting JSON, falling back to the original two branches. */
export function parseBranches(raw: string | undefined | null): Branch[] {
  if (!raw) return DEFAULT_BRANCHES
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_BRANCHES
    const valid = parsed
      .filter((b) => b && typeof b.slug === 'string' && typeof b.name === 'string')
      .map((b) => {
        const propertyType: PropertyType = b.propertyType === 'apartment' ? 'apartment' : 'house'
        const structure: PropertyStructure = b.structure === 'complex' ? 'complex' : 'single'
        // Legacy records don't carry hasFloors — fall back to the old
        // derivation (apartment ⇒ floors) so existing setups keep working.
        const hasFloors = typeof b.hasFloors === 'boolean'
          ? b.hasFloors
          : propertyType === 'apartment'
        const floorCountRaw = Number(b.floorCount)
        const floorCount = Number.isFinite(floorCountRaw) && floorCountRaw > 0
          ? Math.floor(floorCountRaw)
          : 1
        return {
          slug: b.slug,
          name: b.name,
          prefix: typeof b.prefix === 'string' ? b.prefix : '',
          propertyType,
          structure,
          hasFloors,
          floorCount,
        }
      })
    return valid.length > 0 ? valid : DEFAULT_BRANCHES
  } catch {
    return DEFAULT_BRANCHES
  }
}

export function branchHasFloors(branch: Branch | undefined | null): boolean {
  return branch?.hasFloors === true
}

export function findBranch(branches: Branch[], name: string | null | undefined): Branch | undefined {
  return branches.find((b) => b.name === name)
}

/** Settings-key infix for a branch (e.g. company_<slug>_name). */
export function branchSlug(branches: Branch[], name: string | null | undefined): string {
  return findBranch(branches, name)?.slug ?? (name ?? '').toLowerCase()
}

export function roomPrefix(branches: Branch[], name: string | null | undefined): string {
  return findBranch(branches, name)?.prefix ?? ''
}

/** Room number with its branch prefix in front, e.g. "Rckd101". */
export function roomLabel(
  room: { roomNumber: string; branch?: string | null },
  branches: Branch[],
): string {
  return `${roomPrefix(branches, room.branch)}${room.roomNumber}`
}

/**
 * Billing rate settings that can be configured per branch.
 *
 * Late fees support two models, chosen per branch via `late_penalty_mode`:
 *  - 'flat' (default): a bill more than `late_penalty_threshold_days` past its
 *    due date incurs a single flat `late_penalty_flat_usd` penalty.
 *  - 'perday': the penalty is `lateDays × late_penalty_usd` (the original rule).
 * Either way the computed penalty is overridable per bill on the billing form.
 */
export const RATE_KEYS = [
  'exchange_rate',
  'late_penalty_mode',
  'late_penalty_flat_usd',
  'late_penalty_threshold_days',
  'late_penalty_usd',
  'water_rate_riel',
  'electric_rate_riel',
] as const
export type RateKey = (typeof RATE_KEYS)[number]

/** Late-fee model: flat amount past a threshold, or a per-day rate. */
export type LatePenaltyMode = 'flat' | 'perday'
export function parseLatePenaltyMode(value: string | undefined | null): LatePenaltyMode {
  return value === 'perday' ? 'perday' : 'flat'
}

/** Hard fallback rates, used when neither a per-branch nor a legacy global value exists. */
export const RATE_DEFAULTS: Record<RateKey, string> = {
  exchange_rate: '4100',
  late_penalty_mode: 'flat',
  late_penalty_flat_usd: '10',
  late_penalty_threshold_days: '10',
  late_penalty_usd: '1',
  water_rate_riel: '2000',
  electric_rate_riel: '720',
}

/** Settings key for a branch-specific rate, e.g. water_rate_riel_<slug>. */
export function branchRateKey(key: RateKey, slug: string): string {
  return `${key}_${slug}`
}

/**
 * Resolve the four billing rates for a branch from the settings map.
 * Falls back per key: per-branch value → legacy global value → hard default.
 */
export function resolveBranchRates(
  settings: Record<string, string>,
  branches: Branch[],
  branchName: string | null | undefined,
): Record<RateKey, string> {
  const slug = branchSlug(branches, branchName)
  const out = {} as Record<RateKey, string>
  for (const key of RATE_KEYS) {
    out[key] = settings[branchRateKey(key, slug)] ?? settings[key] ?? RATE_DEFAULTS[key]
  }
  return out
}
