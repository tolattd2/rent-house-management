import type { Metadata } from 'next'
import { Inter, Noto_Sans_Khmer } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { LanguageProvider } from '@/contexts/language-context'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const khmer = Noto_Sans_Khmer({ subsets: ['khmer'], variable: '--font-khmer', weight: ['400', '500', '700'] })

export const metadata: Metadata = {
  title: 'Takmao Rental | Property Management',
  description: 'Modern apartment and rental management system for Cambodia',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${khmer.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <LanguageProvider>
            {children}
            <Toaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
