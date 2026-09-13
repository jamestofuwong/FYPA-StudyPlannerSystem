import path from 'node:path'
import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Load .env locally; skip in CI where env vars come from GitHub secrets
const envPath = path.join(import.meta.dirname, '.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma/schema.prisma'),
  datasource: {
    // Direct connection (port 5432) — used by Prisma CLI for migrations.
    // Supabase transaction pooler (port 6543) cannot run migrations.
    url: process.env.DATABASE_URL!,
  },
})
