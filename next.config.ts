import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Native modules must stay out of the server bundle.
  serverExternalPackages: ['better-sqlite3', 'sharp', 'file-type', 'subset-font'],
  poweredByHeader: false,
  webpack(config) {
    // fact-guard's NodeNext source uses .js specifiers; resolve its TS siblings in Next.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.js', '.ts', '.tsx'],
    }
    return config
  },
}

export default nextConfig
