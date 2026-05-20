import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/layout/shell'
import { IdleTimeout } from '@/components/layout/idle-timeout'
import { SessionProvider } from 'next-auth/react'
import { BranchesProvider } from '@/contexts/branches-context'
import { getBranches } from '@/lib/cached-queries'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth().catch(() => null)
  if (!session) redirect('/login')

  const branches = await getBranches()

  return (
    <SessionProvider session={session}>
      <IdleTimeout />
      <BranchesProvider branches={branches}>
        <Shell>{children}</Shell>
      </BranchesProvider>
    </SessionProvider>
  )
}
