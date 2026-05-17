import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Shell } from '@/components/layout/shell'
import { SessionProvider } from 'next-auth/react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let session = null
  try {
    session = await auth()
  } catch {
    redirect('/login')
  }
  if (!session) redirect('/login')

  return (
    <SessionProvider session={session}>
      <Shell>{children}</Shell>
    </SessionProvider>
  )
}
