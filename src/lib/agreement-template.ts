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
  phonesExtra: string[]
  telegramChatId: string
  emergencyName: string
  emergencyPhone: string
  notes: string
  moveInDate: string
  moveOutDate: string
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
  'phones_extra',
  'all_phones',
  'telegram_chat_id',
  'emergency_name',
  'emergency_phone',
  'notes',
  'move_in_date',
  'move_out_date',
  'room',
  'branch',
  'rent',
  'deposit',
  'pay_day',
  'contract_start',
  'contract_end',
  'contract_duration',
  // Money-in-words (English: "one hundred US dollars exact")
  'rent_in_word',
  'deposit_in_word',
  // Khmer-localised variants
  'tenant_name_km',
  'gender_km',
  'age_km',
  'nationality_km',
  'occupation_km',
  'national_id_km',
  'phone_km',
  'phones_extra_km',
  'all_phones_km',
  'telegram_chat_id_km',
  'emergency_name_km',
  'emergency_phone_km',
  'notes_km',
  'move_in_date_km',
  'move_out_date_km',
  'room_km',
  'branch_km',
  'rent_km',
  'deposit_km',
  'pay_day_km',
  'contract_start_km',
  'contract_end_km',
  'contract_duration_km',
  // Money-in-words (Khmer: "មួយរយដុល្លារគត់")
  'rent_in_word_km',
  'deposit_in_word_km',
  // Generic alias — same as rent_in_word_km (the most common use case for "the
  // amount in words" inside the contract body is the monthly rent).
  'money_in_word',
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
    cambodia:    'កម្ពុជា',
    cambodian:   'ខ្មែរ',
    khmer:       'ខ្មែរ',
    chinese:     'ចិន',
    vietnamese:  'វៀតណាម',
    thai:        'ថៃ',
    laotian:     'ឡាវ',
    lao:         'ឡាវ',
    american:    'អាមេរិកាំង',
    british:     'អង់គ្លេស',
    english:     'អង់គ្លេស',
    french:      'បារាំង',
    korean:      'កូរ៉េ',
    japanese:    'ជប៉ុន',
    indian:      'ឥណ្ឌា',
    filipino:    'ហ្វីលីពីន',
    malaysian:   'ម៉ាឡេស៊ី',
    indonesian:  'ឥណ្ឌូនេស៊ី',
    australian:  'អូស្ត្រាលី',
    canadian:    'កាណាដា',
    german:      'អាល្លឺម៉ង់',
    russian:     'រុស្ស៊ី',
    singaporean: 'សិង្ហបុរី',
  }
  return map[v] || n || ''
}

/** Translate common occupations to Khmer; pass through unknown. */
function occupationToKhmer(o: string): string {
  const v = (o || '').trim().toLowerCase()
  const map: Record<string, string> = {
    teacher:        'គ្រូបង្រៀន',
    student:        'សិស្ស',
    'university student': 'និស្សិត',
    engineer:       'វិស្វករ',
    doctor:         'វេជ្ជបណ្ឌិត',
    nurse:          'គិលានុបដ្ឋាយិកា',
    driver:         'អ្នកបើកបរ',
    cook:           'ចុងភៅ',
    chef:           'ចុងភៅ',
    worker:         'កម្មករ',
    'office worker':'បុគ្គលិកការិយាល័យ',
    employee:       'បុគ្គលិក',
    'civil servant':'មន្ត្រីរាជការ',
    businessman:    'អ្នកជំនួញ',
    businesswoman:  'អ្នកជំនួញ',
    seller:         'អ្នកលក់',
    vendor:         'អ្នកលក់',
    farmer:         'កសិករ',
    police:         'ប៉ូលីស',
    soldier:        'ទាហាន',
    lawyer:         'មេធាវី',
    accountant:     'គណនេយ្យករ',
    manager:        'អ្នកគ្រប់គ្រង',
    cashier:        'អ្នកគិតលុយ',
    programmer:     'អ្នកសរសេរកម្មវិធី',
    developer:      'អ្នកសរសេរកម្មវិធី',
    designer:       'អ្នករចនា',
    'graphic designer':'អ្នករចនាក្រាហ្វិក',
    architect:      'ស្ថាបត្យករ',
    journalist:     'អ្នកសារព័ត៌មាន',
    photographer:   'អ្នកថតរូប',
    musician:       'អ្នកតន្ត្រី',
    artist:         'សិល្បករ',
    waiter:         'អ្នកបម្រើ',
    waitress:       'អ្នកបម្រើ',
    barista:        'អ្នកលាយកាហ្វេ',
    tailor:         'អ្នកដេរ',
    mechanic:       'អ្នកជួសជុលម៉ាស៊ីន',
    electrician:    'ជាងអគ្គិសនី',
    carpenter:      'ជាងឈើ',
    unemployed:     'គ្មានការងារ',
    retired:        'ចូលនិវត្តន៍',
    freelancer:     'អ្នកធ្វើការឯករាជ្យ',
  }
  return map[v] || o || ''
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

const KHMER_ONES = ['', 'មួយ', 'ពីរ', 'បី', 'បួន', 'ប្រាំ', 'ប្រាំមួយ', 'ប្រាំពីរ', 'ប្រាំបី', 'ប្រាំបួន']
// Tens-place words 20-90. 0 and 10 are handled separately.
const KHMER_TENS = ['', '', 'ម្ភៃ', 'សាមសិប', 'សែសិប', 'ហាសិប', 'ហុកសិប', 'ចិតសិប', 'ប៉ែតសិប', 'កៅសិប']

/** Convert a non-negative integer (≤ ~999 billion) into its spelled-out Khmer reading. */
function intToKhmerWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n === 0) return 'សូន្យ'

  const parts: string[] = []

  const billions = Math.floor(n / 1_000_000_000)
  if (billions > 0) {
    parts.push(intToKhmerWords(billions) + 'ប៊ីលាន')
    n %= 1_000_000_000
  }
  const millions = Math.floor(n / 1_000_000)
  if (millions > 0) {
    parts.push(intToKhmerWords(millions) + 'លាន')
    n %= 1_000_000
  }
  const saen = Math.floor(n / 100_000)
  if (saen > 0) {
    parts.push(KHMER_ONES[saen] + 'សែន')
    n %= 100_000
  }
  const meun = Math.floor(n / 10_000)
  if (meun > 0) {
    parts.push(KHMER_ONES[meun] + 'ម៉ឺន')
    n %= 10_000
  }
  const thousands = Math.floor(n / 1_000)
  if (thousands > 0) {
    parts.push(KHMER_ONES[thousands] + 'ពាន់')
    n %= 1_000
  }
  const hundreds = Math.floor(n / 100)
  if (hundreds > 0) {
    parts.push(KHMER_ONES[hundreds] + 'រយ')
    n %= 100
  }

  // 0–99 remainder: 10–19 uses ដប់, 20–99 uses tens word + ones.
  const tens = Math.floor(n / 10)
  if (tens === 1) {
    parts.push(n === 10 ? 'ដប់' : 'ដប់' + KHMER_ONES[n - 10])
    n = 0
  } else if (tens >= 2) {
    parts.push(KHMER_TENS[tens])
    n %= 10
  }
  if (n > 0) parts.push(KHMER_ONES[n])

  return parts.join('')
}

const ENGLISH_ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
]
const ENGLISH_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function englishUnder1000(n: number): string {
  if (n < 20) return ENGLISH_ONES[n]
  if (n < 100) {
    const t = Math.floor(n / 10)
    const r = n % 10
    return r === 0 ? ENGLISH_TENS[t] : `${ENGLISH_TENS[t]}-${ENGLISH_ONES[r]}`
  }
  const h = Math.floor(n / 100)
  const r = n % 100
  return r === 0 ? `${ENGLISH_ONES[h]} hundred` : `${ENGLISH_ONES[h]} hundred ${englishUnder1000(r)}`
}

function intToEnglishWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n === 0) return 'zero'
  const parts: string[] = []
  if (n >= 1_000_000_000) {
    parts.push(`${englishUnder1000(Math.floor(n / 1_000_000_000))} billion`)
    n %= 1_000_000_000
  }
  if (n >= 1_000_000) {
    parts.push(`${englishUnder1000(Math.floor(n / 1_000_000))} million`)
    n %= 1_000_000
  }
  if (n >= 1_000) {
    parts.push(`${englishUnder1000(Math.floor(n / 1_000))} thousand`)
    n %= 1_000
  }
  if (n > 0) parts.push(englishUnder1000(n))
  return parts.join(' ')
}

/** USD amount → Khmer spelled-out reading, e.g. 100 → "មួយរយដុល្លារគត់". */
export function moneyInKhmerWords(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return ''
  const cents = Math.round(usd * 100)
  const dollars = Math.floor(cents / 100)
  const rem = cents % 100
  if (rem === 0) return `${intToKhmerWords(dollars)}ដុល្លារគត់`
  return `${intToKhmerWords(dollars)}ដុល្លារ និង${intToKhmerWords(rem)}សេន`
}

/** USD amount → English spelled-out reading, e.g. 100 → "one hundred US dollars exact". */
export function moneyInEnglishWords(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return ''
  const cents = Math.round(usd * 100)
  const dollars = Math.floor(cents / 100)
  const rem = cents % 100
  if (rem === 0) return `${intToEnglishWords(dollars)} US dollars exact`
  return `${intToEnglishWords(dollars)} US dollars and ${intToEnglishWords(rem)} cents`
}

/** Replace {{key}} markers in `text` with values from vars. Keeps unknown markers intact. */
export function fillPlaceholders(text: string, vars: AgreementVars): string {
  const durationEn = vars.durationLabel || durationEnglish(vars.contractStart, vars.contractEnd)
  const durationKm = durationKhmer(vars.contractStart, vars.contractEnd)

  const phonesExtraJoined = (vars.phonesExtra || []).filter(Boolean).join(', ')
  const allPhonesJoined = [vars.phone, ...(vars.phonesExtra || [])].filter(Boolean).join(', ')

  const map: Record<PlaceholderKey, string> = {
    // English-friendly
    tenant_name: vars.tenantName || '',
    gender: vars.gender || '',
    age: vars.age > 0 ? String(vars.age) : '',
    nationality: vars.nationality || '',
    occupation: vars.occupation || '',
    national_id: vars.nationalId || '',
    phone: vars.phone || '',
    phones_extra: phonesExtraJoined,
    all_phones: allPhonesJoined,
    telegram_chat_id: vars.telegramChatId || '',
    emergency_name: vars.emergencyName || '',
    emergency_phone: vars.emergencyPhone || '',
    notes: vars.notes || '',
    move_in_date: vars.moveInDate || '',
    move_out_date: vars.moveOutDate || '',
    room: vars.roomLabel || '',
    branch: vars.branch || '',
    rent: fmtUsd(vars.monthlyRent),
    deposit: fmtUsd(vars.depositAmount),
    pay_day: String(vars.payDay || ''),
    contract_start: vars.contractStart || '',
    contract_end: vars.contractEnd || '',
    contract_duration: durationEn,
    rent_in_word: moneyInEnglishWords(vars.monthlyRent),
    deposit_in_word: moneyInEnglishWords(vars.depositAmount),

    // Khmer-localised — translate where there's a known mapping; otherwise
    // convert ASCII digits to Khmer numerals; proper nouns pass through.
    tenant_name_km:      vars.tenantName || '',                             // proper noun
    gender_km:           genderToKhmer(vars.gender),
    age_km:              vars.age > 0 ? toKhmerDigits(String(vars.age)) : '',
    nationality_km:      nationalityToKhmer(vars.nationality),
    occupation_km:       occupationToKhmer(vars.occupation),
    national_id_km:      toKhmerDigits(vars.nationalId || ''),
    phone_km:            toKhmerDigits(vars.phone || ''),
    phones_extra_km:     toKhmerDigits(phonesExtraJoined),
    all_phones_km:       toKhmerDigits(allPhonesJoined),
    telegram_chat_id_km: toKhmerDigits(vars.telegramChatId || ''),
    emergency_name_km:   vars.emergencyName || '',                          // proper noun
    emergency_phone_km:  toKhmerDigits(vars.emergencyPhone || ''),
    notes_km:            vars.notes || '',                                  // free text
    move_in_date_km:     toKhmerDigits(vars.moveInDate || ''),
    move_out_date_km:    toKhmerDigits(vars.moveOutDate || ''),
    room_km:             toKhmerDigits(vars.roomLabel || ''),
    branch_km:           vars.branch || '',                                 // branch names left as configured
    rent_km:             fmtUsdKhmer(vars.monthlyRent),
    deposit_km:          fmtUsdKhmer(vars.depositAmount),
    pay_day_km:          toKhmerDigits(String(vars.payDay || '')),
    contract_start_km:   toKhmerDigits(vars.contractStart || ''),
    contract_end_km:     toKhmerDigits(vars.contractEnd || ''),
    contract_duration_km: durationKm,
    rent_in_word_km:     moneyInKhmerWords(vars.monthlyRent),
    deposit_in_word_km:  moneyInKhmerWords(vars.depositAmount),
    // Generic alias — same as rent_in_word_km, for the user's preferred name.
    money_in_word:       moneyInKhmerWords(vars.monthlyRent),
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
