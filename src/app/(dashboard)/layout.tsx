import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/layout/shell'
import { IdleTimeout } from '@/components/layout/idle-timeout'
import { SessionProvider } from 'next-auth/react'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth().catch(() => null)
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <IdleTimeout />
      <Shell>{children}</Shell>
    </SessionProvider>
  )
}
