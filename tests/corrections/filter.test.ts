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
    '138----0013----8000',
    '电话 138 —— 0013 —— 8000',
    '138 / / / / 0013 / / / / 8000',
    'QQ 12345678',
    'qq：1234 5678 9',
    '扣扣号是 987654321',
    '我的QQ是这个 123456789',
    'Q号: 10001',
    '支付宝账号：tian_88abc',
    '支付宝 2088 1021 3456 7890',
    'zfb 12345678',
    '支付宝收款账号写在这里 2088102134567890',
    '支付宝收款，账号写在这里 2088102134567890',
    '我的QQ，账号是 12345678',
    '支付宝账号 tian _ 88abc',
    'QQ 是 tian - 88abc',
    'QQ账号 12345678元',
    '支付宝账号 2088102134567890 元',
    'Q Q：12345678',
    '支 付 宝 2088 1021 3456 7890',
    '支付宝账号 tian 88abc',
    'QQ：tian 88 abc',
    'QQ：tian 88 abc please confirm',
    '支付宝 abc def，QQ tian 88abc',
    'QQ：t i a n x 8',
    '支付宝账号 tian  88abc',
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
    'QQ糖 5 元一包',
    'QQ 音乐里放的歌很好听',
    '可以用支付宝付款',
    '支付宝付了 128 元',
    '支付宝付了 12800 元',
    '营业 8:00 ---- 20:00',
    '大杯 18 元 / 中杯 15 元',
    '2 杯 ---- 3 杯',
    '价格 13，不是 15',
    '支持支付宝付款，商品编号 12345 写错了',
    'QQ音乐可以播放，订单号 abc_123 有误',
    '支持支付宝付款，会员账号年费是 12800 元',
    '支付宝付款 tian 写错了',
    '支付宝付了 ¥12800',
    '支付宝付了 ￥12,800',
    '支持支付宝付款，会员账号年费是 RMB 12800',
    '支付宝付了 CNY12800',
    '支付宝付了 12800 人民币',
    '支持支付宝付款，会员账号年费是 12800人民币',
    '支付宝 RMB 12800',
    '支付宝 cny 12 800',
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
