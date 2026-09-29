import type { NextConfig } from "next";
import path from "node:path";

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'CMS_JWT_SECRET'] as const

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  serverExternalPackages: ['pg', '@prisma/adapter-pg'],
  turbopack: {
    // The repo root, so the scheduler shared with the advisor app under core/
    // resolves. Rooting at student/ puts those imports outside the bundler root.
    root: path.join(__dirname, '..'),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
