/**
 * Shared "gradient wash" palette for stat / summary cards: a soft tinted
 * gradient background, a matching border, a bold icon badge, and an accent
 * colour for the headline value.
 *
 * Every class string is spelled out in full so Tailwind's JIT compiler can
 * see it — do not build these names dynamically.
 */
export type CardColor =
  | 'blue' | 'green' | 'emerald' | 'red' | 'orange' | 'amber'
  | 'yellow' | 'purple' | 'indigo' | 'cyan' | 'pink' | 'slate'

export interface CardStyle {
  /** Tinted gradient background + accent border. */
  card: string
  /** Bold icon badge background (pair with a white icon). */
  icon: string
  /** Accent colour for the headline value. */
  value: string
}

export const CARD_STYLES: Record<CardColor, CardStyle> = {
  blue: {
    card: 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200/70 dark:from-blue-950/50 dark:to-blue-900/20 dark:border-blue-900/60',
    icon: 'bg-gradient-to-br from-blue-500 to-blue-600',
    value: 'text-blue-700 dark:text-blue-300',
  },
  green: {
    card: 'bg-gradient-to-br from-green-50 to-emerald-100/50 border-green-200/70 dark:from-green-950/50 dark:to-emerald-900/20 dark:border-green-900/60',
    icon: 'bg-gradient-to-br from-green-500 to-emerald-600',
    value: 'text-green-700 dark:text-green-300',
  },
  emerald: {
    card: 'bg-gradient-to-br from-emerald-50 to-teal-100/50 border-emerald-200/70 dark:from-emerald-950/50 dark:to-teal-900/20 dark:border-emerald-900/60',
    icon: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    value: 'text-emerald-700 dark:text-emerald-300',
  },
  red: {
    card: 'bg-gradient-to-br from-red-50 to-rose-100/50 border-red-200/70 dark:from-red-950/50 dark:to-rose-900/20 dark:border-red-900/60',
    icon: 'bg-gradient-to-br from-red-500 to-rose-600',
    value: 'text-red-600 dark:text-red-300',
  },
  orange: {
    card: 'bg-gradient-to-br from-orange-50 to-amber-100/50 border-orange-200/70 dark:from-orange-950/50 dark:to-amber-900/20 dark:border-orange-900/60',
    icon: 'bg-gradient-to-br from-orange-500 to-amber-600',
    value: 'text-orange-600 dark:text-orange-300',
  },
  amber: {
    card: 'bg-gradient-to-br from-amber-50 to-yellow-100/50 border-amber-200/70 dark:from-amber-950/50 dark:to-yellow-900/20 dark:border-amber-900/60',
    icon: 'bg-gradient-to-br from-amber-500 to-yellow-500',
    value: 'text-amber-600 dark:text-amber-300',
  },
  yellow: {
    card: 'bg-gradient-to-br from-yellow-50 to-amber-100/50 border-yellow-200/70 dark:from-yellow-950/50 dark:to-amber-900/20 dark:border-yellow-900/60',
    icon: 'bg-gradient-to-br from-yellow-400 to-amber-500',
    value: 'text-yellow-700 dark:text-yellow-300',
  },
  purple: {
    card: 'bg-gradient-to-br from-purple-50 to-fuchsia-100/50 border-purple-200/70 dark:from-purple-950/50 dark:to-fuchsia-900/20 dark:border-purple-900/60',
    icon: 'bg-gradient-to-br from-purple-500 to-fuchsia-600',
    value: 'text-purple-700 dark:text-purple-300',
  },
  indigo: {
    card: 'bg-gradient-to-br from-indigo-50 to-blue-100/50 border-indigo-200/70 dark:from-indigo-950/50 dark:to-blue-900/20 dark:border-indigo-900/60',
    icon: 'bg-gradient-to-br from-indigo-500 to-blue-600',
    value: 'text-indigo-700 dark:text-indigo-300',
  },
  cyan: {
    card: 'bg-gradient-to-br from-cyan-50 to-sky-100/50 border-cyan-200/70 dark:from-cyan-950/50 dark:to-sky-900/20 dark:border-cyan-900/60',
    icon: 'bg-gradient-to-br from-cyan-500 to-sky-600',
    value: 'text-cyan-700 dark:text-cyan-300',
  },
  pink: {
    card: 'bg-gradient-to-br from-pink-50 to-rose-100/50 border-pink-200/70 dark:from-pink-950/50 dark:to-rose-900/20 dark:border-pink-900/60',
    icon: 'bg-gradient-to-br from-pink-500 to-rose-600',
    value: 'text-pink-700 dark:text-pink-300',
  },
  slate: {
    card: 'bg-gradient-to-br from-slate-50 to-slate-100/70 border-slate-200/80 dark:from-slate-800/50 dark:to-slate-900/30 dark:border-slate-700/60',
    icon: 'bg-gradient-to-br from-slate-500 to-slate-600',
    value: 'text-slate-700 dark:text-slate-300',
  },
}
