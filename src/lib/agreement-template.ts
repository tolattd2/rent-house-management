/**
 * Bilingual (Khmer + English) rental agreement template and placeholder filler.
 * Two separate sections: full Khmer document first, then full English after.
 */

export interface AgreementVars {
  tenantName: string
  roomLabel: string
  branch: string
  monthlyRent: number
  depositAmount: number
  payDay: number
  contractStart: string
  contractEnd: string
  /** Pre-computed duration label (e.g. "12 months / 12 ខែ"). Optional. */
  durationLabel?: string
}

const PLACEHOLDERS = [
  'tenant_name',
  'room',
  'branch',
  'rent',
  'deposit',
  'pay_day',
  'contract_start',
  'contract_end',
  'contract_duration',
] as const

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]

/** Compute month-difference label from two ISO date strings. Returns "" if either is empty/invalid. */
export function computeDurationLabel(start: string, end: string): string {
  if (!start || !end) return ''
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return ''
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (e.getDate() < s.getDate()) months -= 1
  if (months < 1) {
    const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} days / ${days} ថ្ងៃ`
  }
  return `${months} months / ${months} ខែ`
}

function fmtUsd(n: number): string {
  return `$${(n || 0).toFixed(2)}`
}

/** Replace {{key}} markers in `text` with values from vars. Keeps unknown markers intact. */
export function fillPlaceholders(text: string, vars: AgreementVars): string {
  const duration = vars.durationLabel || computeDurationLabel(vars.contractStart, vars.contractEnd)
  const map: Record<PlaceholderKey, string> = {
    tenant_name: vars.tenantName || '',
    room: vars.roomLabel || '',
    branch: vars.branch || '',
    rent: fmtUsd(vars.monthlyRent),
    deposit: fmtUsd(vars.depositAmount),
    pay_day: String(vars.payDay || ''),
    contract_start: vars.contractStart || '',
    contract_end: vars.contractEnd || '',
    contract_duration: duration,
  }
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key: string) => {
    const k = key.toLowerCase() as PlaceholderKey
    return k in map ? map[k] : m
  })
}

/** Default bilingual rental agreement — Khmer section first, then English. */
export const DEFAULT_AGREEMENT_TEMPLATE = `កិច្ចសន្យាជួលបន្ទប់ស្នាក់នៅ
================================

ផ្នែកទី១ — ភាសាខ្មែរ
--------------------------------

កិច្ចសន្យានេះត្រូវបានធ្វើឡើងរវាង៖

  ម្ចាស់ផ្ទះ (ភាគី «ក»)៖ {{branch}}
  អ្នកជួល (ភាគី «ខ»)៖ {{tenant_name}}

មាត្រា ១ — ទីតាំងជួល
ភាគី «ក» យល់ព្រមឲ្យភាគី «ខ» ជួលបន្ទប់លេខ {{room}} នៅសាខា {{branch}}។

មាត្រា ២ — ថ្លៃជួល
ភាគី «ខ» ត្រូវបង់ថ្លៃជួលបន្ទប់ចំនួន {{rent}} ក្នុងមួយខែ។ ការទូទាត់ត្រូវធ្វើនៅថ្ងៃទី {{pay_day}} នៃខែនីមួយៗ។

មាត្រា ៣ — ប្រាក់កក់
ភាគី «ខ» បានដាក់ប្រាក់កក់ចំនួន {{deposit}} ដែលនឹងត្រូវសងវិញនៅពេលបញ្ចប់កិច្ចសន្យា ប្រសិនបើគ្មានការខូចខាត ឬបំណុលនៅសល់។

មាត្រា ៤ — រយៈពេលនៃកិច្ចសន្យា
កិច្ចសន្យានេះមានសុពលភាពចាប់ពីថ្ងៃទី {{contract_start}} ដល់ថ្ងៃទី {{contract_end}}។
រយៈពេលសរុប៖ {{contract_duration}}។

មាត្រា ៥ — កាតព្វកិច្ចរបស់អ្នកជួល
- រក្សាបន្ទប់ឲ្យស្អាត និងមិនធ្វើឲ្យខូចខាតទ្រព្យសម្បត្តិ។
- បង់ថ្លៃទឹក ភ្លើង និងសេវាផ្សេងៗតាមការប្រើប្រាស់ពិតប្រាកដ។
- មិនធ្វើសកម្មភាពខុសច្បាប់ ឬរំខានដល់អ្នកជិតខាង។

មាត្រា ៦ — ការបញ្ចប់កិច្ចសន្យា
ភាគីណាមួយដែលចង់បញ្ចប់កិច្ចសន្យាមុនកាលកំណត់ ត្រូវជូនដំណឹងជាលាយលក្ខណ៍អក្សរយ៉ាងតិច ៣០ ថ្ងៃជាមុន។

ហត្ថលេខាភាគី «ក»៖ ______________________   កាលបរិច្ឆេទ៖ __________
ហត្ថលេខាភាគី «ខ»៖ ______________________   កាលបរិច្ឆេទ៖ __________


PART II — ENGLISH
--------------------------------

ROOM RENTAL AGREEMENT

This Agreement is made between:

  Landlord (Party A): {{branch}}
  Tenant   (Party B): {{tenant_name}}

Article 1 — Premises
Party A agrees to lease to Party B Room {{room}} located at {{branch}}.

Article 2 — Rent
Party B shall pay monthly rent of {{rent}}, payable on day {{pay_day}} of each month.

Article 3 — Security Deposit
Party B has paid a security deposit of {{deposit}}, refundable upon termination of this Agreement provided there are no damages or outstanding charges.

Article 4 — Term
This Agreement shall be effective from {{contract_start}} to {{contract_end}}.
Total duration: {{contract_duration}}.

Article 5 — Tenant Obligations
- Keep the room clean and avoid damaging property.
- Pay water, electricity, and other utility charges based on actual usage.
- Refrain from any unlawful conduct or disturbing neighbors.

Article 6 — Termination
Either party wishing to terminate this Agreement before the end of its term shall give at least 30 days' written notice.

Signature, Party A: ______________________   Date: __________
Signature, Party B: ______________________   Date: __________
`
