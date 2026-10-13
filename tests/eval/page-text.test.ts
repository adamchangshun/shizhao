import { describe, expect, it } from 'vitest'
import { visibleText } from '@/eval/lib/page-text'

describe('visibleText', () => {
  it('keeps body text, one line per block, and drops script, style, head and comments', () => {
    const html = `<!doctype html><html><head><title>标题不可见</title>
      <style>.a{content:"¥99"}</style><script>document.write("¥88")</script></head>
      <body><h1>转角咖啡</h1><!-- ¥77 -->
      <div class="item"><span>拿铁</span> <span>¥22</span><span>杯</span></div>
      <p>好喝<strong>又</strong>暖心</p>
      <script type="module">alert("¥66")</script><noscript>¥55</noscript>
      <template><p>¥44</p></template></body></html>`
    expect(visibleText(html)).toBe('转角咖啡\n拿铁 ¥22杯\n好喝又暖心')
  })

  it('skips decoration marked aria-hidden="true" and elements with the hidden attribute', () => {
    const html = `<ul><li><span class="c-index" aria-hidden="true">01</span><span>拿铁</span></li>
      <li><span aria-hidden="false">美式</span><span hidden>¥99</span></li></ul>`
    expect(visibleText(html)).toBe('拿铁\n美式')
  })

  it('decodes entities', () => {
    expect(visibleText('<p>A&amp;B &yen;12</p>')).toBe('A&B ¥12')
  })
})
