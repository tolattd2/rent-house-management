import { db } from '@/lib/db'
import { generateInvoiceNumber } from '@/lib/utils'

/**
 * Next invoice number for the current year, derived from the highest existing
 * number rather than a row count. Counting breaks once invoices are deleted
 * (cascade from a deleted billing): the count drifts below the max sequence and
 * `count + 1` regenerates a number that already exists, violating the unique
 * constraint on `invoiceNumber`. Reading the max for the year's prefix avoids
 * that. Zero-padded sequences sort lexicographically, so `orderBy desc` on the
 * string gives the highest sequence.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const prefix = `INV-${new Date().getFullYear()}-`
  const last = await db.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  })
  const lastSeq = last ? parseInt(last.invoiceNumber.slice(prefix.length), 10) || 0 : 0
  return generateInvoiceNumber(lastSeq + 1)
}

/** True for a Prisma P2002 unique-constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}
