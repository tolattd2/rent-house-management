'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  User, Phone, Calendar,
  Edit, ArrowLeft, Home, FileText, CreditCard,
  CheckCircle2, AlertTriangle, LogIn, LogOut,
  Bell, Plus, Pencil, Trash2, Wrench, RotateCcw,
  Send, History, FileSignature, Eye, Printer, MessageCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableScroll } from '@/components/ui/table-scroll'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SortableTh, type SortDir } from '@/components/ui/sortable-th'
import { TenantFormDialog } from '@/components/tenants/tenant-form-dialog'
import { GenerateContractDialog } from '@/components/tenants/generate-contract-dialog'
import { NoticeDialog, type TenantNotice } from '@/components/tenants/notice-dialog'
import { formatCurrency, formatDate, formatGender, formatMonth, formatPhones } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { useBack } from '@/hooks/use-back'
import { useLanguage } from '@/contexts/language-context'
import { useRoomLabel } from '@/contexts/branches-context'

interface Props {
  tenant: {
    id: string; fullName: string; gender: string; phone: string; phonesExtra: string[]; nationalId: string
    telegramChatId: string
    emergencyContact: string; emergencyName: string; emergencyPhone: string
    occupation: string; age: number; nationality: string
    moveInDate: string; moveOutDate: string
    depositAmount: number; monthlyRent: number; payDay: number; status: string; notes: string; createdAt: Date
    roomId: string | null
    room: {
      id: string; roomNumber: string; branch?: string; roomType: string; rentPriceUsd: number
      depositAmount: number; status: string
    } | null
    contracts: Array<{
      id: string; contractStart: string; contractEnd: string; monthlyRent: number
      depositAmount: number; status: string; createdAt: Date
      agreementText?: string
    }>
    billings: Array<{
      id: string; billingMonth: string; roomRentUsd: number; waterUsage: number
      waterCostRiel: number; electricUsage: number; electricCostRiel: number
      totalUsd: number; totalRiel: number; paymentStatus: string; paymentDate: string
      lateDays: number; latePenaltyUsd: number; discountUsd: number; outstandingDebtUsd: number
      payments: Array<{ id: string; amountUsd: number; paymentMethod: string; createdAt: Date }>
    }>
    notifications: Array<{ id: string; type: string; message: string; status: string; createdAt: Date }>
    notices: TenantNotice[]
  }
  rooms: Array<{ id: string; roomNumber: string; branch?: string; status: string; rentPriceUsd: number }>
}

/** Icon + badge colour per notice type. */
const NOTICE_META: Record<TenantNotice['type'], { icon: typeof Bell; badge: 'error' | 'warning' | 'secondary' | 'success' }> = {
  move_in: { icon: LogIn, badge: 'success' },
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
  const { t, language } = useLanguage()
  const roomLabel = useRoomLabel()
  const [showEdit, setShowEdit] = useState(false)

  const [notices, setNotices] = useState<TenantNotice[]>(tenant.notices)
  const [showNotice, setShowNotice] = useState(false)
  const [editingNotice, setEditingNotice] = useState<TenantNotice | null>(null)
  const openNotices = notices.filter((n) => n.status === 'open')

  const [linkAction, setLinkAction] = useState<'restore' | 'invite' | null>(null)

  // Agreement (contract) dialog: when set, opens the GenerateContractDialog.
  // initialText is undefined to use the active contract's saved text, or a
  // specific contract's HTML to open that one for read/edit.
  const [generateOpen, setGenerateOpen] = useState<{ initialText?: string } | null>(null)

  // Which contract row is currently mid-send to the tenant's Telegram chat.
  // Used to drive a per-row loading state on the "Send to Tenant" button.
  const [sendingContractId, setSendingContractId] = useState<string | null>(null)

  // Billing-history sort. Default: month descending (newest first).
  type BillSortKey = 'billingMonth' | 'roomRentUsd' | 'waterCostRiel' | 'electricCostRiel' | 'latePenaltyUsd' | 'lateDays' | 'totalUsd' | 'paymentStatus'
  const [billSort, setBillSort] = useState<{ key: BillSortKey; dir: SortDir }>({ key: 'billingMonth', dir: 'desc' })
  const toggleBillSort = (key: BillSortKey) =>
    setBillSort((prev) => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  // Stable ordering for paid/unpaid/partial when sorting by status.
  const STATUS_ORDER: Record<string, number> = { unpaid: 0, partial: 1, paid: 2 }
  const sortedBillings = [...tenant.billings].sort((a, b) => {
    const { key, dir } = billSort
    const sign = dir === 'asc' ? 1 : -1
    if (key === 'billingMonth') return sign * a.billingMonth.localeCompare(b.billingMonth)
    if (key === 'paymentStatus') return sign * ((STATUS_ORDER[a.paymentStatus] ?? 99) - (STATUS_ORDER[b.paymentStatus] ?? 99))
    const av = (a[key] as number) ?? 0
    const bv = (b[key] as number) ?? 0
    return sign * (av - bv)
  })

  /**
   * Render the saved contract HTML to a real PDF and upload to our
   * send-contract endpoint, which forwards via Telegram sendDocument.
   *
   * We rasterize via html2canvas directly (jsPDF's built-in .html() races the
   * canvas completion and produces blank pages on off-screen containers), then
   * slice the resulting canvas into A4-sized pages on a jsPDF doc. Both libs
   * are dynamic-imported so they stay out of the main bundle.
   */
  async function sendContractToTenant(contractId: string, html: string) {
    if (!tenant.telegramChatId) {
      toast({ title: t('contract_gen_send_no_telegram'), variant: 'destructive' })
      return
    }
    setSendingContractId(contractId)

    // 794px ≈ 210 mm at 96 dpi → A4 width
    const A4_WIDTH_PX = 794

    // We render the contract inside an isolated iframe so the page's Tailwind
    // base layer (`* { border-color: hsl(var(--border)) }` and friends) cannot
    // bleed in and break html2canvas. The iframe has only the print stylesheet
    // we control.
    const iframe = document.createElement('iframe')
    iframe.style.cssText = [
      'position: fixed',
      'left: -10000px',
      'top: 0',
      `width: ${A4_WIDTH_PX}px`,
      'height: 1px',
      'border: 0',
      'background: #ffffff',
    ].join(';')
    document.body.appendChild(iframe)

    try {
      toast({ title: t('contract_gen_send_preparing') })

      const iframeDoc = iframe.contentDocument
      if (!iframeDoc) throw new Error('Could not access iframe document')
      iframeDoc.open()
      iframeDoc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  body {
    font-family: 'Khmer OS Siemreap', 'Noto Sans Khmer', 'Khmer OS', 'Times New Roman', serif;
    font-size: 12pt; line-height: 1.6; color: #111111;
    padding: 20mm; box-sizing: border-box; width: ${A4_WIDTH_PX}px;
  }
  h1 { font-size: 18pt; text-align: center; margin: 0.4em 0; }
  h2 { font-size: 14pt; margin: 0.6em 0 0.3em; }
  h3 { font-size: 12pt; margin: 0.5em 0 0.25em; }
  p  { margin: 0.35em 0; }
  ul, ol { margin: 0.3em 0 0.3em 1.5em; }
  blockquote { border-left: 3px solid #888; margin: 0.5em 0; padding-left: 0.6em; color: #444; }
  pre { background: #f3f3f3; padding: 0.5em; border-radius: 4px; white-space: pre-wrap; }
</style></head><body>${html}</body></html>`)
      iframeDoc.close()

      // Wait for layout/fonts inside the iframe to settle.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      if (iframeDoc.fonts?.ready) await iframeDoc.fonts.ready

      const body = iframeDoc.body
      // Grow the iframe to fit content so html2canvas sees the full height.
      iframe.style.height = `${body.scrollHeight}px`

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const canvas = await html2canvas(body, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        windowWidth: A4_WIDTH_PX,
        width: A4_WIDTH_PX,
        height: body.scrollHeight,
        windowHeight: body.scrollHeight,
      })
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error('Empty render — contract content could not be captured')
      }

      const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * pageWidth) / canvas.width
      const imgData = canvas.toDataURL('image/jpeg', 0.92)

      // Place the same tall image on each page, offset upward so successive
      // page-height slices show through. jsPDF clips anything outside the page.
      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
      while (heightLeft > 0) {
        position -= pageHeight
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }
      const blob = pdf.output('blob')

      toast({ title: t('contract_gen_send_sending') })
      const fd = new FormData()
      fd.append('file', blob, 'contract.pdf')
      const res = await fetch(`/api/tenants/${tenant.id}/send-contract`, {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (data.ok) {
        toast({ title: t('contract_gen_send_success') })
      } else {
        toast({
          title: t('contract_gen_send_failed'),
          description: data.error,
          variant: 'destructive',
        })
      }
    } catch (err) {
      toast({
        title: t('contract_gen_send_failed'),
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    } finally {
      iframe.remove()
      setSendingContractId(null)
    }
  }

  function printAgreement(html: string) {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) {
      toast({ title: t('contract_gen_popup_blocked'), variant: 'destructive' })
      return
    }
    const title = `Agreement — ${tenant.fullName}`
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Khmer OS Siemreap', 'Noto Sans Khmer', 'Khmer OS', 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #111; }
  h1 { font-size: 18pt; text-align: center; margin: 0.4em 0; }
  h2 { font-size: 14pt; margin: 0.6em 0 0.3em; }
  h3 { font-size: 12pt; margin: 0.5em 0 0.25em; }
  p  { margin: 0.35em 0; }
  ul, ol { margin: 0.3em 0 0.3em 1.5em; }
  blockquote { border-left: 3px solid #888; margin: 0.5em 0; padding-left: 0.6em; color: #444; }
  pre { background: #f3f3f3; padding: 0.5em; border-radius: 4px; white-space: pre-wrap; }
</style></head><body>${html}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

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
                  <span>{formatGender(tenant.gender, t)}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Home className="w-4 h-4 text-muted-foreground" />
                  <span>{tenant.room ? `${t('room')} ${roomLabel(tenant.room)}` : t('tenant_no_room')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{t('since')} {formatDate(tenant.moveInDate, language)}</span>
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
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <SortableTh label={t('billing_col_month')} k="billingMonth"     onSort={toggleBillSort} active={billSort.key} dir={billSort.dir} align="left" />
                    <SortableTh label={t('billing_col_rent')}  k="roomRentUsd"      onSort={toggleBillSort} active={billSort.key} dir={billSort.dir} />
                    <SortableTh label={t('water')}             k="waterCostRiel"    onSort={toggleBillSort} active={billSort.key} dir={billSort.dir} />
                    <SortableTh label={t('electric')}          k="electricCostRiel" onSort={toggleBillSort} active={billSort.key} dir={billSort.dir} />
                    <SortableTh label={t('late_penalty')}      k="latePenaltyUsd"   onSort={toggleBillSort} active={billSort.key} dir={billSort.dir} />
                    <SortableTh label={t('billing_late')}      k="lateDays"         onSort={toggleBillSort} active={billSort.key} dir={billSort.dir} />
                    <SortableTh label={t('billing_col_total')} k="totalUsd"         onSort={toggleBillSort} active={billSort.key} dir={billSort.dir} />
                    <SortableTh label={t('status')}            k="paymentStatus"    onSort={toggleBillSort} active={billSort.key} dir={billSort.dir} />
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBillings.map((bill) => (
                    <tr key={bill.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium tabular-nums">{formatMonth(bill.billingMonth, language)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(bill.roomRentUsd)}</td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {bill.waterUsage} {t('unit_kib')} / {bill.waterCostRiel.toLocaleString()} ៛
                      </td>
                      <td className="px-4 py-3 text-right text-xs tabular-nums">
                        {bill.electricUsage} {t('unit_kw')} / {bill.electricCostRiel.toLocaleString()} ៛
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${bill.latePenaltyUsd > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                        {bill.latePenaltyUsd > 0 ? formatCurrency(bill.latePenaltyUsd) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${bill.lateDays > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                        {bill.lateDays > 0 ? bill.lateDays : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
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
                  {sortedBillings.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">{t('no_billing_records')}</td></tr>
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
                [t('tenant_gender'), formatGender(tenant.gender, t)],
                [t('tenant_age'), tenant.age > 0 ? String(tenant.age) : '—'],
                [t('tenant_nationality'), tenant.nationality || '—'],
                [t('settings_phone'), formatPhones(tenant.phone, tenant.phonesExtra) || '—'],
                [t('tenant_national_id'), tenant.nationalId || '—'],
                [t('tenant_emergency_name'), tenant.emergencyName || tenant.emergencyContact || '—'],
                [t('tenant_emergency_phone'), tenant.emergencyPhone || '—'],
                [t('tenant_occupation'), tenant.occupation || '—'],
                [t('tenants_col_movein'), formatDate(tenant.moveInDate, language)],
                [t('tenants_col_moveout'), tenant.moveOutDate ? formatDate(tenant.moveOutDate, language) : '—'],
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
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-semibold">{t('tenant_contracts_tab')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('contract_gen_tab_hint')}</p>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={() => setGenerateOpen({})}>
                  <FileSignature className="w-3.5 h-3.5 mr-2" />{t('contract_gen_open_btn')}
                </Button>
              )}
            </div>
            <CardContent className="p-6 space-y-4">
              {tenant.contracts.length === 0 && (
                <p className="text-muted-foreground text-center py-8">{t('tenant_no_contracts')}</p>
              )}
              {tenant.contracts.map((c) => (
                <div key={c.id} className="p-4 border border-border rounded-xl space-y-3">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="font-semibold">{c.contractStart} → {c.contractEnd || t('tenant_open_ended')}</p>
                      <p className="text-sm text-muted-foreground">{t('monthly_rent')}: {formatCurrency(c.monthlyRent)}{t('tenants_per_month')} · {t('tenants_col_deposit')}: {formatCurrency(c.depositAmount)}</p>
                    </div>
                    <Badge variant={c.status === 'active' ? 'success' : 'secondary'}>
                      {t(c.status === 'active' ? 'status_active' : 'status_inactive')}
                    </Badge>
                  </div>
                  {c.agreementText && c.agreementText.trim().length > 0 ? (
                    <>
                      <div
                        className="text-sm border rounded-md p-3 bg-muted/30 max-h-40 overflow-auto prose prose-sm max-w-none [&_p]:my-1"
                        // Tenant-managed contract text — already sanitized at input via
                        // contenteditable. Rendered read-only for the preview chip.
                        dangerouslySetInnerHTML={{ __html: c.agreementText }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline" size="sm"
                          onClick={() => setGenerateOpen({ initialText: c.agreementText })}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />{t('view')}
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="outline" size="sm"
                            onClick={() => setGenerateOpen({ initialText: c.agreementText })}
                          >
                            <Edit className="w-3.5 h-3.5 mr-1" />{t('edit')}
                          </Button>
                        )}
                        <Button
                          variant="outline" size="sm"
                          onClick={() => printAgreement(c.agreementText || '')}
                        >
                          <Printer className="w-3.5 h-3.5 mr-1" />{t('contract_gen_download_btn')}
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="outline" size="sm"
                            onClick={() => sendContractToTenant(c.id, c.agreementText || '')}
                            loading={sendingContractId === c.id}
                            disabled={!tenant.telegramChatId || sendingContractId !== null}
                            title={tenant.telegramChatId ? undefined : t('contract_gen_send_no_telegram')}
                          >
                            <MessageCircle className="w-3.5 h-3.5 mr-1" />{t('contract_gen_send_btn')}
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      {t('contract_gen_no_agreement_text')}
                    </p>
                  )}
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

      {showEdit && (() => {
        // Pre-fill Contract Start / End from the most recent active contract
        // (fallback to the latest contract overall) so the Edit dialog shows
        // existing values before any new input.
        const latestContract =
          tenant.contracts
            .filter((c) => c.status === 'active')
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ??
          [...tenant.contracts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
        return (
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
              age: tenant.age,
              nationality: tenant.nationality,
              moveInDate: tenant.moveInDate,
              depositAmount: tenant.depositAmount,
              monthlyRent: tenant.monthlyRent > 0 ? tenant.monthlyRent : (tenant.room?.rentPriceUsd ?? 0),
              payDay: tenant.payDay,
              roomId: tenant.roomId ?? undefined,
              notes: tenant.notes,
              contractStart: latestContract?.contractStart ?? '',
              contractEnd: latestContract?.contractEnd ?? '',
            }}
            onClose={() => setShowEdit(false)}
            onSave={() => { setShowEdit(false); router.refresh() }}
          />
        )
      })()}

      {showNotice && (
        <NoticeDialog
          tenantId={tenant.id}
          notice={editingNotice}
          onClose={() => { setShowNotice(false); setEditingNotice(null) }}
          onSave={handleNoticeSaved}
        />
      )}

      {generateOpen && (
        <GenerateContractDialog
          tenantId={tenant.id}
          vars={{
            tenantName: tenant.fullName,
            gender: tenant.gender,
            age: tenant.age,
            nationality: tenant.nationality,
            occupation: tenant.occupation,
            nationalId: tenant.nationalId,
            phone: tenant.phone,
            phonesExtra: tenant.phonesExtra ?? [],
            telegramChatId: tenant.telegramChatId,
            emergencyName: tenant.emergencyName || tenant.emergencyContact,
            emergencyPhone: tenant.emergencyPhone,
            notes: tenant.notes,
            moveInDate: tenant.moveInDate,
            moveOutDate: tenant.moveOutDate,
            roomLabel: tenant.room ? roomLabel(tenant.room) : '',
            branch: tenant.room?.branch ?? '',
            monthlyRent: tenant.monthlyRent > 0 ? tenant.monthlyRent : (tenant.room?.rentPriceUsd ?? 0),
            depositAmount: tenant.depositAmount,
            payDay: tenant.payDay,
            contractStart:
              tenant.contracts.find((c) => c.status === 'active')?.contractStart ??
              tenant.contracts[0]?.contractStart ?? '',
            contractEnd:
              tenant.contracts.find((c) => c.status === 'active')?.contractEnd ??
              tenant.contracts[0]?.contractEnd ?? '',
          }}
          initialText={generateOpen.initialText}
          onClose={() => { setGenerateOpen(null); router.refresh() }}
        />
      )}

    </div>
  )
}
