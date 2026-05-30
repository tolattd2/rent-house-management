import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? ''
  // Supabase's transaction pooler (PgBouncer) needs prepared statements disabled
  // and a small connection limit. A direct Postgres (e.g. self-hosted) does not —
  // and blindly appending these params corrupts a URL that already has a query
  // string (e.g. ?schema=public). So only apply them when DATABASE_POOLED=true,
  // and use the correct separator if a query string is already present.
  const usePooler =
    process.env.DATABASE_POOLED === 'true' && !!url && !url.includes('pgbouncer')
  const datasourceUrl = usePooler
    ? `${url}${url.includes('?') ? '&' : '?'}pgbouncer=true&connection_limit=1`
    : url

  return new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
