'use client'

import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CARD_STYLES, type CardColor } from '@/lib/card-colors'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: CardColor
  trend?: { label: string; up: boolean }
  index?: number
  compact?: boolean
}

export function StatsCard({
  title, value, subtitle, icon: Icon, color, trend, index = 0, compact = false,
}: StatsCardProps) {
  const style = CARD_STYLES[color]

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
        className={cn(
          'flex items-center gap-3 rounded-2xl border shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 p-3.5',
          style.card,
        )}
      >
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm', style.icon)}>
          <Icon className={cn('w-4 h-4', style.value)} />
        </div>
        <div className="min-w-0">
          <p className={cn('text-xl font-bold tracking-tight leading-none tabular-nums', style.value)}>{value}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-tight">{title}</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.35, ease: 'easeOut' }}
      className={cn(
        'group flex flex-col rounded-2xl border shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 p-4 sm:p-5 overflow-hidden',
        style.card,
      )}
    >
      {/* Label + icon row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest leading-tight">
          {title}
        </p>
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm', style.icon)}>
          <Icon className={cn('w-4 h-4', style.value)} />
        </div>
      </div>

      {/* Main value */}
      <p className={cn('text-2xl sm:text-[1.75rem] font-bold tracking-tight leading-none tabular-nums mb-3', style.value)}>
        {value}
      </p>

      {/* Trend + subtitle */}
      <div className="mt-auto flex flex-col gap-1">
        {trend && (
          <span className={cn(
            'inline-flex items-center gap-0.5 text-xs font-semibold leading-none',
            trend.up ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400',
          )}>
            {trend.up
              ? <ArrowUpRight className="w-3.5 h-3.5" />
              : <ArrowDownRight className="w-3.5 h-3.5" />
            }
            {trend.label}
          </span>
        )}
        {subtitle && (
          <p className="text-xs text-muted-foreground leading-snug">{subtitle}</p>
        )}
      </div>
    </motion.div>
  )
}
