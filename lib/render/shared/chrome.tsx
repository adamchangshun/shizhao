// Parts every template shares: shop details, action buttons, correction slot, footer.
import type { ReactElement } from 'react'
import type { FactSheet, Shop } from '@/lib/core/schemas'
import { correctionOptions } from '@/lib/corrections/options'
import { telHref } from '../format'
import { ShopText } from './facts'

export function ShopInfo({ shop }: { shop: Shop }): ReactElement | null {
  const rows: Array<{ label: string; field: 'phone' | 'wechat' | 'address' | 'hours' }> = [
    { label: '营业时间', field: 'hours' },
    { label: '地址', field: 'address' },
    { label: '电话', field: 'phone' },
    { label: '微信', field: 'wechat' },
  ]
  const present = rows.filter((row) => shop[row.field])
  if (present.length === 0) return null
  return (
    <section className="shop-info" aria-label="店铺信息">
      <dl>
        {present.map((row) => (
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

/**
 * Customer correction entry above the footer (module 15). Expands in place via <details>; the
 * inline script submits it. Options come from correctionOptions(), the same list the API checks.
 * `api` is empty on previews, where submitting only shows the failure message.
 */
export function CorrectionSlot({ facts, api }: { facts: FactSheet; api: string }): ReactElement {
  return (
    <details className="fix">
      <summary>信息有误？告诉老板</summary>
      <form id="sz-fix" data-api={api} noValidate>
        <label>
          哪一项有误
          <select name="field">
            {correctionOptions(facts).map((o) => (
              <option key={o.path} value={o.path} data-nv={o.noValue ? '1' : undefined}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label id="sz-fix-v">
          正确的是
          <input name="sv" maxLength={100} autoComplete="off" />
        </label>
        <label>
          补充说明（选填）
          <textarea name="note" maxLength={200} rows={2} />
        </label>
        <p className="fix-tip">请勿填写你的手机号等个人信息</p>
        <button type="submit">提交</button>
        <p id="sz-fix-msg" role="status" aria-live="polite" hidden>
          <span>已转告老板，谢谢你</span>
          <span>提交失败，请稍后再试</span>
          <span>请勿填写个人信息</span>
          <span>请填写正确的内容</span>
        </p>
      </form>
    </details>
  )
}

export function SiteFooter(): ReactElement {
  return (
    <footer className="footer">
      <p>本页由 AI 辅助设计，商品信息由商家提供</p>
      <p>由 实招 Shizhao 生成</p>
    </footer>
  )
}
