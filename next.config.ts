import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Native modules must stay out of the server bundle.
  serverExternalPackages: ['better-sqlite3', 'sharp', 'file-type', 'subset-font'],
  poweredByHeader: false,
}

export default nextConfig
