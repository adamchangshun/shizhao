import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Native modules must stay out of the server bundle.
  serverExternalPackages: ['better-sqlite3', 'sharp'],
  poweredByHeader: false,
}

export default nextConfig
