'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { km } from 'date-fns/locale'
import 'react-day-picker/style.css'
import { useLanguage } from '@/contexts/language-context'
import { cn } from '@/lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/**
 * Date-fns Khmer locale lacks short weekday abbreviations that fit a calendar
 * header, so we override them with the standard Cambodian two-letter forms.
 */
const KHMER_WEEKDAY_SHORT = ['អា', 'ច', 'អ', 'ព', 'ព្រ', 'សុ', 'ស']

function Calendar({ className, classNames, locale, ...props }: CalendarProps) {
  const { language } = useLanguage()
  const effectiveLocale = locale ?? (language === 'kh' ? km : undefined)

  const formatters = language === 'kh'
    ? { formatWeekdayName: (date: Date) => KHMER_WEEKDAY_SHORT[date.getDay()] }
    : undefined

  return (
    <DayPicker
      locale={effectiveLocale}
      formatters={formatters}
      showOutsideDays
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-3',
        month_caption: 'flex items-center justify-center pt-1 relative text-sm font-medium',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1 absolute right-1 top-1',
        button_previous: 'inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-transparent p-0 opacity-70 hover:opacity-100',
        button_next: 'inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-transparent p-0 opacity-70 hover:opacity-100',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        week: 'flex w-full mt-1',
        day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day_button: 'h-9 w-9 rounded-md p-0 font-normal hover:bg-accent hover:text-accent-foreground aria-selected:opacity-100',
        range_end: 'day-range-end',
        selected: '!bg-primary !text-primary-foreground hover:!bg-primary hover:!text-primary-foreground focus:!bg-primary focus:!text-primary-foreground',
        today: 'bg-accent text-accent-foreground',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...iconProps }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" {...iconProps} />
          ) : (
            <ChevronRight className="h-4 w-4" {...iconProps} />
          ),
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
