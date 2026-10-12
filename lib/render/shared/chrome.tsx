// Parts every template shares: shop details, action buttons, correction slot, footer.
import type { ReactElement } from 'react'
import type { Shop } from '@/lib/core/schemas'
import { telHref } from '../format'
import { ShopText } from './facts'

export function ShopInfo({ shop }: { shop: Shop }): ReactElement | null {
  const rows: Array<{ label: string; field: 'phone' | 'wechat' | 'address' | 'hours' }> = [
    { label: '营业时间', field: 'hours' },
    { label: '地址', field: 'address' },
    { label: '电话', field: 'phone' },
    { label: '微信', field: 'wechat' },
  ]
  const present = rows.filter(row => shop[row.field])
  if (present.length === 0) return null
  return (
    <section className="shop-info" aria-label="店铺信息">
      <dl>
        {present.map(row => (
          <div key={row.field}>
            <dt>{row.label}</dt>
            <ShopText shop={shop} field={row.field} as="dd" />
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Fixed bottom bar. A button exists only when its fact (and a safe link) exists. */
export function ActionBar({ shop, nav }: { shop: Shop; nav: string | null }): ReactElement | null {
  const tel = telHref(shop.phone)
  if (!tel && !shop.wechat && !nav) return null
  return (
    <nav className="actions" aria-label="联系商家">
      {tel && (
        <a className="act" href={tel} data-act="call">
          一键拨号
        </a>
      )}
      {shop.wechat && (
        <button className="act" type="button" data-act="wechat_copy" data-copy={shop.wechat}>
          复制微信号
        </button>
      )}
      {nav && (
        <a className="act" href={nav} data-act="navigate" rel="noopener noreferrer">
          地图导航
        </a>
      )}
    </nav>
  )
}

/** Toast shown by the inline script after copying; both messages live in markup, not script. */
export function CopyToast(): ReactElement {
  return (
    <p id="sz-toast" className="toast" role="status" aria-live="polite" hidden>
      <span>已复制</span>
      <span hidden>请长按微信号手动复制</span>
    </p>
  )
}

/** Slot above the footer reserved for the customer correction entry (module 15). */
export function CorrectionSlot(): ReactElement | null {
  return null
}

export function SiteFooter(): ReactElement {
  return (
    <footer className="footer">
      <p>本页由 AI 辅助设计，商品信息由商家提供</p>
      <p>由 实招 Shizhao 生成</p>
    </footer>
  )
}
