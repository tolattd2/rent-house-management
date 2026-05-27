import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: 'USD' | 'KHR' = 'USD'): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }
  return new Intl.NumberFormat('km-KH', {
    style: 'currency',
    currency: 'KHR',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// Khmer month names — there's no widely-used 3-letter abbreviation form, so
// the short formatter below uses the same names with a 2-digit year suffix.
const KHMER_MONTHS = [
  'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
  'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ',
] as const

export type FormatLang = 'en' | 'kh'

export function formatMonth(month: string, lang: FormatLang = 'en'): string {
  if (!month) return '—'
  const [year, m] = month.split('-')
  const idx = parseInt(m) - 1
  if (lang === 'kh') return `${KHMER_MONTHS[idx]} ${year}`
  const date = new Date(parseInt(year), idx, 1)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

/** Chart-axis-friendly short form, e.g. "Jan 24" / "មករា 24". */
export function formatMonthShort(month: string, lang: FormatLang = 'en'): string {
  if (!month) return '—'
  const [year, m] = month.split('-')
  const idx = parseInt(m) - 1
  const yy = year.slice(-2)
  if (lang === 'kh') return `${KHMER_MONTHS[idx]} ${yy}`
  const date = new Date(parseInt(year), idx, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export function prevMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(year, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function nextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const d = new Date(year, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'occupied':
    case 'active':
    case 'paid':
      return 'green'
    case 'vacant':
    case 'inactive':
      return 'gray'
    case 'maintenance':
      return 'yellow'
    case 'unpaid':
      return 'red'
    case 'partial':
      return 'orange'
    default:
      return 'gray'
  }
}

export function generateInvoiceNumber(sequence: number): string {
  const year = new Date().getFullYear()
  return `INV-${year}-${String(sequence).padStart(4, '0')}`
}

export function exportToCSV(headers: string[], rows: (string | number)[][], filename: string) {
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function debounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .trim()
}

export function khrToUsd(riel: number, rate: number): number {
  return rate > 0 ? riel / rate : 0
}

export function usdToKhr(usd: number, rate: number): number {
  return usd * rate
}

export function formatCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

/** Join a tenant's primary phone and any extra numbers into one display string. */
export function formatPhones(phone: string | null | undefined, phonesExtra?: string[] | null): string {
  return [phone ?? '', ...(phonesExtra ?? [])]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' / ')
}

/** Normalise a pasted Google Maps link into a safe href (adds https:// if missing). */
export function mapHref(link: string | null | undefined): string {
  const trimmed = (link ?? '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function sortRoomsByNumber<T extends { roomNumber: string }>(rooms: T[]): T[] {
  const isSpecial = (n: string) => {
    const d = n.replace(/\D/g, '')
    return d.length > 0 && new Set(d.split('')).size === 1
  }
  return [...rooms].sort((a, b) => {
    const aSpec = isSpecial(a.roomNumber)
    const bSpec = isSpecial(b.roomNumber)
    if (aSpec !== bSpec) return aSpec ? -1 : 1
    const numA = parseInt(a.roomNumber.replace(/\D/g, ''), 10) || 0
    const numB = parseInt(b.roomNumber.replace(/\D/g, ''), 10) || 0
    return numA - numB
  })
}

/**
 * Group tenant-bearing records by their branch and sort each group's rows
 * by room number ascending. Used by every tenant-information list (tenants,
 * billing, invoices, notifications, notices) so the same branch always lines
 * up the same way and rooms inside it count up — easier to scan and track.
 */
export function groupByBranch<T extends { roomNumber: string; branch: string | null | undefined }>(
  items: T[],
  unassignedLabel = '—',
): Array<{ branch: string; items: T[] }> {
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const key = (item.branch ?? '').trim() || unassignedLabel
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }
  const groups = Array.from(buckets.entries()).map(([branch, rows]) => ({
    branch,
    items: sortRoomsByNumber(rows),
  }))
  groups.sort((a, b) => {
    if (a.branch === unassignedLabel) return 1
    if (b.branch === unassignedLabel) return -1
    return a.branch.localeCompare(b.branch)
  })
  return groups
}
