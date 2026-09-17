import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', '@prisma/adapter-pg'],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
