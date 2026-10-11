import { describe, expect, it } from 'vitest'
import { EnvError, parseEnv } from '@/lib/env'

const base = { PUBLIC_BASE_URL: 'http://localhost:6688', ADMIN_TOKEN: 'a-long-enough-token' }

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(base)
    expect(env.PROVIDER).toBe('mock')
    expect(env.GUARD_KEY_DAILY_LIMIT).toBe(2000)
    expect(env.LONG_IMAGE_ENABLED).toBe(true)
    expect(env.GUARD_API_KEYS).toEqual([])
    expect(env.LLM_PRICE_INPUT_PER_1K).toBe(0)
  })

  it('reports a missing ADMIN_TOKEN in Chinese', () => {
    expect(() => parseEnv({ PUBLIC_BASE_URL: 'http://localhost:6688' })).toThrow(EnvError)
    expect(() => parseEnv({ PUBLIC_BASE_URL: 'http://localhost:6688' })).toThrow(/ADMIN_TOKEN/)
    expect(() => parseEnv({ PUBLIC_BASE_URL: 'http://localhost:6688' })).toThrow(/缺少必需变量/)
  })

  it('requires LLM settings when PROVIDER=openai-compatible', () => {
    expect(() => parseEnv({ ...base, PROVIDER: 'openai-compatible' })).toThrow(/LLM_BASE_URL/)
  })

  it('splits GUARD_API_KEYS on commas and parses LONG_IMAGE_ENABLED=false', () => {
    const env = parseEnv({ ...base, GUARD_API_KEYS: ' k1, k2 ,,', LONG_IMAGE_ENABLED: 'false' })
    expect(env.GUARD_API_KEYS).toEqual(['k1', 'k2'])
    expect(env.LONG_IMAGE_ENABLED).toBe(false)
  })

  it('refuses public http but allows https, localhost and LAN addresses', () => {
    const at = (url: string) => () => parseEnv({ ...base, PUBLIC_BASE_URL: url })
    expect(at('http://shop.example.com')).toThrow(/必须使用 https/)
    expect(at('http://8.8.8.8:6688')).toThrow(/必须使用 https/)
    expect(at('https://shop.example.com')).not.toThrow()
    expect(at('http://localhost:6688')).not.toThrow()
    expect(at('http://192.168.1.20:6688')).not.toThrow()
    expect(at('http://172.20.10.2:6688')).not.toThrow()
    expect(at('http://macbook.local:6688')).not.toThrow()
  })
})
