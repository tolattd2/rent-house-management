'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo' | 'orange'
  trend?: { value: number; label: string }
  index?: number
}

const colorMap = {
  blue: { bg: 'bg-blue-500/10', icon: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-900' },
  green: { bg: 'bg-green-500/10', icon: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-900' },
  yellow: { bg: 'bg-yellow-500/10', icon: 'text-yellow-600 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-900' },
  red: { bg: 'bg-red-500/10', icon: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-900' },
  purple: { bg: 'bg-purple-500/10', icon: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-900' },
  indigo: { bg: 'bg-indigo-500/10', icon: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-900' },
  orange: { bg: 'bg-orange-500/10', icon: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-900' },
}

export function StatsCard({ title, value, subtitle, icon: Icon, color, trend, index = 0 }: StatsCardProps) {
  const colors = colorMap[color]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
    >
      <Card className={cn('border', colors.border, 'hover:shadow-md transition-shadow')}>
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground font-medium leading-tight">{title}</p>
              <p className="text-lg sm:text-2xl font-bold mt-1 text-foreground truncate">{value}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{subtitle}</p>
              )}
              {trend && (
                <div className={cn('flex items-center gap-1 mt-2 text-xs font-medium',
                  trend.value >= 0 ? 'text-green-600' : 'text-red-600')}>
                  {trend.value >= 0
                    ? <TrendingUp className="w-3 h-3" />
                    : <TrendingDown className="w-3 h-3" />
                  }
                  <span>{Math.abs(trend.value)}% {trend.label}</span>
                </div>
              )}
            </div>
            <div className={cn('w-8 h-8 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ml-2 sm:ml-3', colors.bg)}>
              <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', colors.icon)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
