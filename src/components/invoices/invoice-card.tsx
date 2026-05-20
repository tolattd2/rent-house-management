import { formatCurrency, formatPhones } from '@/lib/utils'

/**
 * Same font stack the app uses (see tailwind.config.ts `font-sans`): Inter for
 * Latin, with Noto Sans Khmer as the per-glyph fallback for Khmer text. Set
 * explicitly here so printed invoices use the exact Khmer font as the rest of
 * the app instead of the browser/printer default.
 */
const FONT_STACK = 'var(--font-inter), var(--font-khmer), Hanuman, system-ui, sans-serif'

/** Khmer month names — billingMonth comes in as "YYYY-MM". */
const KHMER_MONTHS = [
  'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
  'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ',
]

function formatMonthKh(month: string): string {
  if (!month) return '—'
  const [year, m] = month.split('-')
  const idx = parseInt(m, 10) - 1
  return KHMER_MONTHS[idx] ? `${KHMER_MONTHS[idx]} ${year}` : month
}

export type InvoiceCardData = {
  invoiceNumber: string
  billingMonth: string
  roomRentUsd: number
  prevWaterReading: number
  currWaterReading: number
  waterUsage: number
  waterCostRiel: number
  prevElectricReading: number
  currElectricReading: number
  electricUsage: number
  electricCostRiel: number
  outstandingDebtUsd: number
  lateDays: number
  latePenaltyUsd: number
  discountUsd: number
  totalUsd: number
  totalRiel: number
  paymentStatus: string
  tenant: { fullName: string; phone: string; phonesExtra: string[] } | null
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
 * single-invoice page so both stay visually identical. Labels are in Khmer.
 */
export function InvoiceCard({ data, settings, xRate }: InvoiceCardProps) {
  const isPaid = data.paymentStatus === 'paid'
  const tenantPhones = data.tenant ? formatPhones(data.tenant.phone, data.tenant.phonesExtra) : ''
  const latePenaltyRate = parseFloat(settings.late_penalty_usd ?? '1')
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
        fontFamily: FONT_STACK,
        fontSize: '8pt',
        lineHeight: 1.45,
        color: '#0f172a',
        background: 'white',
      }}
    >
      {/* Blue header */}
      <div style={{
        background: 'linear-gradient(to right, #2563eb, #1e40af)',
        color: 'white',
        padding: '2mm 4mm',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '10pt' }}>{companyName}</div>
          <div style={{ opacity: 0.8, fontSize: '7pt' }}>{companyAddress}</div>
          {companyPhone && <div style={{ opacity: 0.8, fontSize: '7pt' }}>{companyPhone}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ opacity: 0.7, fontSize: '6.5pt' }}>វិក្កយបត្រ</div>
          <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '9pt' }}>{data.invoiceNumber}</div>
          <div style={{ opacity: 0.8, fontSize: '7pt' }}>{formatMonthKh(data.billingMonth)}</div>
        </div>
      </div>

      {/* Tenant / Room row */}
      <div style={{
        padding: '1.5mm 4mm',
        background: '#f8fafc',
        borderBottom: '0.5pt solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '9.5pt' }}>{data.tenant?.fullName ?? '—'}</div>
          {tenantPhones && <div style={{ color: '#64748b', fontSize: '7pt' }}>{tenantPhones}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 600, fontSize: '8pt' }}>បន្ទប់ {data.room?.roomNumber ?? '—'}</div>
          <span style={{
            display: 'inline-block',
            padding: '0.5mm 2.5mm',
            borderRadius: '3pt',
            fontSize: '6.5pt',
            fontWeight: 700,
            background: isPaid ? '#dcfce7' : '#fee2e2',
            color: isPaid ? '#15803d' : '#dc2626',
          }}>
            {isPaid ? 'បានបង់ប្រាក់' : 'មិនទាន់បង់ប្រាក់'}
          </span>
        </div>
      </div>

      {/* Line items */}
      <div style={{ padding: '2mm 4mm', flex: 1, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
          <tbody>
            <tr>
              <td style={{ padding: '0.5mm 0', color: '#475569' }}>ថ្លៃជួលប្រចាំខែ</td>
              <td style={{ padding: '0.5mm 0', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(data.roomRentUsd)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5mm 0', color: '#475569' }}>
                ថ្លៃទឹក ({data.waterUsage} គីប · {data.waterCostRiel.toLocaleString()} ៛)
                <div style={{ fontSize: '6pt', color: '#94a3b8' }}>កុងទ័រ៖ {data.prevWaterReading} → {data.currWaterReading}</div>
              </td>
              <td style={{ padding: '0.5mm 0', textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(data.waterCostRiel / xRate)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.5mm 0', color: '#475569' }}>
                ថ្លៃអគ្គិសនី ({data.electricUsage} គីឡូវ៉ាត់ · {data.electricCostRiel.toLocaleString()} ៛)
                <div style={{ fontSize: '6pt', color: '#94a3b8' }}>កុងទ័រ៖ {data.prevElectricReading} → {data.currElectricReading}</div>
              </td>
              <td style={{ padding: '0.5mm 0', textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(data.electricCostRiel / xRate)}</td>
            </tr>
            <tr style={{ color: data.outstandingDebtUsd > 0 ? '#dc2626' : '#475569' }}>
              <td style={{ padding: '0.5mm 0' }}>ប្រាក់ជំពាក់ពីមុន</td>
              <td style={{ padding: '0.5mm 0', textAlign: 'right' }}>{formatCurrency(data.outstandingDebtUsd)}</td>
            </tr>
            <tr style={{ color: data.latePenaltyUsd > 0 ? '#ea580c' : '#475569' }}>
              <td style={{ padding: '0.5mm 0' }}>
                ប្រាក់ពិន័យបង់យឺត
                <div style={{ fontSize: '6pt', color: data.latePenaltyUsd > 0 ? '#fb923c' : '#94a3b8' }}>យឺត {data.lateDays} ថ្ងៃ × {formatCurrency(latePenaltyRate)}/ថ្ងៃ</div>
              </td>
              <td style={{ padding: '0.5mm 0', textAlign: 'right', verticalAlign: 'top' }}>{formatCurrency(data.latePenaltyUsd)}</td>
            </tr>
            <tr style={{ color: data.discountUsd > 0 ? '#16a34a' : '#475569' }}>
              <td style={{ padding: '0.5mm 0' }}>ការបញ្ចុះតម្លៃ</td>
              <td style={{ padding: '0.5mm 0', textAlign: 'right' }}>{data.discountUsd > 0 ? '-' : ''}{formatCurrency(data.discountUsd)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '0.5pt solid #cbd5e1' }}>
              <td style={{ paddingTop: '1.2mm', fontWeight: 700, fontSize: '9pt' }}>សរុបត្រូវបង់</td>
              <td style={{ paddingTop: '1.2mm', textAlign: 'right', fontWeight: 700, fontSize: '9pt', color: '#1d4ed8' }}>
                {formatCurrency(data.totalUsd)}
              </td>
            </tr>
            <tr>
              <td />
              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '9pt', color: '#1d4ed8' }}>
                {Math.round(data.totalRiel).toLocaleString()} ៛
              </td>
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
        <div style={{ color: '#94a3b8', fontSize: '6pt', maxWidth: '60%' }}>
          សូមអរគុណចំពោះការទុកចិត្ត!<br />
          {companyName} · {companyPhone}
        </div>
        {qrs.length > 0 && (
          <div style={{ display: 'flex', gap: '3mm', alignItems: 'center' }}>
            {qrs.map(({ src, label, slot }) => (
              <div key={slot} style={{ textAlign: 'center' }}>
                <img src={src} alt={`QR ${slot}`} style={{ width: '14mm', height: '14mm', objectFit: 'contain', display: 'block' }} />
                {label && <div style={{ fontSize: '5.5pt', color: '#64748b', marginTop: '0.5mm' }}>{label}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
