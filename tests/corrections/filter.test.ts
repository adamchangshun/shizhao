import { describe, expect, it } from 'vitest'
import { containsPersonalInfo, looksLikeSpam, sanitizeText } from '@/lib/corrections/filter'

describe('personal information', () => {
  it.each([
    '我的电话13800138000',
    '打 138 0013 8000',
    '１３８００１３８０００',
    '座机 021-64881234',
    'someone@example.com',
    '微信：tianxin_88',
    'vx abc12345',
    '加v Lily2024',
    '身份证 31010119900307123X',
    '电话（021）64881234',
    '手机号 138/0013/8000',
    '微信号是：tianxin_88',
    '我的微信号是这个 abc12345',
    'someone @ example . com',
  ])('refuses %s', (text) => {
    expect(containsPersonalInfo(text)).toBe(true)
  })

  it.each([
    '138元',
    '¥12.50/个',
    '营业到 21:30',
    '营业 8:00-20:00',
    '微信上把 Americano 改成 Latte',
    '10-15 个',
    '约 450g，8 寸',
    'Americano 改成 Latte',
    '一百三十八',
  ])('allows %s', (text) => {
    expect(containsPersonalInfo(text)).toBe(false)
  })
})

describe('cleaning and spam', () => {
  it('strips tags and control characters', () => {
    expect(sanitizeText(' <b>138</b>\u0000元<script>x</script>\n')).toBe('138 元x')
  })

  it('flags links and advertising, not ordinary notes', () => {
    expect(looksLikeSpam('看 https://a.example')).toBe(true)
    expect(looksLikeSpam('招商加盟请联系')).toBe(true)
    expect(looksLikeSpam('价格应该是 138 元')).toBe(false)
  })
})
