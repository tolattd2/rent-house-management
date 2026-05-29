import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Self-hosted Docker build: emit a minimal standalone server in .next/standalone
  // so the runtime image doesn't need the full node_modules tree.
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'prisma'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default nextConfig
