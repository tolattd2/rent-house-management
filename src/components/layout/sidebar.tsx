'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, DoorOpen, FileText, Receipt,
  BarChart3, Bell, Settings, ChevronLeft, Building2, LogOut, Wrench, TrendingDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { signOut } from 'next-auth/react'
import { useSession } from 'next-auth/react'
import { useLanguage } from '@/contexts/language-context'
import { TranslationKey } from '@/lib/translations'

interface NavItem {
  href: string
  labelKey: TranslationKey
  icon: React.ElementType
  badge?: number
  roles?: string[]
}

const navItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard },
  { href: '/tenants', labelKey: 'nav_tenants', icon: Users },
  { href: '/rooms', labelKey: 'nav_rooms', icon: DoorOpen },
  { href: '/billing', labelKey: 'nav_billing', icon: FileText },
  { href: '/invoices', labelKey: 'nav_invoices', icon: Receipt },
  { href: '/maintenance', labelKey: 'nav_maintenance', icon: Wrench },
  { href: '/expenses', labelKey: 'nav_expenses', icon: TrendingDown },
  { href: '/reports', labelKey: 'nav_reports', icon: BarChart3 },
  { href: '/notifications', labelKey: 'nav_notifications', icon: Bell },
  { href: '/settings', labelKey: 'nav_settings', icon: Settings, roles: ['admin'] },
]

interface SidebarProps {
  collapsed: boolean
  onCollapse: (v: boolean) => void
}

export function Sidebar({ collapsed, onCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { t } = useLanguage()

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
      className="relative flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
            <Building2 className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <p className="font-bold text-sm text-sidebar-foreground truncate">Takmao</p>
                <p className="text-xs text-sidebar-foreground/60 truncate">Rental Management</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto scrollbar-thin">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            if (item.roles && !item.roles.includes(session?.user?.role ?? '')) return null
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                      : 'text-sidebar-foreground/70'
                  )}
                >
                  <item.icon className="w-4.5 h-4.5 flex-shrink-0 w-[18px] h-[18px]" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="truncate"
                      >
                        {t(item.labelKey)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {item.badge && !collapsed && (
                    <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User + Logout */}
      <div className="p-2 border-t border-sidebar-border flex-shrink-0">
        {!collapsed && session?.user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{session.user.name}</p>
            <p className="text-xs text-sidebar-foreground/50 capitalize">{session.user.role}</p>
          </div>
        )}
        <button
          onClick={async () => { await signOut({ redirect: false }); window.location.href = '/login' }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {t('nav_signout')}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => onCollapse(!collapsed)}
        className="absolute -right-3 top-[72px] z-10 w-6 h-6 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors"
      >
        <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
        </motion.div>
      </button>
    </motion.aside>
  )
}
