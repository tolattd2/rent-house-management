'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  User, Phone, Calendar,
  Edit, ArrowLeft, Home, FileText, CreditCard,
  CheckCircle2, AlertTriangle, LogOut
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TenantFormDialog } from '@/components/tenants/tenant-form-dialog'
import { formatCurrency, formatDate, formatMonth, roomLabel } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'

interface Props {
  tenant: {
    id: string; fullName: string; gender: string; phone: string; phonesExtra: string[]; nationalId: string
    emergencyContact: string; emergencyName: string; emergencyPhone: string
    occupation: string; moveInDate: string; moveOutDate: string
    depositAmount: number; monthlyRent: number; status: string; notes: string; createdAt: Date
    roomId: string | null
    room: {
      id: string; roomNumber: string; branch?: string; roomType: string; rentPriceUsd: number
      depositAmount: number; status: string
    } | null
    contracts: Array<{
      id: string; contractStart: string; contractEnd: string; monthlyRent: number
      depositAmount: number; status: string; createdAt: Date
    }>
    billings: Array<{
      id: string; billingMonth: string; roomRentUsd: number; waterUsage: number
      waterCostRiel: number; electricUsage: number; electricCostRiel: number
      totalUsd: number; totalRiel: number; paymentStatus: string; paymentDate: string
      lateDays: number; discountUsd: number; outstandingDebtUsd: number
      payments: Array<{ id: string; amountUsd: number; paymentMethod: string; createdAt: Date }>
    }>
    notifications: Array<{ id: string; type: string; message: string; status: string; createdAt: Date }>
  }
  rooms: Array<{ id: string; roomNumber: string; branch?: string; status: string; rentPriceUsd: number }>
}

export function TenantDetailClient({ tenant, rooms }: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const { t } = useLanguage()
  const [showEdit, setShowEdit] = useState(false)

  const outstanding = tenant.billings
    .filter((b) => b.paymentStatus === 'unpaid' || b.paymentStatus === 'partial')
    .reduce((s, b) => {
      const paid = b.payments.reduce((ps, p) => ps + p.amountUsd, 0)
      return s + Math.max(0, b.totalUsd - paid)
    }, 0)

  const totalPaid = tenant.billings
    .filter((b) => b.paymentStatus === 'paid')
    .reduce((s, b) => s + b.totalUsd, 0)

  const handleMoveOut = async () => {
    if (!confirm(t('tenant_moveout_confirm'))) return
    const res = await fetch(`/api/tenants/${tenant.id}/moveout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }),
    })
    if ((await res.json()).ok) {
      toast({ title: t('tenant_moved_out') })
      router.refresh()
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-4">
        <Link href="/tenants">
          <Button variant="ghost" size="sm" className="h-10"><ArrowLeft className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">{t('back')}</span></Button>
        </Link>
        <div className="flex-1" />
        {isAdmin && tenant.status === 'active' && (
          <>
            <Button variant="outline" size="sm" className="h-10" onClick={() => setShowEdit(true)}>
              <Edit className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('edit')}</span>
            </Button>
            <Button variant="outline" size="sm" className="h-10 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={handleMoveOut}>
              <LogOut className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('tenants_move_out')}</span>
            </Button>
          </>
        )}
      </div>

      {/* Profile card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-10 h-10 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold">{tenant.fullName}</h1>
                  <p className="text-muted-foreground">{tenant.occupation || t('tenant_no_occupation')}</p>
                </div>
                <Badge variant={tenant.status === 'active' ? 'success' : 'secondary'} className="capitalize text-sm px-3 py-1">
                  {t(tenant.status === 'active' ? 'status_active' : 'status_inactive')}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{tenant.phone || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>{tenant.gender || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Home className="w-4 h-4 text-muted-foreground" />
                  <span>{tenant.room ? `${t('room')} ${roomLabel(tenant.room)}` : t('tenant_no_room')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{t('since')} {formatDate(tenant.moveInDate)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
        <Card><CardContent className="p-3 sm:p-4 text-center">
          <p className="text-xs text-muted-foreground leading-tight">{t('room')}</p>
          <p className="text-base sm:text-xl font-bold mt-0.5 truncate">{tenant.room ? `${t('room')} ${roomLabel(tenant.room)}` : '—'}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4 text-center">
          <p className="text-xs text-muted-foreground leading-tight">{t('monthly_rent')}</p>
          <p className="text-base sm:text-xl font-bold mt-0.5 truncate">{formatCurrency(tenant.monthlyRent > 0 ? tenant.monthlyRent : (tenant.room?.rentPriceUsd ?? 0))}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4 text-center">
          <p className="text-xs text-muted-foreground leading-tight">{t('tenants_col_deposit')}</p>
          <p className="text-base sm:text-xl font-bold mt-0.5 truncate">{formatCurrency(tenant.depositAmount)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4 text-center">
          <p className="text-xs text-muted-foreground leading-tight">{t('total_paid')}</p>
          <p className="text-base sm:text-xl font-bold mt-0.5 text-green-600 truncate">{formatCurrency(totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 sm:p-4 text-center">
          <p className="text-xs text-muted-foreground leading-tight">{t('dashboard_outstanding')}</p>
          <p className={`text-base sm:text-xl font-bold mt-0.5 truncate ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(outstanding)}
          </p>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="billing">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="billing" className="flex-1 sm:flex-none text-xs sm:text-sm">
            <FileText className="w-4 h-4 hidden sm:block sm:mr-2" />{t('tenant_billing_tab')} ({tenant.billings.length})
          </TabsTrigger>
          <TabsTrigger value="info" className="flex-1 sm:flex-none text-xs sm:text-sm">
            <User className="w-4 h-4 hidden sm:block sm:mr-2" />{t('tenant_personal_info')}
          </TabsTrigger>
          <TabsTrigger value="contract" className="flex-1 sm:flex-none text-xs sm:text-sm">
            <CreditCard className="w-4 h-4 hidden sm:block sm:mr-2" />{t('tenant_contracts_tab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="mt-4">
          <Card>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">{t('tenant_billing_records')}</h3>
              <Link href={`/billing/create?tenantId=${tenant.id}`}>
                <Button size="sm"><FileText className="w-3.5 h-3.5 mr-2" />{t('new_billing')}</Button>
              </Link>
            </div>
            <TableScroll>
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('billing_col_month')}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('billing_col_rent')}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('water')}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('electric')}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('billing_col_total')}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('status')}</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tenant.billings.map((bill) => (
                    <tr key={bill.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{bill.billingMonth}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(bill.roomRentUsd)}</td>
                      <td className="px-4 py-3 text-right text-xs">
                        {bill.waterUsage} {t('unit_kib')} / {bill.waterCostRiel.toLocaleString()} ៛
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {bill.electricUsage} {t('unit_kw')} / {bill.electricCostRiel.toLocaleString()} ៛
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-semibold">{formatCurrency(bill.totalUsd)}</p>
                        <p className="text-xs text-muted-foreground">{Math.round(bill.totalRiel).toLocaleString()} ៛</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={bill.paymentStatus === 'paid' ? 'success' : bill.paymentStatus === 'partial' ? 'warning' : 'error'}>
                          {t(bill.paymentStatus === 'paid' ? 'status_paid' : bill.paymentStatus === 'partial' ? 'status_partial' : 'status_unpaid')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/billing/${bill.id}`}>
                          <Button variant="ghost" size="sm" className="text-xs">{t('view')}</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {tenant.billings.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t('no_billing_records')}</td></tr>
                  )}
                </tbody>
              </table>
            </TableScroll>
          </Card>
        </TabsContent>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                [t('tenant_full_name'), tenant.fullName],
                [t('tenant_gender'), tenant.gender || '—'],
                [t('settings_phone'), [tenant.phone, ...tenant.phonesExtra].filter(Boolean).join(' / ') || '—'],
                [t('tenant_national_id'), tenant.nationalId || '—'],
                [t('tenant_emergency_name'), tenant.emergencyName || tenant.emergencyContact || '—'],
                [t('tenant_emergency_phone'), tenant.emergencyPhone || '—'],
                [t('tenant_occupation'), tenant.occupation || '—'],
                [t('tenants_col_movein'), formatDate(tenant.moveInDate)],
                [t('tenants_col_moveout'), tenant.moveOutDate ? formatDate(tenant.moveOutDate) : '—'],
                [t('tenant_deposit_paid'), formatCurrency(tenant.depositAmount)],
                [t('notes'), tenant.notes || '—'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="font-medium mt-0.5">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contract" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              {tenant.contracts.length === 0 && (
                <p className="text-muted-foreground text-center py-8">{t('tenant_no_contracts')}</p>
              )}
              {tenant.contracts.map((c) => (
                <div key={c.id} className="p-4 border border-border rounded-xl">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{c.contractStart} → {c.contractEnd || t('tenant_open_ended')}</p>
                      <p className="text-sm text-muted-foreground">{t('monthly_rent')}: {formatCurrency(c.monthlyRent)}{t('tenants_per_month')} · {t('tenants_col_deposit')}: {formatCurrency(c.depositAmount)}</p>
                    </div>
                    <Badge variant={c.status === 'active' ? 'success' : 'secondary'}>
                      {t(c.status === 'active' ? 'status_active' : 'status_inactive')}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showEdit && (
        <TenantFormDialog
          rooms={rooms}
          tenant={{
            id: tenant.id,
            fullName: tenant.fullName,
            gender: tenant.gender,
            phone: tenant.phone,
            phonesExtra: tenant.phonesExtra,
            nationalId: tenant.nationalId,
            emergencyContact: tenant.emergencyContact,
            emergencyName: tenant.emergencyName,
            emergencyPhone: tenant.emergencyPhone,
            occupation: tenant.occupation,
            moveInDate: tenant.moveInDate,
            depositAmount: tenant.depositAmount,
            monthlyRent: tenant.monthlyRent,
            roomId: tenant.roomId ?? undefined,
            notes: tenant.notes,
          }}
          onClose={() => setShowEdit(false)}
          onSave={() => { setShowEdit(false); router.refresh() }}
        />
      )}
    </div>
  )
}
