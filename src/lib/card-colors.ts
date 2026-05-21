/**
 * Shared solid-pastel palette for stat / summary cards: a flat pastel
 * background, a matching border, a bold solid icon badge, and an accent
 * colour for the headline value.
 *
 * Every class string is spelled out in full so Tailwind's JIT compiler can
 * see it — do not build these names dynamically. The background uses a solid
 * `bg-*` (not a gradient) so it fully replaces the card's white background.
 */
export type CardColor =
  | 'blue' | 'green' | 'emerald' | 'red' | 'orange' | 'amber'
  | 'yellow' | 'purple' | 'indigo' | 'cyan' | 'pink' | 'slate'

export interface CardStyle {
  /** Solid pastel background + accent border. */
  card: string
  /** Bold solid icon badge background (pair with a white icon). */
  icon: string
  /** Accent colour for the headline value. */
  value: string
}

export const CARD_STYLES: Record<CardColor, CardStyle> = {
  blue: {
    card: 'bg-blue-100 border-blue-200 dark:bg-blue-950 dark:border-blue-900',
    icon: 'bg-blue-500',
    value: 'text-blue-700 dark:text-blue-200',
  },
  green: {
    card: 'bg-green-100 border-green-200 dark:bg-green-950 dark:border-green-900',
    icon: 'bg-green-500',
    value: 'text-green-700 dark:text-green-200',
  },
  emerald: {
    card: 'bg-emerald-100 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-900',
    icon: 'bg-emerald-500',
    value: 'text-emerald-700 dark:text-emerald-200',
  },
  red: {
    card: 'bg-red-100 border-red-200 dark:bg-red-950 dark:border-red-900',
    icon: 'bg-red-500',
    value: 'text-red-700 dark:text-red-200',
  },
  orange: {
    card: 'bg-orange-100 border-orange-200 dark:bg-orange-950 dark:border-orange-900',
    icon: 'bg-orange-500',
    value: 'text-orange-700 dark:text-orange-200',
  },
  amber: {
    card: 'bg-amber-100 border-amber-200 dark:bg-amber-950 dark:border-amber-900',
    icon: 'bg-amber-500',
    value: 'text-amber-700 dark:text-amber-200',
  },
  yellow: {
    card: 'bg-yellow-100 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900',
    icon: 'bg-yellow-500',
    value: 'text-yellow-700 dark:text-yellow-200',
  },
  purple: {
    card: 'bg-purple-100 border-purple-200 dark:bg-purple-950 dark:border-purple-900',
    icon: 'bg-purple-500',
    value: 'text-purple-700 dark:text-purple-200',
  },
  indigo: {
    card: 'bg-indigo-100 border-indigo-200 dark:bg-indigo-950 dark:border-indigo-900',
    icon: 'bg-indigo-500',
    value: 'text-indigo-700 dark:text-indigo-200',
  },
  cyan: {
    card: 'bg-cyan-100 border-cyan-200 dark:bg-cyan-950 dark:border-cyan-900',
    icon: 'bg-cyan-500',
    value: 'text-cyan-700 dark:text-cyan-200',
  },
  pink: {
    card: 'bg-pink-100 border-pink-200 dark:bg-pink-950 dark:border-pink-900',
    icon: 'bg-pink-500',
    value: 'text-pink-700 dark:text-pink-200',
  },
  slate: {
    card: 'bg-slate-100 border-slate-300 dark:bg-slate-800 dark:border-slate-700',
    icon: 'bg-slate-500',
    value: 'text-slate-700 dark:text-slate-200',
  },
}
