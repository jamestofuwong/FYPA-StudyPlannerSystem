import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load root .env so DATABASE_URL is visible to Next.js API routes (Prisma).
// web/.env takes precedence — dotenv won't override vars already set.
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false })

let appVersion = '0.0.0'
try {
  const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))
  appVersion = pkg.version ?? '0.0.0'
} catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    APP_VERSION: appVersion,
  },
  transpilePackages: ['core'],
  serverExternalPackages: ['@local/prisma-client'],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;