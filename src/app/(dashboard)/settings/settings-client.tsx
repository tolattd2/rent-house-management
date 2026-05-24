'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useForm } from 'react-hook-form'
import { Save, Building2, DollarSign, MessageSquare, Mail, Phone, Users, Plus, Key, Trash2, QrCode, Upload, X, Send, MapPin } from 'lucide-react'
import { mapHref } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { parseBranches, RATE_KEYS, RATE_DEFAULTS, branchRateKey, type Branch } from '@/lib/branches'
import { QrCropDialog } from '@/components/settings/qr-crop-dialog'
import { useDeleteWithUndo } from '@/hooks/use-delete-with-undo'
import { DeleteConfirmDialog } from '@/components/ui/delete-confirm-dialog'

interface UserRow {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'staff'
  phone: string
  createdAt: string
}

interface Props { settings: Record<string, string> }

const VALID_TABS = ['rates', 'company', 'telegram', 'email', 'sms', 'qr', 'users'] as const

export function SettingsClient({ settings: initial }: Props) {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get('tab') ?? ''
  const initialTab = (VALID_TABS as readonly string[]).includes(tabParam) ? tabParam : 'rates'
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [loading, setLoading] = useState(false)

  // Users state
  const [users, setUsers] = useState<UserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [addingUser, setAddingUser] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'staff' as const, phone: '' })

  const [showChangePw, setShowChangePw] = useState(false)
  const [changePwTarget, setChangePwTarget] = useState<UserRow | null>(null)
  const { triggerDelete, dialogState, closeDialog } = useDeleteWithUndo()
  const [newPassword, setNewPassword] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  // Branches — name/prefix and the slug used to key company info + QR settings.
  const [branches, setBranches] = useState<Branch[]>(() => parseBranches(initial.branches))
  // company_<slug>_name|phone|address and qr_<slug>_label_<slot> values.
  const [branchInfo, setBranchInfo] = useState<Record<string, string>>(() => {
    const info: Record<string, string> = {}
    for (const [k, v] of Object.entries(initial)) {
      if (k.startsWith('company_') || /^qr_.+_label_[12]$/.test(k)) info[k] = v
    }
    return info
  })

  // QR code images — keyed by "<slug>_<slot>".
  const [qrImages, setQrImages] = useState<Record<string, string>>(() => {
    const imgs: Record<string, string> = {}
    for (const b of branches) {
      imgs[`${b.slug}_1`] = initial[`qr_${b.slug}_1`] ?? ''
      imgs[`${b.slug}_2`] = initial[`qr_${b.slug}_2`] ?? ''
    }
    return imgs
  })
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const qrInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [cropPending, setCropPending] = useState<{ slug: string; slot: 1 | 2; file: File } | null>(null)

  // Per-branch billing rates, keyed "<rateKey>_<slug>". Seeded from the
  // per-branch value, then the legacy global value, then the hard default.
  const [branchRates, setBranchRates] = useState<Record<string, string>>(() => {
    const rates: Record<string, string> = {}
    for (const b of parseBranches(initial.branches)) {
      for (const key of RATE_KEYS) {
        rates[branchRateKey(key, b.slug)] =
          initial[branchRateKey(key, b.slug)] ?? initial[key] ?? RATE_DEFAULTS[key]
      }
    }
    return rates
  })
  const setBranchRate = (key: string, value: string) =>
    setBranchRates((prev) => ({ ...prev, [key]: value }))

  const updateBranch = (index: number, patch: Partial<Branch>) =>
    setBranches((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  const addBranch = () =>
    setBranches((prev) => [...prev, { slug: `b${Math.random().toString(36).slice(2, 9)}`, name: '', prefix: '' }])
  const removeBranch = (index: number) =>
    setBranches((prev) => prev.filter((_, i) => i !== index))
  const setBranchField = (key: string, value: string) =>
    setBranchInfo((prev) => ({ ...prev, [key]: value }))

  const handleQrUpload = useCallback(async (slug: string, slot: 1 | 2, file: File) => {
    const key = `${slug}_${slot}`
    setUploadingKey(key)
    const form = new FormData()
    form.append('branch', slug)
    form.append('slot', String(slot))
    form.append('file', file)
    const res = await fetch('/api/settings/qr', { method: 'POST', body: form })
    const data = await res.json()
    if (data.ok) {
      setQrImages(prev => ({ ...prev, [key]: data.value }))
      toast({ title: t('settings_saved') })
    } else {
      toast({ title: t('settings_save_error'), description: data.error, variant: 'destructive' })
    }
    setUploadingKey(null)
  }, [t])

  const handleFileSelected = useCallback((slug: string, slot: 1 | 2, file: File | undefined) => {
    if (!file) return
    setCropPending({ slug, slot, file })
  }, [])

  const handleQrClear = useCallback(async (slug: string, slot: 1 | 2) => {
    const key = `${slug}_${slot}`
    const form = new FormData()
    form.append('branch', slug)
    form.append('slot', String(slot))
    form.append('clear', 'true')
    const res = await fetch('/api/settings/qr', { method: 'POST', body: form })
    const data = await res.json()
    if (data.ok) {
      setQrImages(prev => ({ ...prev, [key]: '' }))
      toast({ title: t('settings_saved') })
    }
  }, [t])

  async function loadUsers() {
    setUsersLoading(true)
    const res = await fetch('/api/users')
    const data = await res.json()
    if (data.ok) setUsers(data.data)
    setUsersLoading(false)
  }

  async function handleAddUser() {
    if (!newUser.name || !newUser.email || !newUser.password) return
    setAddingUser(true)
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: t('settings_user_added') })
      setShowAddUser(false)
      setNewUser({ name: '', email: '', password: '', role: 'staff', phone: '' })
      loadUsers()
    } else {
      toast({ title: t('settings_user_add_error'), description: data.error, variant: 'destructive' })
    }
    setAddingUser(false)
  }

  async function handleChangePassword() {
    if (!changePwTarget || !newPassword) return
    setChangingPw(true)
    const res = await fetch(`/api/users/${changePwTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: t('settings_password_changed') })
      setShowChangePw(false)
      setNewPassword('')
      setChangePwTarget(null)
    } else {
      toast({ title: t('settings_password_change_error'), description: data.error, variant: 'destructive' })
    }
    setChangingPw(false)
  }

  function handleDeleteUser(user: UserRow) {
    triggerDelete({
      itemName: user.name,
      onRemove: () => setUsers((prev) => prev.filter((u) => u.id !== user.id)),
      onRestore: () => setUsers((prev) => [user, ...prev]),
      onExecute: () => fetch(`/api/users/${user.id}`, { method: 'DELETE' }).then((r) => r.json()),
      onSuccess: () => loadUsers(),
    })
  }

  const [testingTelegram, setTestingTelegram] = useState(false)
  const [testingLateAlert, setTestingLateAlert] = useState(false)
  const [testingLandlordAlert, setTestingLandlordAlert] = useState(false)
  const [lateAlertEnabled, setLateAlertEnabled] = useState(initial.late_alert_enabled !== 'false')
  const [lateAlertThresholdDays, setLateAlertThresholdDays] = useState(initial.late_alert_threshold_days ?? '10')
  const [landlordAlertEnabled, setLandlordAlertEnabled] = useState(initial.landlord_alert_enabled === 'true')
  const [settingUpWebhook, setSettingUpWebhook] = useState(false)
  const [linkingEnabled, setLinkingEnabled] = useState(initial.telegram_linking_enabled === 'true')

  const { register, handleSubmit, getValues } = useForm({
    defaultValues: {
      telegram_token: initial.telegram_token ?? '',
      telegram_chat_id: initial.telegram_chat_id ?? '',
      smtp_host: initial.smtp_host ?? '',
      smtp_port: initial.smtp_port ?? '587',
      smtp_user: initial.smtp_user ?? '',
      smtp_pass: initial.smtp_pass ?? '',
      email_from: initial.email_from ?? '',
      twilio_sid: initial.twilio_sid ?? '',
      twilio_token: initial.twilio_token ?? '',
      twilio_phone: initial.twilio_phone ?? '',
    },
  })

  async function handleTelegramTest() {
    setTestingTelegram(true)
    const res = await fetch('/api/settings/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: getValues('telegram_token'),
        chat_id: getValues('telegram_chat_id'),
      }),
    })
    const data = await res.json()
    if (data.ok) {
      toast({ title: t('settings_telegram_test_success') })
    } else {
      toast({ title: t('settings_telegram_test_failed'), description: data.error, variant: 'destructive' })
    }
    setTestingTelegram(false)
  }

  async function handleLateAlertTest() {
    setTestingLateAlert(true)
    const res = await fetch('/api/settings/late-alert-test', { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      toast({ title: 'Test sent — check your Telegram' })
    } else {
      toast({ title: 'Failed to send', description: data.error, variant: 'destructive' })
    }
    setTestingLateAlert(false)
  }

  async function handleLandlordAlertTest() {
    setTestingLandlordAlert(true)
    const res = await fetch('/api/settings/landlord-overdue-test', { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      toast({ title: 'Test sent — check your Telegram' })
    } else {
      toast({ title: 'Failed to send', description: data.error, variant: 'destructive' })
    }
    setTestingLandlordAlert(false)
  }

  async function handleToggleLinking(next: boolean) {
    setSettingUpWebhook(true)
    const res = await fetch('/api/telegram/setup-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    })
    const data = await res.json()
    if (data.ok) {
      setLinkingEnabled(next)
      toast({ title: next ? 'Tenant linking enabled' : 'Tenant linking disabled' })
    } else {
      toast({ title: 'Failed', description: data.error, variant: 'destructive' })
    }
    setSettingUpWebhook(false)
  }

  const onSubmit = async (data: Record<string, string>) => {
    setLoading(true)
    // Persist a value for every branch × rate so newly added branches are saved.
    const ratePayload: Record<string, string> = {}
    for (const b of branches) {
      for (const key of RATE_KEYS) {
        ratePayload[branchRateKey(key, b.slug)] =
          branchRates[branchRateKey(key, b.slug)] ?? RATE_DEFAULTS[key]
      }
    }
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        ...branchInfo,
        ...ratePayload,
        branches: JSON.stringify(branches),
        late_alert_enabled: lateAlertEnabled ? 'true' : 'false',
        late_alert_threshold_days: (() => {
          const n = Math.floor(Number(lateAlertThresholdDays))
          return Number.isFinite(n) && n > 0 ? String(n) : '10'
        })(),
        landlord_alert_enabled: landlordAlertEnabled ? 'true' : 'false',
      }),
    })
    const result = await res.json()
    if (result.ok) {
      toast({ title: t('settings_saved') })
      router.refresh()
    } else {
      toast({ title: t('settings_save_error'), description: result.error, variant: 'destructive' })
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">{t('settings_title')}</h1>
        <p className="text-muted-foreground text-sm">{t('settings_subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Tabs defaultValue={initialTab} onValueChange={(v) => { if (v === 'users') loadUsers() }}>
          <div className="overflow-x-auto">
            <TabsList className="flex-nowrap w-max min-w-full">
              <TabsTrigger value="rates"><DollarSign className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('settings_rates')}</span></TabsTrigger>
              <TabsTrigger value="company"><Building2 className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('settings_company')}</span></TabsTrigger>
              <TabsTrigger value="telegram"><MessageSquare className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('settings_telegram_bot')}</span></TabsTrigger>
              <TabsTrigger value="email"><Mail className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('settings_email_smtp')}</span></TabsTrigger>
              <TabsTrigger value="sms"><Phone className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('settings_twilio_sms')}</span></TabsTrigger>
              <TabsTrigger value="qr"><QrCode className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('settings_qr_codes')}</span></TabsTrigger>
              <TabsTrigger value="users"><Users className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">{t('settings_users')}</span></TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="rates" className="mt-4 space-y-4">
            {branches.map((br) => (
              <Card key={br.slug}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    {br.name || t('settings_branch_name')} — {t('settings_billing_rates')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t('settings_exchange_rate')}</Label>
                      <Input
                        type="number"
                        value={branchRates[branchRateKey('exchange_rate', br.slug)] ?? RATE_DEFAULTS.exchange_rate}
                        onChange={(e) => setBranchRate(branchRateKey('exchange_rate', br.slug), e.target.value)}
                        placeholder="4100"
                      />
                      <p className="text-xs text-muted-foreground">{t('settings_exchange_rate_hint')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('settings_late_penalty')}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={branchRates[branchRateKey('late_penalty_usd', br.slug)] ?? RATE_DEFAULTS.late_penalty_usd}
                        onChange={(e) => setBranchRate(branchRateKey('late_penalty_usd', br.slug), e.target.value)}
                        placeholder="1"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('settings_water_rate')}</Label>
                      <Input
                        type="number"
                        value={branchRates[branchRateKey('water_rate_riel', br.slug)] ?? RATE_DEFAULTS.water_rate_riel}
                        onChange={(e) => setBranchRate(branchRateKey('water_rate_riel', br.slug), e.target.value)}
                        placeholder="2000"
                      />
                      <p className="text-xs text-muted-foreground">{t('settings_rate_hint')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('settings_electric_rate')}</Label>
                      <Input
                        type="number"
                        value={branchRates[branchRateKey('electric_rate_riel', br.slug)] ?? RATE_DEFAULTS.electric_rate_riel}
                        onChange={(e) => setBranchRate(branchRateKey('electric_rate_riel', br.slug), e.target.value)}
                        placeholder="720"
                      />
                      <p className="text-xs text-muted-foreground">{t('settings_rate_hint')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="company" className="mt-4 space-y-4">
            {branches.map((br, i) => (
              <Card key={br.slug}>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="w-4 h-4" />{br.name || t('settings_branch_name')}
                  </CardTitle>
                  {isAdmin && branches.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => removeBranch(i)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />{t('settings_remove_branch')}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t('settings_branch_name')}</Label>
                      <Input
                        value={br.name}
                        onChange={(e) => updateBranch(i, { name: e.target.value })}
                        placeholder="Takmoa"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('settings_room_prefix')}</Label>
                      <Input
                        value={br.prefix}
                        onChange={(e) => updateBranch(i, { prefix: e.target.value })}
                        placeholder="Rckd"
                      />
                      <p className="text-xs text-muted-foreground">{t('settings_room_prefix_hint')}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_company_name')}</Label>
                    <Input
                      value={branchInfo[`company_${br.slug}_name`] ?? ''}
                      onChange={(e) => setBranchField(`company_${br.slug}_name`, e.target.value)}
                      placeholder="Takmao Rental"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_phone')}</Label>
                    <Input
                      value={branchInfo[`company_${br.slug}_phone`] ?? ''}
                      onChange={(e) => setBranchField(`company_${br.slug}_phone`, e.target.value)}
                      placeholder="012 000 000"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_address')}</Label>
                    <Input
                      value={branchInfo[`company_${br.slug}_address`] ?? ''}
                      onChange={(e) => setBranchField(`company_${br.slug}_address`, e.target.value)}
                      placeholder="Phnom Penh, Cambodia"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_map_location')}</Label>
                    <Input
                      value={branchInfo[`company_${br.slug}_maplink`] ?? ''}
                      onChange={(e) => setBranchField(`company_${br.slug}_maplink`, e.target.value)}
                      placeholder="https://maps.app.goo.gl/..."
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{t('settings_map_location_hint')}</p>
                      {(branchInfo[`company_${br.slug}_maplink`] ?? '').trim() && (
                        <a
                          href={mapHref(branchInfo[`company_${br.slug}_maplink`])}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1 flex-shrink-0"
                        >
                          <MapPin className="w-3 h-3" />{t('view_on_map')}
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {isAdmin && (
              <Button type="button" variant="outline" onClick={addBranch}>
                <Plus className="w-4 h-4 mr-2" />{t('settings_add_branch')}
              </Button>
            )}
          </TabsContent>

          <TabsContent value="telegram" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-500" />{t('settings_telegram_bot')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">{t('settings_telegram_setup')}</p>
                  <ol className="text-xs space-y-0.5 list-decimal list-inside">
                    <li>{t('settings_telegram_step1')}</li>
                    <li>{t('settings_telegram_step2')}</li>
                    <li>{t('settings_telegram_step3')}</li>
                  </ol>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('settings_telegram_token')}</Label>
                  <Input {...register('telegram_token')} placeholder="123456789:ABCdef..." type="password" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('settings_telegram_chat')}</Label>
                  <Input {...register('telegram_chat_id')} placeholder="-100123456789" />
                </div>
                <div className="pt-3 border-t space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>Auto Overdue Alert For Tenant</Label>
                      <p className="text-xs text-muted-foreground">
                        Message the tenant directly (Khmer + English) when their invoice is at least
                        the configured number of days overdue — checked daily. Penalty uses the Late Penalty rate.
                      </p>
                    </div>
                    <Switch checked={lateAlertEnabled} onCheckedChange={setLateAlertEnabled} />
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Overdue threshold (days)</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={lateAlertThresholdDays}
                      onChange={(e) => setLateAlertThresholdDays(e.target.value)}
                      disabled={!lateAlertEnabled}
                      placeholder="10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Tenant is notified once their billing is this many days overdue (e.g. 10 = on day 10).
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={testingLateAlert}
                    onClick={handleLateAlertTest}
                  >
                    <Send className="w-4 h-4 mr-2" />Send test message
                  </Button>
                </div>
                <div className="pt-3 border-t space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>Overdue Alert For Landlord</Label>
                      <p className="text-xs text-muted-foreground">
                        Notify the landlord (this Telegram chat) when a tenant&apos;s recorded
                        &quot;Promise to pay&quot; date passes without payment — checked daily.
                        Set the promise date on each invoice from its page.
                      </p>
                    </div>
                    <Switch checked={landlordAlertEnabled} onCheckedChange={setLandlordAlertEnabled} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={testingLandlordAlert}
                    onClick={handleLandlordAlertTest}
                  >
                    <Send className="w-4 h-4 mr-2" />Send test message
                  </Button>
                </div>
                {isAdmin && (
                  <div className="pt-3 border-t space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label>Enable tenant linking</Label>
                        <p className="text-xs text-muted-foreground">
                          Let tenants link their Telegram via the bot&apos;s &quot;Share my phone number&quot; button, so reminders reach them directly.
                        </p>
                      </div>
                      <Switch
                        checked={linkingEnabled}
                        disabled={settingUpWebhook}
                        onCheckedChange={handleToggleLinking}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={testingTelegram}
                      onClick={handleTelegramTest}
                    >
                      <Send className="w-4 h-4 mr-2" />{t('settings_telegram_test')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('settings_email_smtp')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t('settings_smtp_host')}</Label>
                    <Input {...register('smtp_host')} placeholder="smtp.gmail.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_smtp_port')}</Label>
                    <Input {...register('smtp_port')} placeholder="587" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_smtp_user')}</Label>
                    <Input {...register('smtp_user')} placeholder="your@email.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_smtp_pass')}</Label>
                    <Input type="password" {...register('smtp_pass')} placeholder="••••••••" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>{t('settings_from_email')}</Label>
                    <Input {...register('email_from')} placeholder="noreply@takmao.com" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sms" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('settings_twilio_sms')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t('settings_twilio_sid')}</Label>
                  <Input {...register('twilio_sid')} placeholder="ACxxxx..." />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('settings_twilio_token')}</Label>
                  <Input type="password" {...register('twilio_token')} placeholder="••••••••" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('settings_twilio_phone')}</Label>
                  <Input {...register('twilio_phone')} placeholder="+1234567890" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="qr" className="mt-4 space-y-4">
            <p className="text-xs text-muted-foreground">{t('settings_qr_hint')}</p>
            {branches.map((br) => (
              <Card key={br.slug}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <QrCode className="w-4 h-4" />{br.name || t('settings_branch_name')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {([1, 2] as const).map((slot) => {
                      const key = `${br.slug}_${slot}`
                      const preview = qrImages[key]
                      const uploading = uploadingKey === key
                      return (
                        <div key={slot} className="space-y-3">
                          <p className="font-medium text-sm">{t(`settings_qr_slot${slot}` as 'settings_qr_slot1')}</p>
                          <div className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-3 min-h-[160px] justify-center">
                            {preview ? (
                              <>
                                <img src={preview} alt={`QR ${slot}`} className="w-28 h-28 object-contain rounded" />
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => qrInputRefs.current[key]?.click()}
                                    disabled={uploading}
                                  >
                                    <Upload className="w-3.5 h-3.5 mr-1" />{t('settings_qr_upload')}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:bg-destructive/10"
                                    onClick={() => handleQrClear(br.slug, slot)}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                <QrCode className="w-10 h-10 text-muted-foreground/30" />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => qrInputRefs.current[key]?.click()}
                                  disabled={uploading}
                                >
                                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                                  {uploading ? t('saving') : t('settings_qr_upload')}
                                </Button>
                              </>
                            )}
                            <input
                              ref={(el) => { qrInputRefs.current[key] = el }}
                              type="file"
                              accept="image/*"
                              className="sr-only"
                              onChange={(e) => { handleFileSelected(br.slug, slot, e.target.files?.[0]); e.target.value = '' }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>{t('settings_qr_label')}</Label>
                            <Input
                              value={branchInfo[`qr_${br.slug}_label_${slot}`] ?? ''}
                              onChange={(e) => setBranchField(`qr_${br.slug}_label_${slot}`, e.target.value)}
                              placeholder={slot === 1 ? 'e.g. ABA Bank' : 'e.g. Wing Money'}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />{t('settings_users_title')}
                </CardTitle>
                {isAdmin && (
                  <Button type="button" size="sm" onClick={() => setShowAddUser(true)}>
                    <Plus className="w-4 h-4 mr-1" />{t('settings_add_user')}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
                ) : users.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t('settings_admin_only_note')}</p>
                ) : (
                  <div className="space-y-2">
                    {users.map((u) => (
                      <div key={u.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                          {u.phone && <p className="text-xs text-muted-foreground">{u.phone}</p>}
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-xs capitalize">
                            {u.role}
                          </Badge>
                          {isAdmin && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => { setChangePwTarget(u); setShowChangePw(true) }}
                              >
                                <Key className="w-3 h-3 mr-1" />{t('settings_change_password')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteUser(u)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Only show save button when not on users tab */}
        {isAdmin && (
          <div className="mt-6 flex justify-end">
            <Button type="submit" loading={loading}>
              <Save className="w-4 h-4 mr-2" />{t('settings_save')}
            </Button>
          </div>
        )}
      </form>

      {/* Add User Dialog */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings_add_user')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t('settings_user_name')}</Label>
              <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="John Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('settings_user_email')}</Label>
              <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="john@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('settings_user_password')}</Label>
              <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('settings_user_role')}</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as typeof newUser.role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('settings_user_phone')}</Label>
              <Input value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} placeholder="012 000 000" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAddUser(false)}>{t('cancel')}</Button>
              <Button type="button" loading={addingUser} onClick={handleAddUser}>{t('settings_add_user')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={showChangePw} onOpenChange={(open) => { setShowChangePw(open); if (!open) setNewPassword('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings_change_password')} — {changePwTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t('settings_new_password')}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowChangePw(false)}>{t('cancel')}</Button>
              <Button type="button" loading={changingPw} onClick={handleChangePassword}>{t('save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={dialogState.open}
        itemName={dialogState.itemName}
        onClose={closeDialog}
        onConfirm={dialogState.onConfirm}
      />

      {cropPending && (
        <QrCropDialog
          file={cropPending.file}
          onConfirm={(croppedFile) => {
            const { slug, slot } = cropPending
            setCropPending(null)
            handleQrUpload(slug, slot, croppedFile)
          }}
          onCancel={() => setCropPending(null)}
        />
      )}
    </div>
  )
}
