'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { translations, Language, TranslationKey } from '@/lib/translations'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
})

// Native date/time pickers and other browser UI read the document `lang`
// attribute (BCP-47). Khmer is `km`, not our internal `kh` slug.
const BCP47: Record<Language, string> = { en: 'en', kh: 'km' }

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    const stored = localStorage.getItem('lang') as Language | null
    if (stored === 'en' || stored === 'kh') setLanguageState(stored)
  }, [])

  useEffect(() => {
    document.documentElement.lang = BCP47[language]
  }, [language])

  function setLanguage(lang: Language) {
    setLanguageState(lang)
    localStorage.setItem('lang', lang)
  }

  function t(key: TranslationKey): string {
    return translations[language][key] ?? translations.en[key] ?? key
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
