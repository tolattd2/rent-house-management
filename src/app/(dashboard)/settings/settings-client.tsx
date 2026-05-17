'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Save, Building2, DollarSign, Zap, MessageSquare, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'

interface Props { settings: Record<string, string> }

export function SettingsClient({ settings: initial }: Props) {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit } = useForm({
    defaultValues: {
      exchange_rate: initial.exchange_rate ?? '4100',
      water_rate_riel: initial.water_rate_riel ?? '2000',
      electric_rate_riel: initial.electric_rate_riel ?? '720',
      late_penalty_usd: initial.late_penalty_usd ?? '1',
      company_name: initial.company_name ?? 'Takmao Rental',
      company_phone: initial.company_phone ?? '',
      company_address: initial.company_address ?? 'Phnom Penh, Cambodia',
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

  const onSubmit = async (data: Record<string, string>) => {
    setLoading(true)
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const result = await res.json()
    if (result.ok) {
      toast({ title: t('settings_saved') })
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
        <Tabs defaultValue="rates">
          <TabsList>
            <TabsTrigger value="rates"><DollarSign className="w-4 h-4 mr-2" />{t('settings_rates')}</TabsTrigger>
            <TabsTrigger value="company"><Building2 className="w-4 h-4 mr-2" />{t('settings_company')}</TabsTrigger>
            <TabsTrigger value="telegram"><MessageSquare className="w-4 h-4 mr-2" />{t('settings_telegram_bot')}</TabsTrigger>
            <TabsTrigger value="email"><Mail className="w-4 h-4 mr-2" />{t('settings_email_smtp')}</TabsTrigger>
            <TabsTrigger value="sms"><Phone className="w-4 h-4 mr-2" />{t('settings_twilio_sms')}</TabsTrigger>
          </TabsList>

          <TabsContent value="rates" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('settings_billing_rates')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t('settings_exchange_rate')}</Label>
                    <Input type="number" {...register('exchange_rate')} placeholder="4100" />
                    <p className="text-xs text-muted-foreground">{t('settings_exchange_rate_hint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_late_penalty')}</Label>
                    <Input type="number" step="0.01" {...register('late_penalty_usd')} placeholder="1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_water_rate')}</Label>
                    <Input type="number" {...register('water_rate_riel')} placeholder="2000" />
                    <p className="text-xs text-muted-foreground">{t('settings_rate_hint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('settings_electric_rate')}</Label>
                    <Input type="number" {...register('electric_rate_riel')} placeholder="720" />
                    <p className="text-xs text-muted-foreground">{t('settings_rate_hint')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="company" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('settings_company_info')}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>{t('settings_company_name')}</Label>
                  <Input {...register('company_name')} placeholder="Takmao Rental Management" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('settings_phone')}</Label>
                  <Input {...register('company_phone')} placeholder="012 000 000" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('settings_address')}</Label>
                  <Input {...register('company_address')} placeholder="Phnom Penh, Cambodia" />
                </div>
              </CardContent>
            </Card>
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
        </Tabs>

        <div className="mt-6 flex justify-end">
          <Button type="submit" loading={loading}>
            <Save className="w-4 h-4 mr-2" />{t('settings_save')}
          </Button>
        </div>
      </form>
    </div>
  )
}
