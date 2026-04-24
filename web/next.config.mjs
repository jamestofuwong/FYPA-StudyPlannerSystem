import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load root .env so DATABASE_URL is visible to Next.js API routes (Prisma).
// web/.env takes precedence — dotenv won't override vars already set.
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['core'],
  serverExternalPackages: ['@local/prisma-client'],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;