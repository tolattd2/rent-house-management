import { db } from '@/lib/db'
import { SettingsClient } from './settings-client'

async function getSettings() {
  const rows = await db.setting.findMany()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export default async function SettingsPage() {
  const settings = await getSettings()
  return <SettingsClient settings={settings} />
}
