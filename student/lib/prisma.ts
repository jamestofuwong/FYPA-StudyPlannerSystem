import 'server-only'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Use the pooled URL at runtime (DATABASE_URL_UNPOOLED, port 6543 + pgbouncer=true).
// Fall back to DATABASE_URL so local dev (direct connection) still works without
// needing a second env var.
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!

const adapter = new PrismaPg({ connectionString })

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
