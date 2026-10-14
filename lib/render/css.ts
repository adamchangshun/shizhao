// Shared page CSS: palette variables, base layout, shared components, decoration, motion.
// Every value interpolated here comes from a zod-validated DesignSpec (hex colors, enums)
// or from the font registry — never from merchant or model text.
import type { DesignSpec, Hex } from '@/lib/core/schemas'
import { fontStack, fontWeight } from './fonts'

function luminance(hex: Hex): number {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** Dark or light ink, whichever contrasts more with `bg` (WCAG relative luminance). */
export function inkOn(bg: Hex): Hex {
  const l = luminance(bg)
  const withWhite = 1.05 / (l + 0.05)
  const withDark = (l + 0.05) / (luminance('#1a1a1a') + 0.05)
  return withWhite >= withDark ? '#ffffff' : '#1a1a1a'
}

function decorationCss(design: DesignSpec): string {
  const s = design.seed
  switch (design.decoration) {
    case 'paper':
      return `.page{background-image:repeating-linear-gradient(0deg,transparent 0 27px,color-mix(in srgb,var(--text) 6%,transparent) 27px 28px)}`
    case 'confetti': {
      // Seeded positions keep the pattern varied across projects yet deterministic.
      const at = (k: number): string => `${(s * (k + 3) * 37) % 100}% ${(s * (k + 5) * 53) % 100}%`
      return (
        `.page{background-image:` +
        `radial-gradient(circle at ${at(0)},var(--accent) 0 3px,transparent 4px),` +
        `radial-gradient(circle at ${at(1)},var(--primary) 0 2px,transparent 3px),` +
        `radial-gradient(circle at ${at(2)},var(--accent) 0 2px,transparent 3px);` +
        `background-size:140px 160px,110px 130px,90px 120px}`
      )
    }
    case 'line-art':
      return `.deco-rule{height:10px;background:repeating-linear-gradient(135deg,var(--primary) 0 2px,transparent 2px 8px);opacity:.5}`
    case 'grain':
      return `.page{background-image:radial-gradient(color-mix(in srgb,var(--text) 7%,transparent) 1px,transparent 1px);background-size:5px 5px}`
    case 'none':
      return ''
  }
}

function motionCss(design: DesignSpec): string {
  if (design.motion !== 'subtle') return ''
  // Only opacity and transform, and only when the visitor has not asked for less motion.
  return (
    `@media (prefers-reduced-motion:no-preference){` +
    `@keyframes sz-rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}` +
    `.rise{animation:sz-rise .6s ease-out both}.rise:nth-child(2){animation-delay:.08s}.rise:nth-child(3){animation-delay:.16s}}`
  )
}

export interface BaseCssOptions {
  /** Heading and body resolve to the same font face, so headings reuse the body family. */
  headingSharesBody: boolean
}

export function baseCss(design: DesignSpec, options: BaseCssOptions): string {
  const p = design.palette
  const { heading, body } = design.fontPair
  const headingStack = options.headingSharesBody ? fontStack(body, 'body') : fontStack(heading, 'heading')
  return `:root{--bg:${p.bg};--surface:${p.surface};--primary:${p.primary};--accent:${p.accent};--text:${p.text};
--on-primary:${inkOn(p.primary)};--on-accent:${inkOn(p.accent)};
--font-h:${headingStack};--font-b:${fontStack(body, 'body')};--fw-h:${fontWeight(heading, 'heading')}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-b);font-size:16px;line-height:1.6;overflow-wrap:anywhere;padding-bottom:calc(76px + env(safe-area-inset-bottom))}
img{display:block;max-width:100%;height:auto}
h1,h2,h3,p{margin:0}
.page{max-width:480px;margin:0 auto;overflow-x:hidden;min-height:100vh}
.fh{font-family:var(--font-h);font-weight:var(--fw-h);line-height:1.25}
.price{display:inline-flex;flex-wrap:wrap;align-items:baseline;max-width:100%}.price>span{white-space:nowrap}
.price-unit{font-size:max(15px,.8em);opacity:.75}
.price-unit::before{content:"/"}
.tags{display:flex;flex-wrap:wrap;gap:6px;padding:0;margin:8px 0 0;list-style:none}
.tag{font-size:13px;line-height:1.4;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 18%,transparent)}
.claims{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none}
.claim{font-size:15px;padding:4px 12px;border-radius:999px;border:1px solid color-mix(in srgb,var(--primary) 45%,transparent)}
.shop-info{margin:24px 16px 0;padding:16px;border-radius:14px;background:var(--surface)}
.shop-info dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:15px}
.shop-info dl>div{display:contents}.shop-info dt{opacity:.7}.shop-info dd{margin:0;min-width:0}
.closing{margin:24px 16px 0;text-align:center;font-size:17px}
.footer{margin:24px 16px 0;padding:16px 0 24px;text-align:center;font-size:13px;line-height:1.7;opacity:.7}
.footer p{margin:0}
.actions{position:fixed;left:0;right:0;bottom:0;z-index:10;display:flex;gap:8px;justify-content:center;
padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--bg);background:color-mix(in srgb,var(--bg) 92%,transparent);
border-top:1px solid color-mix(in srgb,var(--text) 10%,transparent)}
.act{flex:1 1 0;max-width:160px;min-width:0;min-height:48px;display:flex;align-items:center;justify-content:center;
padding:0 10px;border:0;border-radius:12px;font:inherit;font-size:16px;text-decoration:none;cursor:pointer;
background:var(--primary);color:var(--on-primary)}
.act:nth-child(2){background:var(--accent);color:var(--on-accent)}
.act:focus-visible{outline:3px solid var(--text);outline-offset:2px}
.toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:20;
padding:8px 16px;border-radius:999px;background:#1a1a1a;color:#ffffff;font-size:15px}
.fix{margin:24px 16px 0;font-size:15px}
.fix summary{cursor:pointer;opacity:.75;text-decoration:underline;text-underline-offset:3px;min-height:44px;display:flex;align-items:center;justify-content:center;list-style:none}
.fix summary::-webkit-details-marker{display:none}
.fix form{display:grid;gap:10px;margin-top:8px;padding:16px;border-radius:14px;background:var(--surface)}
.fix label{display:grid;gap:4px}
.fix select,.fix input,.fix textarea{font:inherit;font-size:16px;color:var(--text);background:var(--bg);border:1px solid color-mix(in srgb,var(--text) 30%,transparent);border-radius:8px;padding:8px 10px;min-height:44px;max-width:100%;box-sizing:border-box;width:100%}
.fix button{font:inherit;min-height:44px;border:0;border-radius:10px;background:var(--primary);color:var(--on-primary)}
.fix-tip{margin:0;font-size:15px;opacity:.75}
.fix [hidden]{display:none}
#sz-fix-msg{margin:0}
${decorationCss(design)}
${motionCss(design)}`
}
