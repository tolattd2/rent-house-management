'use client'

import { useEffect } from 'react'
import { formatCurrency, formatMonth } from '@/lib/utils'

type BillingItem = {
  id: string
  billingMonth: string
  roomRentUsd: number
  waterUsage: number
  waterCostRiel: number
  electricUsage: number
  electricCostRiel: number
  outstandingDebtUsd: number
  latePenaltyUsd: number
  discountUsd: number
  totalUsd: number
  totalRiel: number
  exchangeRate: number
  paymentStatus: string
  invoiceNumber: string
  tenant: { fullName: string; phone: string } | null
  room: { roomNumber: string; branch: string | null } | null
  payments: Array<{ amountUsd: number }>
}

interface Props {
  billings: BillingItem[]
  settings: Record<string, string>
  month: string
  branch: string
}

export function BatchPrintClient({ billings, settings, month, branch }: Props) {
  const xRate = parseFloat(settings.exchange_rate ?? '4100')
  const companyName = settings.company_name || 'Takmao Rental'
  const companyPhone = settings.company_phone || ''
  const companyAddress = settings.company_address || 'Phnom Penh, Cambodia'

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

      {/* Invoice pages */}
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
          {page.map((b) => {
            const totalPaid = b.payments.reduce((s, p) => s + p.amountUsd, 0)
            const isPaid = b.paymentStatus === 'paid'

            return (
              <div
                key={b.id}
                style={{
                  width: '148.5mm',
                  height: '105mm',
                  border: '0.5pt solid #cbd5e1',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  fontFamily: 'sans-serif',
                  fontSize: '7.5pt',
                  color: '#0f172a',
                }}
              >
                {/* Blue header */}
                <div style={{
                  background: 'linear-gradient(to right, #2563eb, #1e40af)',
                  color: 'white',
                  padding: '2.5mm 4mm',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexShrink: 0,
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '9pt' }}>{companyName}</div>
                    <div style={{ opacity: 0.8, fontSize: '6.5pt' }}>{companyAddress}</div>
                    {companyPhone && <div style={{ opacity: 0.8, fontSize: '6.5pt' }}>{companyPhone}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ opacity: 0.7, fontSize: '5.5pt', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Invoice</div>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '8pt' }}>{b.invoiceNumber}</div>
                    <div style={{ opacity: 0.8, fontSize: '6.5pt' }}>{formatMonth(b.billingMonth)}</div>
                  </div>
                </div>

                {/* Tenant / Room row */}
                <div style={{
                  padding: '2mm 4mm',
                  background: '#f8fafc',
                  borderBottom: '0.5pt solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexShrink: 0,
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '8.5pt' }}>{b.tenant?.fullName ?? '—'}</div>
                    {b.tenant?.phone && <div style={{ color: '#64748b', fontSize: '6.5pt' }}>{b.tenant.phone}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, fontSize: '7.5pt' }}>Room {b.room?.roomNumber ?? '—'}</div>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.5mm 2.5mm',
                      borderRadius: '3pt',
                      fontSize: '6pt',
                      fontWeight: 700,
                      background: isPaid ? '#dcfce7' : '#fee2e2',
                      color: isPaid ? '#15803d' : '#dc2626',
                    }}>
                      {isPaid ? 'PAID' : 'UNPAID'}
                    </span>
                  </div>
                </div>

                {/* Line items */}
                <div style={{ padding: '2mm 4mm', flex: 1, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7pt' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '0.8mm 0', color: '#475569' }}>Monthly Rent</td>
                        <td style={{ padding: '0.8mm 0', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(b.roomRentUsd)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.8mm 0', color: '#475569' }}>Water ({b.waterUsage} kib · {b.waterCostRiel.toLocaleString()} ៛)</td>
                        <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>{formatCurrency(b.waterCostRiel / xRate)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.8mm 0', color: '#475569' }}>Electricity ({b.electricUsage} kw · {b.electricCostRiel.toLocaleString()} ៛)</td>
                        <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>{formatCurrency(b.electricCostRiel / xRate)}</td>
                      </tr>
                      {b.outstandingDebtUsd > 0 && (
                        <tr style={{ color: '#dc2626' }}>
                          <td style={{ padding: '0.8mm 0' }}>Outstanding Debt</td>
                          <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>{formatCurrency(b.outstandingDebtUsd)}</td>
                        </tr>
                      )}
                      {b.latePenaltyUsd > 0 && (
                        <tr style={{ color: '#ea580c' }}>
                          <td style={{ padding: '0.8mm 0' }}>Late Penalty</td>
                          <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>{formatCurrency(b.latePenaltyUsd)}</td>
                        </tr>
                      )}
                      {b.discountUsd > 0 && (
                        <tr style={{ color: '#16a34a' }}>
                          <td style={{ padding: '0.8mm 0' }}>Discount</td>
                          <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>-{formatCurrency(b.discountUsd)}</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '0.5pt solid #cbd5e1' }}>
                        <td style={{ paddingTop: '1.5mm', fontWeight: 700, fontSize: '8.5pt' }}>Total Due</td>
                        <td style={{ paddingTop: '1.5mm', textAlign: 'right', fontWeight: 700, fontSize: '8.5pt', color: '#1d4ed8' }}>
                          {formatCurrency(b.totalUsd)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ color: '#94a3b8', fontSize: '6pt' }}>{Math.round(b.totalRiel).toLocaleString()} ៛</td>
                        <td style={{ textAlign: 'right', color: '#94a3b8', fontSize: '6pt' }}>1 USD = {xRate.toLocaleString()} ៛</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Footer / QR */}
                <div style={{
                  padding: '1.5mm 4mm',
                  borderTop: '0.5pt solid #e2e8f0',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0,
                }}>
                  <div style={{ color: '#94a3b8', fontSize: '5.5pt', maxWidth: '60%' }}>
                    Thank you for your business!<br />
                    {companyName} · {companyPhone}
                  </div>
                  {(() => {
                    const branchKey = b.room?.branch === 'Chamkadong' ? 'chamkadong' : 'takmoa'
                    const qrs = [1, 2].map((slot) => ({
                      src: settings[`qr_${branchKey}_${slot}`],
                      label: settings[`qr_${branchKey}_label_${slot}`],
                      slot,
                    })).filter((q) => q.src)
                    if (qrs.length === 0) return null
                    return (
                      <div style={{ display: 'flex', gap: '3mm', alignItems: 'center' }}>
                        {qrs.map(({ src, label, slot }) => (
                          <div key={slot} style={{ textAlign: 'center' }}>
                            <img src={src} alt={`QR ${slot}`} style={{ width: '13mm', height: '13mm', objectFit: 'contain', display: 'block' }} />
                            {label && <div style={{ fontSize: '5pt', color: '#64748b', marginTop: '0.5mm' }}>{label}</div>}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )
          })}

          {/* Empty slots to fill the 2×2 grid */}
          {Array.from({ length: 4 - page.length }).map((_, i) => (
            <div key={`empty-${i}`} style={{ width: '148.5mm', height: '105mm', border: '0.5pt solid #f1f5f9' }} />
          ))}
        </div>
      ))}
    </>
  )
}
