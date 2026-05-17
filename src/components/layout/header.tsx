'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Sun, Moon, Menu } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSession } from 'next-auth/react'
import { debounce } from '@/lib/utils'
import { useLanguage } from '@/contexts/language-context'

interface HeaderProps {
  onMenuClick?: () => void
  title?: string
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const { data: session } = useSession()
  const { language, setLanguage, t } = useLanguage()
  const [query, setQuery] = useState('')
  const router = useRouter()

  const handleSearch = debounce((q: string) => {
    if (q.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(q)}`)
    }
  }, 400)

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-6 gap-4 flex-shrink-0 print:hidden">
      {/* Mobile menu button */}
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="w-5 h-5" />
      </Button>

      {title && (
        <h1 className="text-lg font-semibold text-foreground hidden sm:block">{title}</h1>
      )}

      {/* Search */}
      <div className="flex-1 max-w-md relative hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t('header_search')}
          className="pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            handleSearch(e.target.value)
          }}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Language toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLanguage(language === 'en' ? 'kh' : 'en')}
          className="h-9 px-3 text-xs font-medium gap-1.5"
        >
          {language === 'en' ? (
            <><span className="text-base leading-none">🇰🇭</span> ខ្មែរ</>
          ) : (
            <><span className="text-base leading-none">🇺🇸</span> English</>
          )}
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-9 w-9"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">
              {session?.user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{session?.user?.role}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
