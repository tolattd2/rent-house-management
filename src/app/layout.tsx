import type { Metadata } from 'next'
import { Inter, Noto_Sans_Khmer } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { LanguageProvider } from '@/contexts/language-context'
import { BrandingProvider, DEFAULT_BRANDING, type Branding } from '@/contexts/branding-context'
import { getSettingsMap } from '@/lib/cached-queries'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const khmer = Noto_Sans_Khmer({ subsets: ['khmer'], variable: '--font-khmer', weight: ['400', '500', '700'] })

async function loadBranding(): Promise<Branding> {
  try {
    const settings = await getSettingsMap()
    return {
      title: settings.app_title?.trim() || DEFAULT_BRANDING.title,
      subtitle: settings.app_subtitle?.trim() || DEFAULT_BRANDING.subtitle,
      logo: settings.app_logo ?? '',
    }
  } catch {
    return DEFAULT_BRANDING
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { title, subtitle } = await loadBranding()
  return {
    title: `${title} | ${subtitle}`,
    description: 'Modern apartment and rental management system for Cambodia',
    icons: { icon: '/favicon.ico' },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await loadBranding()
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${khmer.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <BrandingProvider branding={branding}>
            <LanguageProvider>
              {children}
              <Toaster />
            </LanguageProvider>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
