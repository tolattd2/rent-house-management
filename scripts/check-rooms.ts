import { db } from '../src/lib/db'

async function main() {
  const rooms = await db.room.findMany({
    select: { roomNumber: true, branch: true, floor: true },
    orderBy: [{ branch: 'asc' }, { roomNumber: 'asc' }],
  })
  const byBranch = new Map<string, string[]>()
  for (const r of rooms) {
    const arr = byBranch.get(r.branch) ?? []
    arr.push(`${r.roomNumber}(f${r.floor})`)
    byBranch.set(r.branch, arr)
  }
  for (const [b, nums] of byBranch) {
    console.log(`\n[${b}] ${nums.length} rooms:`)
    console.log(nums.join(', '))
  }
  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
