'use client'

import * as React from 'react'
import { format, parse, isValid } from 'date-fns'
import { km } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'
import { Button } from './button'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { cn } from '@/lib/utils'

const KHMER_MONTHS = [
  'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
  'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ',
]

/** Khmer display, e.g. `19 មេសា 2026`. */
function formatKhmer(d: Date): string {
  return `${d.getDate()} ${KHMER_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

type ChangeEventLike = { target: { name?: string; value: string; type: string } }

export type DateInputProps = {
  /** Controlled ISO date value `YYYY-MM-DD`. */
  value?: string
  /** Synthetic-event onChange so React Hook Form `Controller` and local state setters both work. */
  onChange?: (event: ChangeEventLike) => void
  onBlur?: React.FocusEventHandler<HTMLButtonElement>
  name?: string
  id?: string
  disabled?: boolean
  className?: string
  placeholder?: string
}

/**
 * Date input that opens a Khmer-localizable calendar popover. Replaces the
 * native `<input type="date">` so the displayed value AND popup both follow
 * the app's language (date-fns Khmer locale).
 *
 * API mirrors a controlled native input so callers using
 * `value={...} onChange={(e) => ...}` keep working; React Hook Form callers
 * should bridge via `<Controller>`.
 */
const DateInput = React.forwardRef<HTMLButtonElement, DateInputProps>(
  ({ value = '', onChange, onBlur, name, id, disabled, className, placeholder }, ref) => {
    const { language } = useLanguage()
    const [open, setOpen] = React.useState(false)

    const parsed = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
    const date = parsed && isValid(parsed) ? parsed : undefined

    const display = date
      ? language === 'kh'
        ? formatKhmer(date)
        : format(date, 'PPP')
      : placeholder ?? (language === 'kh' ? 'ជ្រើសរើសកាលបរិច្ឆេទ' : 'Pick a date')

    const handleSelect = (d: Date | undefined) => {
      const next = d ? format(d, 'yyyy-MM-dd') : ''
      onChange?.({ target: { name, value: next, type: 'text' } })
      setOpen(false)
    }

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            onBlur={onBlur}
            className={cn(
              'w-full justify-start text-left font-normal h-10',
              !value && 'text-muted-foreground',
              className,
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{display}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleSelect}
            defaultMonth={date}
            locale={language === 'kh' ? km : undefined}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    )
  },
)
DateInput.displayName = 'DateInput'

export { DateInput }
