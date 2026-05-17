'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLanguage } from '@/contexts/language-context'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar
} from 'recharts'

interface RevenueChartProps {
  data: { month: string; label: string; revenue: number; expenses?: number }[]
}

export function RevenueChart({ data }: RevenueChartProps) {
  const { t } = useLanguage()
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('reports_chart_title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expensesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              formatter={(val, name) => [`$${Number(val).toFixed(2)}`, name === 'revenue' ? t('reports_revenue_collected') : t('dashboard_monthly_expenses')]}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
            />
            <Area type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2.5} fill="url(#revenueGrad)" dot={{ fill: '#22c55e', r: 3 }} activeDot={{ r: 5 }} />
            <Area type="monotone" dataKey="expenses" stroke="#f97316" strokeWidth={2} fill="url(#expensesGrad)" dot={{ fill: '#f97316', r: 3 }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

interface OccupancyChartProps {
  occupied: number
  vacant: number
  maintenance: number
}

export function OccupancyChart({ occupied, vacant, maintenance }: OccupancyChartProps) {
  const { t } = useLanguage()
  const data = [
    { name: 'Occupied', value: occupied, fill: '#22c55e' },
    { name: 'Vacant', value: vacant, fill: '#94a3b8' },
    { name: 'Maintenance', value: maintenance, fill: '#f59e0b' },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('room_status')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              formatter={(value) => [value, 'Rooms']}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((entry, index) => (
                <rect key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
