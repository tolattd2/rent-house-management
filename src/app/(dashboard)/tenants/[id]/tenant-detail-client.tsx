'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  User, Phone, Calendar,
  Edit, ArrowLeft, Home, FileText, CreditCard,
  CheckCircle2, AlertTriangle, LogOut,
  Bell, Plus, Pencil, Trash2, Wrench, RotateCcw,
  Send, History
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TenantFormDialog } from '@/components/tenants/tenant-form-dialog'
import { NoticeDialog, type TenantNotice } from '@/components/tenants/notice-dialog'
import { formatCurrency, formatDate, formatMonth, formatPhones } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useBack } from '@/hooks/use-back'
import { useLanguage } from '@/contexts/language-context'
import { useRoomLabel } from '@/contexts/branches-context'

interface Props {
  tenant: {
    id: string; fullName: string; gender: string; phone: string; phonesExtra: string[]; nationalId: string
    telegramChatId: string
    emergencyContact: string; emergencyName: string; emergencyPhone: string
    occupation: string; moveInDate: string; moveOutDate: string
    depositAmount: number; monthlyRent: number; payDay: number; status: string; notes: string; createdAt: Date
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
    notices: TenantNotice[]
  }
  rooms: Array<{ id: string; roomNumber: string; branch?: string; status: string; rentPriceUsd: number }>
}

/** Icon + badge colour per notice type. */
const NOTICE_META: Record<TenantNotice['type'], { icon: typeof Bell; badge: 'error' | 'warning' | 'secondary' }> = {
  move_out: { icon: LogOut, badge: 'error' },
  repair: { icon: Wrench, badge: 'warning' },
  complaint: { icon: AlertTriangle, badge: 'warning' },
  general: { icon: FileText, badge: 'secondary' },
}

export function TenantDetailClient({ tenant, rooms }: Props) {
  const router = useRouter()
  const goBack = useBack('/tenants')
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const { t } = useLanguage()
  const roomLabel = useRoomLabel()
  const [showEdit, setShowEdit] = useState(false)

  const [notices, setNotices] = useState<TenantNotice[]>(tenant.notices)
  const [showNotice, setShowNotice] = useState(false)
  const [editingNotice, setEditingNotice] = useState<TenantNotice | null>(null)
  const openNotices = notices.filter((n) => n.status === 'open')

  const [linkAction, setLinkAction] = useState<'restore' | 'invite' | null>(null)

  async function handleRestoreLink() {
    setLinkAction('restore')
    const res = await fetch(`/api/tenants/${tenant.id}/restore-telegram`, { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      toast({
        title: data.alreadyLinked ? t('tenant_link_already_linked') : t('tenant_link_restored'),
      })
      router.refresh()
    } else {
      toast({ title: t('tenant_link_restore_failed'), description: data.error, variant: 'destructive' })
    }
    setLinkAction(null)
  }

  async function handleSendInvite() {
    setLinkAction('invite')
    const res = await fetch(`/api/tenants/${tenant.id}/telegram-invite`, { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      toast({ title: t('tenant_link_invite_sent') })
    } else {
      toast({ title: t('tenant_link_invite_failed'), description: data.error, variant: 'destructive' })
    }
    setLinkAction(null)
  }

  function handleNoticeSaved(record: TenantNotice) {
    setNotices((prev) =>
      prev.some((n) => n.id === record.id)
        ? prev.map((n) => (n.id === record.id ? record : n))
        : [record, ...prev],
    )
    setShowNotice(false)
    setEditingNotice(null)
    router.refresh()
  }

  async function toggleNoticeResolved(n: TenantNotice) {
    const next = n.status === 'open' ? 'resolved' : 'open'
    const res = await fetch(`/api/notices/${n.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    const data = await res.json()
    if (data.ok) {
      setNotices((prev) => prev.map((x) => (x.id === n.id ? data.record : x)))
      toast({ title: next === 'resolved' ? t('notice_resolved_toast') : t('notice_reopened_toast') })
      router.refresh()
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  async function deleteNotice(n: TenantNotice) {
    if (!confirm(t('notice_delete_confirm'))) return
    const res = await fetch(`/api/notices/${n.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      setNotices((prev) => prev.filter((x) => x.id !== n.id))
      toast({ title: t('notice_deleted') })
      router.refresh()
    } else {
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

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
        <Button variant="ghost" size="sm" className="h-10" onClick={goBack}><ArrowLeft className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">{t('back')}</span></Button>
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
                  <span>{formatPhones(tenant.phone, tenant.phonesExtra) || '—'}</span>
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

      {isAdmin && !tenant.telegramChatId && (
        <Card className="border-amber-300 dark:border-amber-900/70 bg-amber-50/60 dark:bg-amber-950/20">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{t('tenant_link_banner_title')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('tenant_link_banner_desc')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm" variant="outline"
                onClick={handleRestoreLink}
                loading={linkAction === 'restore'}
                disabled={linkAction !== null}
              >
                <History className="w-3.5 h-3.5 mr-1.5" />{t('tenant_link_restore_btn')}
              </Button>
              <Button
                size="sm"
                onClick={handleSendInvite}
                loading={linkAction === 'invite'}
                disabled={linkAction !== null || !tenant.phone}
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />{t('tenant_link_invite_btn')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
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
          <p className="text-xs text-muted-foreground leading-tight">{t('tenants_col_payday')}</p>
          <p className="text-base sm:text-xl font-bold mt-0.5 tabular-nums truncate">{tenant.payDay ?? '—'}</p>
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
          <TabsTrigger value="notices" className="flex-1 sm:flex-none text-xs sm:text-sm">
            <Bell className="w-4 h-4 hidden sm:block sm:mr-2" />{t('notice_tab')}
            {openNotices.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {openNotices.length}
              </span>
            )}
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
                [t('settings_phone'), formatPhones(tenant.phone, tenant.phonesExtra) || '—'],
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

        <TabsContent value="notices" className="mt-4">
          <Card>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-semibold">{t('notice_tab')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {openNotices.length} {t('notice_open_count')}
                </p>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={() => { setEditingNotice(null); setShowNotice(true) }}>
                  <Plus className="w-3.5 h-3.5 mr-2" />{t('notice_add')}
                </Button>
              )}
            </div>
            <CardContent className="p-4 space-y-3">
              {notices.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                  <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>{t('notice_none')}</p>
                </div>
              )}
              {notices.map((n) => {
                const meta = NOTICE_META[n.type]
                const Icon = meta.icon
                const resolved = n.status === 'resolved'
                return (
                  <div
                    key={n.id}
                    className={`p-4 border rounded-xl ${
                      resolved
                        ? 'border-border bg-muted/30'
                        : 'border-amber-300 dark:border-amber-900/70 bg-amber-50/60 dark:bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          resolved ? 'bg-muted' : 'bg-amber-100 dark:bg-amber-900/40'
                        }`}>
                          <Icon className={`w-4 h-4 ${
                            resolved ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={resolved ? 'secondary' : meta.badge}>
                              {t(`notice_type_${n.type}` as Parameters<typeof t>[0])}
                            </Badge>
                            <Badge variant={resolved ? 'success' : 'warning'}>
                              {t(resolved ? 'notice_status_resolved' : 'notice_status_open')}
                            </Badge>
                          </div>
                          <p className={`text-sm mt-1.5 whitespace-pre-wrap break-words ${resolved ? 'text-muted-foreground' : ''}`}>
                            {n.message}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {n.expectedDate && (
                              <span className="font-medium text-amber-700 dark:text-amber-500">
                                {t('notice_expected')}: {formatDate(n.expectedDate)} ·{' '}
                              </span>
                            )}
                            {t('notice_added_on')} {formatDate(String(n.createdAt))}
                            {resolved && n.resolvedAt && ` · ${t('notice_status_resolved')} ${formatDate(String(n.resolvedAt))}`}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost" size="sm" className="h-8 px-2"
                            title={resolved ? t('notice_reopen') : t('notice_resolve')}
                            onClick={() => toggleNoticeResolved(n)}
                          >
                            {resolved
                              ? <RotateCcw className="w-3.5 h-3.5" />
                              : <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-8 px-2"
                            onClick={() => { setEditingNotice(n); setShowNotice(true) }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-8 px-2 text-red-500 hover:text-red-600"
                            onClick={() => deleteNotice(n)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
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
            telegramChatId: tenant.telegramChatId,
            nationalId: tenant.nationalId,
            emergencyContact: tenant.emergencyContact,
            emergencyName: tenant.emergencyName,
            emergencyPhone: tenant.emergencyPhone,
            occupation: tenant.occupation,
            moveInDate: tenant.moveInDate,
            depositAmount: tenant.depositAmount,
            monthlyRent: tenant.monthlyRent,
            payDay: tenant.payDay,
            roomId: tenant.roomId ?? undefined,
            notes: tenant.notes,
          }}
          onClose={() => setShowEdit(false)}
          onSave={() => { setShowEdit(false); router.refresh() }}
        />
      )}

      {showNotice && (
        <NoticeDialog
          tenantId={tenant.id}
          notice={editingNotice}
          onClose={() => { setShowNotice(false); setEditingNotice(null) }}
          onSave={handleNoticeSaved}
        />
      )}

    </div>
  )
}
