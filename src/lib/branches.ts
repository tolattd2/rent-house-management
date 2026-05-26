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
  // Single building or a complex of buildings. Complex properties expose
  // buildingCount in Settings; single-building ones ignore it.
  structure: PropertyStructure
  buildingCount: number
  // Explicit toggle: when true, the Add/Edit Room dialog asks for a floor
  // and the Room Map splits the canvas by floor. Stays independent of
  // propertyType so a single-storey apartment or a multi-floor house can
  // both be modelled.
  hasFloors: boolean
}

export const DEFAULT_BRANCHES: Branch[] = [
  { slug: 'takmoa', name: 'Takmoa', prefix: '', propertyType: 'house', structure: 'single', buildingCount: 1, hasFloors: false },
  { slug: 'chamkadong', name: 'Chamkadong', prefix: 'Rckd', propertyType: 'house', structure: 'single', buildingCount: 1, hasFloors: false },
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
        const buildingCountRaw = Number(b.buildingCount)
        const buildingCount = Number.isFinite(buildingCountRaw) && buildingCountRaw > 0
          ? Math.floor(buildingCountRaw)
          : 1
        // Legacy records don't carry hasFloors — fall back to the old
        // derivation (apartment ⇒ floors) so existing setups keep working.
        const hasFloors = typeof b.hasFloors === 'boolean'
          ? b.hasFloors
          : propertyType === 'apartment'
        return {
          slug: b.slug,
          name: b.name,
          prefix: typeof b.prefix === 'string' ? b.prefix : '',
          propertyType,
          structure,
          buildingCount,
          hasFloors,
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

/** Billing rate settings that can be configured per branch. */
export const RATE_KEYS = ['exchange_rate', 'late_penalty_usd', 'water_rate_riel', 'electric_rate_riel'] as const
export type RateKey = (typeof RATE_KEYS)[number]

/** Hard fallback rates, used when neither a per-branch nor a legacy global value exists. */
export const RATE_DEFAULTS: Record<RateKey, string> = {
  exchange_rate: '4100',
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
