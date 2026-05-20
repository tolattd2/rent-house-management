import { formatCurrency, formatMonth } from '@/lib/utils'

export type InvoiceCardData = {
  invoiceNumber: string
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
  paymentStatus: string
  tenant: { fullName: string; phone: string } | null
  room: { roomNumber: string; branch: string | null } | null
}

interface InvoiceCardProps {
  data: InvoiceCardData
  settings: Record<string, string>
  xRate: number
}

/**
 * One invoice in the shared design — a fixed 148.5×105mm card (a quarter of
 * landscape A4). Used directly in batch print, and scaled up for the
 * single-invoice page so both stay visually identical.
 */
export function InvoiceCard({ data, settings, xRate }: InvoiceCardProps) {
  const isPaid = data.paymentStatus === 'paid'
  const branchKey = data.room?.branch === 'Chamkadong' ? 'chamkadong' : 'takmoa'
  const companyName = settings[`company_${branchKey}_name`] || settings.company_name || 'Takmao Rental'
  const companyPhone = settings[`company_${branchKey}_phone`] || settings.company_phone || ''
  const companyAddress = settings[`company_${branchKey}_address`] || settings.company_address || 'Phnom Penh, Cambodia'

  const qrs = [1, 2]
    .map((slot) => ({
      src: settings[`qr_${branchKey}_${slot}`],
      label: settings[`qr_${branchKey}_label_${slot}`],
      slot,
    }))
    .filter((q) => q.src)

  return (
    <div
      style={{
        width: '148.5mm',
        height: '105mm',
        boxSizing: 'border-box',
        border: '0.5pt solid #cbd5e1',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
        fontSize: '10pt',
        color: '#0f172a',
        background: 'white',
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
          <div style={{ fontWeight: 700, fontSize: '12pt' }}>{companyName}</div>
          <div style={{ opacity: 0.8, fontSize: '9pt' }}>{companyAddress}</div>
          {companyPhone && <div style={{ opacity: 0.8, fontSize: '9pt' }}>{companyPhone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ opacity: 0.7, fontSize: '7.5pt', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Invoice</div>
          <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '11pt' }}>{data.invoiceNumber}</div>
          <div style={{ opacity: 0.8, fontSize: '9pt' }}>{formatMonth(data.billingMonth)}</div>
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
          <div style={{ fontWeight: 700, fontSize: '11.5pt' }}>{data.tenant?.fullName ?? '—'}</div>
          {data.tenant?.phone && <div style={{ color: '#64748b', fontSize: '9pt' }}>{data.tenant.phone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 600, fontSize: '10pt' }}>Room {data.room?.roomNumber ?? '—'}</div>
          <span style={{
            display: 'inline-block',
            padding: '0.5mm 2.5mm',
            borderRadius: '3pt',
            fontSize: '8pt',
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt' }}>
          <tbody>
            <tr>
              <td style={{ padding: '0.8mm 0', color: '#475569' }}>Monthly Rent</td>
              <td style={{ padding: '0.8mm 0', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(data.roomRentUsd)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.8mm 0', color: '#475569' }}>Water ({data.waterUsage} kib · {data.waterCostRiel.toLocaleString()} ៛)</td>
              <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>{formatCurrency(data.waterCostRiel / xRate)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.8mm 0', color: '#475569' }}>Electricity ({data.electricUsage} kw · {data.electricCostRiel.toLocaleString()} ៛)</td>
              <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>{formatCurrency(data.electricCostRiel / xRate)}</td>
            </tr>
            {data.outstandingDebtUsd > 0 && (
              <tr style={{ color: '#dc2626' }}>
                <td style={{ padding: '0.8mm 0' }}>Outstanding Debt</td>
                <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>{formatCurrency(data.outstandingDebtUsd)}</td>
              </tr>
            )}
            {data.latePenaltyUsd > 0 && (
              <tr style={{ color: '#ea580c' }}>
                <td style={{ padding: '0.8mm 0' }}>Late Penalty</td>
                <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>{formatCurrency(data.latePenaltyUsd)}</td>
              </tr>
            )}
            {data.discountUsd > 0 && (
              <tr style={{ color: '#16a34a' }}>
                <td style={{ padding: '0.8mm 0' }}>Discount</td>
                <td style={{ padding: '0.8mm 0', textAlign: 'right' }}>-{formatCurrency(data.discountUsd)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '0.5pt solid #cbd5e1' }}>
              <td style={{ paddingTop: '1.5mm', fontWeight: 700, fontSize: '11.5pt' }}>Total Due</td>
              <td style={{ paddingTop: '1.5mm', textAlign: 'right', fontWeight: 700, fontSize: '11.5pt', color: '#1d4ed8' }}>
                {formatCurrency(data.totalUsd)}
              </td>
            </tr>
            <tr>
              <td />
              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '11.5pt', color: '#1d4ed8' }}>
                {Math.round(data.totalRiel).toLocaleString()} ៛
              </td>
            </tr>
            <tr>
              <td />
              <td style={{ textAlign: 'right', color: '#94a3b8', fontSize: '8pt' }}>1 USD = {xRate.toLocaleString()} ៛</td>
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
        <div style={{ color: '#94a3b8', fontSize: '7.5pt', maxWidth: '60%' }}>
          Thank you for your business!<br />
          {companyName} · {companyPhone}
        </div>
        {qrs.length > 0 && (
          <div style={{ display: 'flex', gap: '3mm', alignItems: 'center' }}>
            {qrs.map(({ src, label, slot }) => (
              <div key={slot} style={{ textAlign: 'center' }}>
                <img src={src} alt={`QR ${slot}`} style={{ width: '18mm', height: '18mm', objectFit: 'contain', display: 'block' }} />
                {label && <div style={{ fontSize: '7pt', color: '#64748b', marginTop: '0.5mm' }}>{label}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
