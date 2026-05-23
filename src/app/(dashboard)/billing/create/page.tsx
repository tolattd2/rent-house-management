import { getCreateBillingData, getSettingsMap } from '@/lib/cached-queries'
import { CreateBillingClient } from './create-billing-client'

export const dynamic = 'force-dynamic'

export default async function CreateBillingPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
  const [{ tenants, billedKeys }, settings, params] = await Promise.all([
    getCreateBillingData(),
    getSettingsMap(),
    searchParams,
  ])
  return (
    <CreateBillingClient
      tenants={tenants}
      settings={settings}
      preselectedTenantId={params.tenantId}
      billedKeys={billedKeys}
    />
  )
}
