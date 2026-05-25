'use client'

import { Sun, Moon, Menu } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSession } from 'next-auth/react'
import { useLanguage } from '@/contexts/language-context'

interface HeaderProps {
  onMenuClick?: () => void
  title?: string
}

export function Header({ onMenuClick, title }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const { data: session } = useSession()
  const { language, setLanguage } = useLanguage()
  const router = useRouter()
  const isAdmin = session?.user?.role === 'admin'

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-3 sm:px-6 gap-2 sm:gap-4 flex-shrink-0 print:hidden">
      {/* Mobile menu button */}
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="w-5 h-5" />
      </Button>

      {title && (
        <h1 className="text-lg font-semibold text-foreground hidden sm:block">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-2">
        {/* Language toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLanguage(language === 'en' ? 'kh' : 'en')}
          className="h-10 px-2 sm:px-3 text-xs font-medium gap-1"
        >
          {language === 'en' ? (
            <><span className="text-base leading-none">🇰🇭</span><span className="hidden sm:inline"> ខ្មែរ</span></>
          ) : (
            <><span className="text-base leading-none">🇺🇸</span><span className="hidden sm:inline"> EN</span></>
          )}
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-10 w-10"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User chip — admins can click to jump straight to Settings → Users. */}
        {isAdmin ? (
          <button
            type="button"
            onClick={() => router.push('/settings?tab=users')}
            title="User Management"
            className="flex items-center gap-2 pl-2 pr-2 py-1 -my-1 border-l border-border rounded-r-md hover:bg-muted/60 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">
                {session?.user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{session?.user?.role}</p>
            </div>
          </button>
        ) : (
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
        )}
      </div>
    </header>
  )
}
