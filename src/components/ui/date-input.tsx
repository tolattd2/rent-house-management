'use client'

import * as React from 'react'
import { Input, type InputProps } from './input'
import { useLanguage } from '@/contexts/language-context'

/**
 * <input type="date"> with the BCP-47 `lang` attribute pinned to the app's
 * current language so the native calendar popup renders month/day names in
 * Khmer when language=kh. Chrome reads the input's own lang attribute (not
 * always the inherited document lang), so setting it here is the reliable
 * place.
 */
const DateInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  (props, ref) => {
    const { language } = useLanguage()
    const lang = language === 'kh' ? 'km' : 'en'
    return <Input type="date" ref={ref} lang={lang} {...props} />
  },
)
DateInput.displayName = 'DateInput'

export { DateInput }
