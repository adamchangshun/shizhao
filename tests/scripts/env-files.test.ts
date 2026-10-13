import { describe, expect, it } from 'vitest'
import { hasEnvKey, readEnvValue } from '@/scripts/env-files'

describe('readEnvValue', () => {
  const content = 'PROVIDER=mock\nADMIN_TOKEN=\nPUBLIC_BASE_URL="http://localhost:6688"\n'

  it('treats an empty assignment as unset so bootstrap fills it', () => {
    expect(readEnvValue(content, 'ADMIN_TOKEN')).toBeUndefined()
  })
  it('reads plain and quoted values', () => {
    expect(readEnvValue(content, 'PROVIDER')).toBe('mock')
    expect(readEnvValue(content, 'PUBLIC_BASE_URL')).toBe('http://localhost:6688')
  })
  it('does not match a key that only shares a prefix', () => {
    expect(readEnvValue('ADMIN_TOKEN_OLD=abc\n', 'ADMIN_TOKEN')).toBeUndefined()
  })
})

describe('hasEnvKey', () => {
  it('sees an empty assignment, which still overrides lower-priority files', () => {
    expect(hasEnvKey('ADMIN_TOKEN=\n', 'ADMIN_TOKEN')).toBe(true)
    expect(hasEnvKey('# ADMIN_TOKEN=x\nPROVIDER=mock\n', 'ADMIN_TOKEN')).toBe(false)
  })
})
