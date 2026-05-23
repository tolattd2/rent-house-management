/**
 * Bilingual (Khmer + English) rental agreement template and placeholder filler.
 * Two separate sections: full Khmer document first, then full English after.
 *
 * Each substitution has two flavours:
 *   {{name}}     — original / English-friendly value (e.g. "$100.00", "5", "Male")
 *   {{name_km}}  — Khmer-localised value (e.g. "១០០.០០ ដុល្លារ", "៥", "ប្រុស")
 *
 * The default template uses the _km variants inside the Khmer section so the
 * rendered contract reads naturally in Khmer.
 */

export interface AgreementVars {
  tenantName: string
  gender: string
  age: number
  nationality: string
  occupation: string
  nationalId: string
  phone: string
  emergencyName: string
  emergencyPhone: string
  roomLabel: string
  branch: string
  monthlyRent: number
  depositAmount: number
  payDay: number
  contractStart: string
  contractEnd: string
  /** Pre-computed bilingual duration label. Optional. */
  durationLabel?: string
}

const PLACEHOLDERS = [
  // Originals (English-friendly)
  'tenant_name',
  'gender',
  'age',
  'nationality',
  'occupation',
  'national_id',
  'phone',
  'emergency_name',
  'emergency_phone',
  'room',
  'branch',
  'rent',
  'deposit',
  'pay_day',
  'contract_start',
  'contract_end',
  'contract_duration',
  // Khmer-localised variants
  'tenant_name_km',
  'gender_km',
  'age_km',
  'nationality_km',
  'occupation_km',
  'national_id_km',
  'phone_km',
  'emergency_name_km',
  'emergency_phone_km',
  'room_km',
  'branch_km',
  'rent_km',
  'deposit_km',
  'pay_day_km',
  'contract_start_km',
  'contract_end_km',
  'contract_duration_km',
] as const

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]

/** Map ASCII digits 0-9 to Khmer digits ០-៩, leave other characters alone. */
export function toKhmerDigits(s: string): string {
  const map: Record<string, string> = {
    '0': '០', '1': '១', '2': '២', '3': '៣', '4': '៤',
    '5': '៥', '6': '៦', '7': '៧', '8': '៨', '9': '៩',
  }
  return s.replace(/[0-9]/g, (d) => map[d] || d)
}

/** Translate gender ("Male"/"Female"/"Other") to Khmer; pass through unknown. */
function genderToKhmer(g: string): string {
  const v = (g || '').trim().toLowerCase()
  if (v === 'male')   return 'ប្រុស'
  if (v === 'female') return 'ស្រី'
  if (v === 'other')  return 'ផ្សេងៗ'
  return g || ''
}

/** Translate common nationalities to Khmer; pass through unknown. */
function nationalityToKhmer(n: string): string {
  const v = (n || '').trim().toLowerCase()
  const map: Record<string, string> = {
    cambodia:  'កម្ពុជា',
    cambodian: 'ខ្មែរ',
    khmer:     'ខ្មែរ',
    chinese:   'ចិន',
    vietnamese:'វៀតណាម',
    thai:      'ថៃ',
    laotian:   'ឡាវ',
    lao:       'ឡាវ',
    american:  'អាមេរិកាំង',
    british:   'អង់គ្លេស',
    french:    'បារាំង',
    korean:    'កូរ៉េ',
    japanese:  'ជប៉ុន',
    indian:    'ឥណ្ឌា',
    filipino:  'ហ្វីលីពីន',
    malaysian: 'ម៉ាឡេស៊ី',
    indonesian:'ឥណ្ឌូនេស៊ី',
  }
  return map[v] || n || ''
}

/** Compute month-difference label from two ISO date strings. Returns "" if either is empty/invalid. */
export function computeDurationLabel(start: string, end: string): string {
  const m = monthsBetween(start, end)
  if (m === null) return ''
  if (m.kind === 'days') return `${m.days} days / ${toKhmerDigits(String(m.days))} ថ្ងៃ`
  return `${m.months} months / ${toKhmerDigits(String(m.months))} ខែ`
}

function monthsBetween(start: string, end: string):
  | { kind: 'months'; months: number }
  | { kind: 'days'; days: number }
  | null {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (e.getDate() < s.getDate()) months -= 1
  if (months < 1) {
    const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
    return { kind: 'days', days }
  }
  return { kind: 'months', months }
}

function durationEnglish(start: string, end: string): string {
  const m = monthsBetween(start, end)
  if (!m) return ''
  return m.kind === 'days' ? `${m.days} days` : `${m.months} months`
}

function durationKhmer(start: string, end: string): string {
  const m = monthsBetween(start, end)
  if (!m) return ''
  return m.kind === 'days'
    ? `${toKhmerDigits(String(m.days))} ថ្ងៃ`
    : `${toKhmerDigits(String(m.months))} ខែ`
}

function fmtUsd(n: number): string {
  return `$${(n || 0).toFixed(2)}`
}

function fmtUsdKhmer(n: number): string {
  return `${toKhmerDigits((n || 0).toFixed(2))} ដុល្លារ`
}

/** Replace {{key}} markers in `text` with values from vars. Keeps unknown markers intact. */
export function fillPlaceholders(text: string, vars: AgreementVars): string {
  const durationEn = vars.durationLabel || durationEnglish(vars.contractStart, vars.contractEnd)
  const durationKm = durationKhmer(vars.contractStart, vars.contractEnd)

  const map: Record<PlaceholderKey, string> = {
    // English-friendly
    tenant_name: vars.tenantName || '',
    gender: vars.gender || '',
    age: vars.age > 0 ? String(vars.age) : '',
    nationality: vars.nationality || '',
    occupation: vars.occupation || '',
    national_id: vars.nationalId || '',
    phone: vars.phone || '',
    emergency_name: vars.emergencyName || '',
    emergency_phone: vars.emergencyPhone || '',
    room: vars.roomLabel || '',
    branch: vars.branch || '',
    rent: fmtUsd(vars.monthlyRent),
    deposit: fmtUsd(vars.depositAmount),
    pay_day: String(vars.payDay || ''),
    contract_start: vars.contractStart || '',
    contract_end: vars.contractEnd || '',
    contract_duration: durationEn,

    // Khmer-localised
    tenant_name_km:     vars.tenantName || '',                              // proper noun
    gender_km:          genderToKhmer(vars.gender),
    age_km:             vars.age > 0 ? toKhmerDigits(String(vars.age)) : '',
    nationality_km:     nationalityToKhmer(vars.nationality),
    occupation_km:      vars.occupation || '',                              // free-text — keep as typed
    national_id_km:     toKhmerDigits(vars.nationalId || ''),
    phone_km:           toKhmerDigits(vars.phone || ''),
    emergency_name_km:  vars.emergencyName || '',                           // proper noun
    emergency_phone_km: toKhmerDigits(vars.emergencyPhone || ''),
    room_km:            toKhmerDigits(vars.roomLabel || ''),
    branch_km:          vars.branch || '',                                  // branch names left as configured
    rent_km:            fmtUsdKhmer(vars.monthlyRent),
    deposit_km:         fmtUsdKhmer(vars.depositAmount),
    pay_day_km:         toKhmerDigits(String(vars.payDay || '')),
    contract_start_km:  toKhmerDigits(vars.contractStart || ''),
    contract_end_km:    toKhmerDigits(vars.contractEnd || ''),
    contract_duration_km: durationKm,
  }

  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key: string) => {
    const k = key.toLowerCase() as PlaceholderKey
    return k in map ? map[k] : m
  })
}

/** Default bilingual rental agreement — Khmer section first (uses _km variants), then English. */
export const DEFAULT_AGREEMENT_TEMPLATE = `កិច្ចសន្យាជួលបន្ទប់ស្នាក់នៅ
================================

ផ្នែកទី១ — ភាសាខ្មែរ
--------------------------------

កិច្ចសន្យានេះត្រូវបានធ្វើឡើងរវាង៖

  ម្ចាស់ផ្ទះ (ភាគី «ក»)៖ {{branch_km}}
  អ្នកជួល (ភាគី «ខ»)៖ {{tenant_name_km}}

ព័ត៌មានអ្នកជួល៖
  ភេទ៖ {{gender_km}}
  អាយុ៖ {{age_km}} ឆ្នាំ
  សញ្ជាតិ៖ {{nationality_km}}
  មុខរបរ៖ {{occupation_km}}
  អត្តសញ្ញាណប័ណ្ណ៖ {{national_id_km}}
  លេខទូរស័ព្ទ៖ {{phone_km}}
  អ្នកទំនាក់ទំនងបន្ទាន់៖ {{emergency_name_km}} ({{emergency_phone_km}})

មាត្រា ១ — ទីតាំងជួល
ភាគី «ក» យល់ព្រមឲ្យភាគី «ខ» ជួលបន្ទប់លេខ {{room_km}} នៅសាខា {{branch_km}}។

មាត្រា ២ — ថ្លៃជួល
ភាគី «ខ» ត្រូវបង់ថ្លៃជួលបន្ទប់ចំនួន {{rent_km}} ក្នុងមួយខែ។ ការទូទាត់ត្រូវធ្វើនៅថ្ងៃទី {{pay_day_km}} នៃខែនីមួយៗ។

មាត្រា ៣ — ប្រាក់កក់
ភាគី «ខ» បានដាក់ប្រាក់កក់ចំនួន {{deposit_km}} ដែលនឹងត្រូវសងវិញនៅពេលបញ្ចប់កិច្ចសន្យា ប្រសិនបើគ្មានការខូចខាត ឬបំណុលនៅសល់។

មាត្រា ៤ — រយៈពេលនៃកិច្ចសន្យា
កិច្ចសន្យានេះមានសុពលភាពចាប់ពីថ្ងៃទី {{contract_start_km}} ដល់ថ្ងៃទី {{contract_end_km}}។
រយៈពេលសរុប៖ {{contract_duration_km}}។

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

Tenant details:
  Gender:            {{gender}}
  Age:               {{age}}
  Nationality:       {{nationality}}
  Occupation:        {{occupation}}
  National ID:       {{national_id}}
  Phone:             {{phone}}
  Emergency contact: {{emergency_name}} ({{emergency_phone}})

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
