import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'data/**',
      'playwright-report/**',
      'test-results/**',
      'lib/db/migrations/**',
      'next-env.d.ts',
      'packages/*/dist/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
]

export default config
