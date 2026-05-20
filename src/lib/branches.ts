export type Branch = { slug: string; name: string; prefix: string }

export const DEFAULT_BRANCHES: Branch[] = [
  { slug: 'takmoa', name: 'Takmoa', prefix: '' },
  { slug: 'chamkadong', name: 'Chamkadong', prefix: 'Rckd' },
]

/** Parse the `branches` setting JSON, falling back to the original two branches. */
export function parseBranches(raw: string | undefined | null): Branch[] {
  if (!raw) return DEFAULT_BRANCHES
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_BRANCHES
    const valid = parsed
      .filter((b) => b && typeof b.slug === 'string' && typeof b.name === 'string')
      .map((b) => ({
        slug: b.slug,
        name: b.name,
        prefix: typeof b.prefix === 'string' ? b.prefix : '',
      }))
    return valid.length > 0 ? valid : DEFAULT_BRANCHES
  } catch {
    return DEFAULT_BRANCHES
  }
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
