'use client'

import { createContext, useContext, ReactNode } from 'react'

export interface Branding {
  title: string
  subtitle: string
  logo: string  // data URL, empty if none
}

export const DEFAULT_BRANDING: Branding = {
  title: 'Takmao',
  subtitle: 'Rental Management',
  logo: '',
}

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING)

export function BrandingProvider({ branding, children }: { branding: Branding; children: ReactNode }) {
  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
}

export function useBranding(): Branding {
  return useContext(BrandingContext)
}
