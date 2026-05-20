'use client'

import { useEffect } from 'react'
import { InvoiceCard, type InvoiceCardData } from '@/components/invoices/invoice-card'

type BillingItem = InvoiceCardData & {
  id: string
  exchangeRate: number
}

interface Props {
  billings: BillingItem[]
  settings: Record<string, string>
  month: string
  branch: string
}

export function BatchPrintClient({ billings, settings, month, branch }: Props) {
  const xRate = parseFloat(settings.exchange_rate ?? '4100')

  // Group into pages of 4
  const pages: BillingItem[][] = []
  for (let i = 0; i < billings.length; i += 4) {
    pages.push(billings.slice(i, i + 4))
  }

  useEffect(() => {
    if (billings.length > 0) {
      const t = setTimeout(() => window.print(), 800)
      return () => clearTimeout(t)
    }
  }, [billings.length])

  if (billings.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif', color: '#475569' }}>
        <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>No invoices found</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
          No billing records for {month}{branch !== 'all' ? ` — ${branch}` : ''}.
        </p>
        <button onClick={() => window.close()} style={{ marginTop: '1rem', padding: '0.5rem 1rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', cursor: 'pointer' }}>
          Close
        </button>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: white; color: #0f172a; }
        @media print {
          .no-print { display: none !important; }
          .print-page { page-break-after: always; break-after: page; }
          .print-page:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#1e293b', color: 'white',
        display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.5rem',
        fontFamily: 'sans-serif', fontSize: '0.875rem',
      }}>
        <span style={{ flex: 1 }}>
          <strong>{billings.length}</strong> invoices · {month}{branch !== 'all' ? ` · ${branch}` : ''} · {pages.length} page{pages.length > 1 ? 's' : ''}
        </span>
        <button
          onClick={() => window.print()}
          style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: 600 }}
        >
          Print / Save PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: '0.375rem', padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Close
        </button>
      </div>

      {/* Spacer for fixed toolbar on screen */}
      <div className="no-print" style={{ height: '52px' }} />

      {/* Invoice pages — 2×2 grid of shared invoice cards */}
      {pages.map((page, pageIdx) => (
        <div
          key={pageIdx}
          className="print-page"
          style={{
            width: '297mm',
            height: '210mm',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
          }}
        >
          {page.map((b) => (
            <InvoiceCard key={b.id} data={b} settings={settings} xRate={xRate} />
          ))}

          {/* Empty slots to fill the 2×2 grid */}
          {Array.from({ length: 4 - page.length }).map((_, i) => (
            <div key={`empty-${i}`} style={{ width: '148.5mm', height: '105mm', border: '0.5pt solid #f1f5f9' }} />
          ))}
        </div>
      ))}
    </>
  )
}
