'use client'

import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'indigo' | 'orange'
  trend?: { label: string; up: boolean }
  index?: number
  compact?: boolean
}

const colorConfig = {
  blue:   { iconBg: 'bg-blue-50   dark:bg-blue-950/50',   iconColor: 'text-blue-600   dark:text-blue-400',   dot: 'bg-blue-500'   },
  green:  { iconBg: 'bg-green-50  dark:bg-green-950/50',  iconColor: 'text-green-600  dark:text-green-400',  dot: 'bg-green-500'  },
  yellow: { iconBg: 'bg-yellow-50 dark:bg-yellow-950/50', iconColor: 'text-yellow-600 dark:text-yellow-500', dot: 'bg-yellow-500' },
  red:    { iconBg: 'bg-red-50    dark:bg-red-950/50',    iconColor: 'text-red-600    dark:text-red-400',    dot: 'bg-red-500'    },
  purple: { iconBg: 'bg-purple-50 dark:bg-purple-950/50', iconColor: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
  indigo: { iconBg: 'bg-indigo-50 dark:bg-indigo-950/50', iconColor: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500' },
  orange: { iconBg: 'bg-orange-50 dark:bg-orange-950/50', iconColor: 'text-orange-600 dark:text-orange-500', dot: 'bg-orange-500' },
}

export function StatsCard({
  title, value, subtitle, icon: Icon, color, trend, index = 0, compact = false,
}: StatsCardProps) {
  const { iconBg, iconColor, dot } = colorConfig[color]

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
        className="flex items-center gap-3 rounded-xl bg-card shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 p-3.5"
      >
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold tracking-tight text-foreground leading-none tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{title}</p>
        </div>
        <div className={cn('w-1.5 h-1.5 rounded-full ml-auto flex-shrink-0', dot)} />
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.35, ease: 'easeOut' }}
      className="group flex flex-col rounded-2xl bg-card shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 p-4 sm:p-5 overflow-hidden"
    >
      {/* Label + icon row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest leading-tight">
          {title}
        </p>
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
      </div>

      {/* Main value */}
      <p className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-foreground leading-none tabular-nums mb-3">
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
