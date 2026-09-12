import path from 'node:path'
import { defineConfig } from 'prisma/config'

process.loadEnvFile(path.join(import.meta.dirname, '.env'))

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma/schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
})
