'use client'

import { X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/language-context'
import { cn, formatMonth } from '@/lib/utils'

interface MonthRangePickerProps {
  months: string[]
  from: string
  to: string
  onChange: (from: string, to: string) => void
  className?: string
}

const NONE = '__none__'

export function MonthRangePicker({ months, from, to, onChange, className }: MonthRangePickerProps) {
  const { t, language } = useLanguage()
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Select
        value={from || NONE}
        onValueChange={(v) => onChange(v === NONE ? '' : v, to)}
      >
        <SelectTrigger className="w-32 h-9 text-sm">
          <SelectValue placeholder={t('month_from')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('month_from')}</SelectItem>
          {months.map((m) => <SelectItem key={m} value={m}>{formatMonth(m, language)}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground select-none">—</span>
      <Select
        value={to || NONE}
        onValueChange={(v) => onChange(from, v === NONE ? '' : v)}
      >
        <SelectTrigger className="w-32 h-9 text-sm">
          <SelectValue placeholder={t('month_to')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('month_to')}</SelectItem>
          {months.map((m) => <SelectItem key={m} value={m}>{formatMonth(m, language)}</SelectItem>)}
        </SelectContent>
      </Select>
      {(from || to) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={() => onChange('', '')}
          aria-label={t('month_range_clear')}
          title={t('month_range_clear')}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  )
}

/**
 * Normalize a from/to pair into a stable [min, max] tuple, or null if either
 * end is missing. Lets callers treat the picker as "active when both ends set".
 */
export function monthRange(from: string, to: string): [string, string] | null {
  if (!from || !to) return null
  return from <= to ? [from, to] : [to, from]
}
