'use client'

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { FactSheet as FactSheetSchema } from '@/lib/core/schemas'
import type { FactItem, FactSheet } from '../../_lib/types'
import s from '../../shell.module.css'
import w from './wizard.module.css'

export type FactsEdit = Pick<FactSheet, 'shop' | 'items' | 'extraClaims'>
export type SubmitResult = { ok: true } | { ok: false; message: string }

const EditSchema = FactSheetSchema.pick({ shop: true, items: true, extraClaims: true })

type ShopKey = 'name' | 'phone' | 'wechat' | 'address' | 'hours' | 'mapUrl'
const SHOP_FIELDS: Array<{
  key: ShopKey
  label: string
  max: number
  type?: string
  hint?: string
}> = [
  { key: 'name', label: '店名', max: 30 },
  { key: 'phone', label: '电话', max: 20, type: 'tel' },
  { key: 'wechat', label: '微信号', max: 40 },
  { key: 'hours', label: '营业时间', max: 40 },
  { key: 'address', label: '地址', max: 80 },
  { key: 'mapUrl', label: '地图链接', max: 300, type: 'url', hint: '可选，以 https:// 开头' },
]

interface ItemDraft {
  key: string
  base: FactItem
  name: string
  amount: string
  unit: string
  spec: string
  description: string
}
interface Draft {
  shop: Record<ShopKey, string>
  items: ItemDraft[]
  claims: string
}

function toDraft(sheet: FactSheet): Draft {
  return {
    shop: {
      name: sheet.shop.name,
      phone: sheet.shop.phone ?? '',
      wechat: sheet.shop.wechat ?? '',
      address: sheet.shop.address ?? '',
      hours: sheet.shop.hours ?? '',
      mapUrl: sheet.shop.mapUrl ?? '',
    },
    items: sheet.items.map((item) => ({
      key: item.id,
      base: item,
      name: item.name,
      amount: item.price ? String(item.price.amount) : '',
      unit: item.price?.unit ?? '',
      spec: item.spec ?? '',
      description: item.description ?? '',
    })),
    claims: sheet.extraClaims.join('\n'),
  }
}

const opt = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim())

function toEdit(draft: Draft): FactsEdit {
  const shop = Object.fromEntries(
    Object.entries(draft.shop)
      .map(([k, v]) => [k, opt(v)] as const)
      .filter(([, v]) => v !== undefined),
  ) as FactsEdit['shop']
  return {
    shop: { ...shop, name: draft.shop.name.trim() },
    items: draft.items.map((d) => {
      const amount = d.amount.trim()
      const unit = opt(d.unit)
      const { id, tags, imageAssetIds, sources } = d.base
      return {
        id,
        tags,
        imageAssetIds,
        sources,
        name: d.name.trim(),
        ...(amount !== ''
          ? {
              price: {
                amount: Number(amount),
                currency: 'CNY' as const,
                ...(unit ? { unit } : {}),
              },
            }
          : {}),
        ...(opt(d.spec) ? { spec: opt(d.spec) } : {}),
        ...(opt(d.description) ? { description: opt(d.description) } : {}),
      }
    }),
    extraClaims: draft.claims
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean),
  }
}

const ISSUE_FIELD: Record<string, string> = {
  name: '名称',
  price: '价格',
  amount: '价格',
  unit: '单位',
  spec: '规格',
  description: '介绍',
  phone: '电话',
  wechat: '微信号',
  address: '地址',
  hours: '营业时间',
  mapUrl: '地图链接',
}

function issueMessage(path: (string | number)[]): string {
  if (path[0] === 'shop') {
    return path[1] === 'name'
      ? '店名不能为空，最多 30 个字'
      : `${ISSUE_FIELD[String(path[1])] ?? '店铺信息'}格式不对或太长`
  }
  if (path[0] === 'items' && typeof path[1] === 'number') {
    const field = ISSUE_FIELD[String(path.at(-1))] ?? ISSUE_FIELD[String(path[2])] ?? '信息'
    if (path.length === 1 || path[2] === undefined) return '至少需要一个商品，最多 30 个'
    return `第 ${path[1] + 1} 个商品的${field}填写有误（不能为空、格式或长度不符合要求）`
  }
  if (path[0] === 'items') return '至少需要一个商品，最多 30 个'
  if (path[0] === 'extraClaims') return '卖点最多 10 条，每条不超过 30 个字'
  return '请检查填写的内容'
}

interface FactsFormProps {
  sheet: FactSheet
  /** Fact paths the extraction read only from images (e.g. 'items[0].price', 'shop.phone'). */
  lowConfidence: ReadonlySet<string>
  /** Gets the edited facts, or null when nothing changed. */
  onSubmit: (edited: FactsEdit | null) => Promise<SubmitResult>
  /** Rendered just above the submit button (the style preferences). */
  beforeSubmit?: ReactNode
}

export function FactsForm({ sheet, lowConfidence, onSubmit, beforeSubmit }: FactsFormProps) {
  const uid = useId()
  const initial = useMemo(() => toDraft(sheet), [sheet])
  const [draft, setDraft] = useState<Draft>(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const dragFrom = useRef<number | null>(null)
  const added = useRef(0)

  // Image-read fields, tracked by item id so the marks follow the item when it is moved.
  const flagged = useMemo(() => {
    const set = new Set<string>()
    sheet.items.forEach((item, i) => {
      for (const f of ['name', 'price', 'spec', 'description'] as const) {
        if (item.sources[f] === 'image_ocr' || lowConfidence.has(`items[${i}].${f}`))
          set.add(`${item.id}.${f}`)
      }
    })
    for (const k of SHOP_FIELDS) if (lowConfidence.has(`shop.${k.key}`)) set.add(`shop.${k.key}`)
    return set
  }, [sheet, lowConfidence])

  const setShop = (key: ShopKey, value: string) =>
    setDraft((d) => ({ ...d, shop: { ...d.shop, [key]: value } }))
  const setItem = (index: number, patch: Partial<ItemDraft>) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    }))

  function move(from: number, to: number) {
    if (to < 0 || to >= draft.items.length || from === to) return
    setDraft((d) => {
      const items = [...d.items]
      const [it] = items.splice(from, 1)
      items.splice(to, 0, it!)
      return { ...d, items }
    })
    setAnnounce(`「${draft.items[from]?.name || '商品'}」已移到第 ${to + 1} 位`)
  }

  function addItem() {
    added.current += 1
    const id = `new-${Date.now().toString(36)}-${added.current}`
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          key: id,
          base: { id, name: '', tags: [], imageAssetIds: [], sources: {} },
          name: '',
          amount: '',
          unit: '',
          spec: '',
          description: '',
        },
      ],
    }))
    setAnnounce(`已添加第 ${draft.items.length + 1} 个商品`)
  }

  function removeItem(index: number) {
    const name = draft.items[index]?.name || `第 ${index + 1} 个商品`
    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))
    setAnnounce(`已删除「${name}」`)
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const edit = toEdit(draft)
    const parsed = EditSchema.safeParse(edit)
    if (!parsed.success) {
      setError(issueMessage(parsed.error.issues[0]?.path ?? []))
      return
    }
    const changed = JSON.stringify(edit) !== JSON.stringify(toEdit(initial))
    setPending(true)
    const result = await onSubmit(changed ? parsed.data : null)
    if (!result.ok) {
      setError(result.message)
      setPending(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className={w.factsForm} noValidate>
      <fieldset className={`${s.card} ${w.fieldset}`}>
        <legend className={w.legend}>店铺信息</legend>
        <div className={w.shopGrid}>
          {SHOP_FIELDS.map((f) => (
            <Flagged key={f.key} on={flagged.has(`shop.${f.key}`)} id={`${uid}-shop-${f.key}`}>
              <label htmlFor={`${uid}-shop-${f.key}`} className={s.label}>
                {f.label}
                {f.key === 'name' && <span aria-hidden="true"> *</span>}
              </label>
              <input
                id={`${uid}-shop-${f.key}`}
                className={s.input}
                type={f.type ?? 'text'}
                inputMode={f.type === 'tel' ? 'tel' : undefined}
                maxLength={f.max}
                required={f.key === 'name'}
                value={draft.shop[f.key]}
                onChange={(e) => setShop(f.key, e.target.value)}
                aria-describedby={
                  [
                    flagged.has(`shop.${f.key}`) ? `${uid}-shop-${f.key}-flag` : '',
                    f.hint ? `${uid}-shop-${f.key}-hint` : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
              />
              {f.hint && (
                <span id={`${uid}-shop-${f.key}-hint`} className={s.hint}>
                  {f.hint}
                </span>
              )}
            </Flagged>
          ))}
        </div>
      </fieldset>

      <fieldset className={`${s.card} ${w.fieldset}`}>
        <legend className={w.legend}>商品（{draft.items.length}）</legend>
        <p className={`${s.small} ${s.muted} ${w.legendNote}`}>
          拖动左侧把手或用「上移 / 下移」调整顺序，页面按这个顺序展示。
        </p>
        <ol className={w.items}>
          {draft.items.map((item, i) => {
            const fid = (f: string) => `${uid}-item-${item.key}-${f}`
            const flag = (f: string) => flagged.has(`${item.base.id}.${f}`)
            return (
              <li
                key={item.key}
                className={w.item}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragFrom.current !== null) move(dragFrom.current, i)
                  dragFrom.current = null
                }}
              >
                <div className={w.itemHead}>
                  <span
                    className={w.handle}
                    draggable
                    onDragStart={() => {
                      dragFrom.current = i
                    }}
                    aria-hidden="true"
                    title="拖动排序"
                  >
                    ⋮⋮
                  </span>
                  <span className={w.itemTitle}>商品 {i + 1}</span>
                  <span className={w.itemTools}>
                    <button
                      type="button"
                      className={`${s.btnGhost} ${s.btnSmall}`}
                      onClick={() => move(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`上移第 ${i + 1} 个商品`}
                    >
                      上移
                    </button>
                    <button
                      type="button"
                      className={`${s.btnGhost} ${s.btnSmall}`}
                      onClick={() => move(i, i + 1)}
                      disabled={i === draft.items.length - 1}
                      aria-label={`下移第 ${i + 1} 个商品`}
                    >
                      下移
                    </button>
                    <button
                      type="button"
                      className={`${s.btnGhost} ${s.btnSmall}`}
                      onClick={() => removeItem(i)}
                      disabled={draft.items.length === 1}
                      aria-label={`删除第 ${i + 1} 个商品`}
                    >
                      删除
                    </button>
                  </span>
                </div>
                <div className={w.itemGrid}>
                  <Flagged on={flag('name')} id={fid('name')} wide>
                    <label htmlFor={fid('name')} className={s.label}>
                      名称<span aria-hidden="true"> *</span>
                    </label>
                    <input
                      id={fid('name')}
                      className={s.input}
                      required
                      maxLength={30}
                      value={item.name}
                      onChange={(e) => setItem(i, { name: e.target.value })}
                      aria-describedby={flag('name') ? `${fid('name')}-flag` : undefined}
                    />
                  </Flagged>
                  <Flagged
                    on={flag('price')}
                    id={fid('price')}
                    note={item.base.price ? undefined : '文字里有价格没认出来，请核对补填'}
                  >
                    <label htmlFor={fid('price')} className={s.label}>
                      价格（元）
                    </label>
                    <input
                      id={fid('price')}
                      className={s.input}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.01}
                      value={item.amount}
                      onChange={(e) => setItem(i, { amount: e.target.value })}
                      aria-describedby={flag('price') ? `${fid('price')}-flag` : undefined}
                    />
                  </Flagged>
                  <div className={s.field}>
                    <label htmlFor={fid('unit')} className={s.label}>
                      单位
                    </label>
                    <input
                      id={fid('unit')}
                      className={s.input}
                      maxLength={8}
                      value={item.unit}
                      onChange={(e) => setItem(i, { unit: e.target.value })}
                      placeholder="可不填，如 杯 / 个"
                    />
                  </div>
                  <Flagged on={flag('spec')} id={fid('spec')}>
                    <label htmlFor={fid('spec')} className={s.label}>
                      规格
                    </label>
                    <input
                      id={fid('spec')}
                      className={s.input}
                      maxLength={40}
                      value={item.spec}
                      onChange={(e) => setItem(i, { spec: e.target.value })}
                      placeholder="例如：约 450g"
                      aria-describedby={flag('spec') ? `${fid('spec')}-flag` : undefined}
                    />
                  </Flagged>
                  <Flagged on={flag('description')} id={fid('description')} wide>
                    <label htmlFor={fid('description')} className={s.label}>
                      介绍
                    </label>
                    <input
                      id={fid('description')}
                      className={s.input}
                      maxLength={120}
                      value={item.description}
                      onChange={(e) => setItem(i, { description: e.target.value })}
                      aria-describedby={
                        flag('description') ? `${fid('description')}-flag` : undefined
                      }
                    />
                  </Flagged>
                </div>
              </li>
            )
          })}
        </ol>
        <button
          type="button"
          className={s.btn}
          onClick={addItem}
          disabled={draft.items.length >= 30}
        >
          ＋ 添加商品
        </button>
      </fieldset>

      <div className={`${s.card} ${s.field}`}>
        <label htmlFor={`${uid}-claims`} className={s.label}>
          想强调的卖点
        </label>
        <textarea
          id={`${uid}-claims`}
          className={s.textarea}
          rows={3}
          value={draft.claims}
          onChange={(e) => setDraft((d) => ({ ...d, claims: e.target.value }))}
          aria-describedby={`${uid}-claims-h`}
        />
        <span id={`${uid}-claims-h`} className={s.hint}>
          每行一条，最多 10 条。文案只会引用这里和上面填写的内容。
        </span>
      </div>

      {beforeSubmit}
      <p role="status" aria-live="polite" className={s.srOnly}>
        {announce}
      </p>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <div className={w.actions}>
        <button type="submit" className={s.btnPrimary} disabled={pending}>
          {pending ? '正在保存并开始生成…' : '确认无误，开始生成'}
        </button>
      </div>
    </form>
  )
}

/** A field box; image-read values get a yellow background and a spoken note. */
function Flagged({
  on,
  id,
  wide,
  note = 'AI 从图片识别，请核对',
  children,
}: {
  on: boolean
  id: string
  wide?: boolean
  /** Why the field is flagged; by default it was read only from an image. */
  note?: string
  children: ReactNode
}) {
  return (
    <div className={`${s.field} ${on ? w.flagged : ''} ${wide ? w.wide : ''}`}>
      {children}
      {on && (
        <span id={`${id}-flag`} className={w.flagNote}>
          {note}
        </span>
      )}
    </div>
  )
}
