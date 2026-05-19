import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@prisma/client', '@local/prisma-client'],
  typescript: {
    // Type errors are caught in local dev; skip during Docker build where
    // cross-package types (e.g. puppeteer in core/services) can't be resolved.
    ignoreBuildErrors: true,
  },
  webpack(config) {
    config.resolve.alias['@core'] = path.join(repoRoot, 'core');
    return config;
  },
  turbopack: {
    root: repoRoot,
    resolveAlias: {
      '@core': path.join(repoRoot, 'core'),
    },
  },
};

export default nextConfig;
