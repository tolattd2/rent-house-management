import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { SettingsClient } from './settings-client'

async function getSettings() {
  const rows = await db.setting.findMany()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export default async function SettingsPage() {
  const session = await auth()
  if (!session || session.user.role === 'guest') {
    redirect('/dashboard')
  }
  const settings = await getSettings()
  return <SettingsClient settings={settings} />
}
