import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['puppeteer', '@prisma/client', '@local/prisma-client'],
  turbopack: {
    root: repoRoot,
    resolveAlias: {
      '@core': path.join(repoRoot, 'core'),
    },
  },
};

export default nextConfig;
