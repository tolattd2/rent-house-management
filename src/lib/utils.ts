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

export function formatMonth(month: string): string {
  if (!month) return '—'
  const [year, m] = month.split('-')
  const date = new Date(parseInt(year), parseInt(m) - 1, 1)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
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

export function roomLabel(room: { roomNumber: string; branch?: string | null }): string {
  return room.branch === 'Chamkadong' ? `Rckd${room.roomNumber}` : room.roomNumber
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
