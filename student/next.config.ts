import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', '@prisma/adapter-pg'],
  turbopack: {
    // The repo root, so the scheduler shared with the advisor app under core/
    // resolves. Rooting at student/ puts those imports outside the bundler root.
    root: path.join(__dirname, '..'),
  },
};

export default nextConfig;
