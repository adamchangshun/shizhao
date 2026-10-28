'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { api, ClientError, messageOf, postJson } from '../../_lib/api'
import type { ExtractResponse, FactConflict, FactsResponse, FactSheet } from '../../_lib/types'
import s from '../../shell.module.css'
import { FactsForm, type FactsEdit, type SubmitResult } from './facts-form'
import { briefRequest, StylePreferences, type StyleBriefDraft } from './generate-step'
import { StepHeading } from './step-heading'
import w from './wizard.module.css'

interface FactsStepProps {
  projectId: string
  extract: ExtractResponse | null
  onExtracted: (result: ExtractResponse) => void
  onStarted: (jobId: string) => void
  brief: StyleBriefDraft
  onBriefChange: (next: StyleBriefDraft) => void
}

const SHOP_FIELD: Record<string, string> = {
  name: '店名',
  phone: '电话',
  wechat: '微信',
  address: '地址',
  hours: '营业时间',
  mapUrl: '地图链接',
}
const ITEM_FIELD: Record<string, string> = {
  name: '名称',
  price: '价格',
  spec: '规格',
  description: '介绍',
}

/** 'items[0].price' → '第 1 个商品的价格'; 'shop.phone' → '电话'. */
export function pathLabel(path: string): string {
  const item = /^items\[(\d+)\]\.(\w+)/.exec(path)
  if (item) return `第 ${Number(item[1]) + 1} 个商品的${ITEM_FIELD[item[2]!] ?? '信息'}`
  const shop = /^shop\.(\w+)/.exec(path)
  if (shop) return SHOP_FIELD[shop[1]!] ?? '店铺信息'
  return '信息'
}

export function FactsStep({
  projectId,
  extract,
  onExtracted,
  onStarted,
  brief,
  onBriefChange,
}: FactsStepProps) {
  const base = `/api/projects/${encodeURIComponent(projectId)}`
  const facts = useSWR<FactsResponse>(`${base}/facts`)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [briefInvalid, setBriefInvalid] = useState(false)

  async function runExtract() {
    setExtracting(true)
    setError(null)
    try {
      const result = await postJson<ExtractResponse>(`${base}/extract`)
      onExtracted(result)
      await facts.mutate({ factSheet: result.factSheet, confirmed: false }, { revalidate: false })
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setExtracting(false)
    }
  }

  /** Save (if edited) → confirm → start generating. */
  async function submit(sheet: FactSheet, edited: FactsEdit | null): Promise<SubmitResult> {
    const request = briefRequest(brief)
    setBriefInvalid(!request.ok)
    if (!request.ok) return request
    try {
      let revision = sheet.revision
      if (edited) {
        const saved = await api<{ factSheet: FactSheet }>(`${base}/facts`, {
          method: 'PUT',
          body: JSON.stringify({ ...edited, baseRevision: sheet.revision }),
        })
        revision = saved.factSheet.revision
        await facts.mutate({ factSheet: saved.factSheet, confirmed: false }, { revalidate: false })
      }
      await postJson(`${base}/facts/confirm`, { revision })
      const { jobId } = await postJson<{ jobId: string }>(`${base}/jobs`, request.body)
      onStarted(jobId)
      return { ok: true }
    } catch (err) {
      if (err instanceof ClientError && err.code === 'facts_changed') await facts.mutate()
      return { ok: false, message: messageOf(err) }
    }
  }

  const sheet = facts.data?.factSheet ?? null
  const conflicts: FactConflict[] =
    extract && sheet && extract.factSheet.revision === sheet.revision ? extract.conflicts : []
  const lowConfidence = new Set(
    extract && sheet && extract.factSheet.revision === sheet.revision
      ? extract.lowConfidenceFields
      : [],
  )

  return (
    <div>
      <div className={w.stepIntro}>
        <div>
          <StepHeading>核对商品信息</StepHeading>
          <p className={s.muted}>
            页面上的店名、价格、电话都直接来自这里，AI 不会改动。请逐项核对。
          </p>
        </div>
        {sheet && (
          <button
            type="button"
            className={`${s.btn} ${s.btnSmall}`}
            onClick={() => void runExtract()}
            disabled={extracting}
          >
            {extracting ? '正在重新识别…' : '按素材重新识别'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {facts.error && (
        <p role="alert" className={s.error}>
          {messageOf(facts.error)}
        </p>
      )}
      {!facts.data && !facts.error && <p className={s.muted}>正在加载…</p>}

      {facts.data && !sheet && (
        <div className={s.card}>
          <p>还没有识别结果。</p>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={() => void runExtract()}
            disabled={extracting}
          >
            {extracting ? 'AI 正在识别…' : '识别商品信息'}
          </button>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className={s.notice} role="note" aria-labelledby="conflicts-h">
          <p id="conflicts-h" className={s.h3}>
            图片和文字有 {conflicts.length} 处不一致，已采用你写的文字：
          </p>
          <ul className={w.conflicts}>
            {conflicts.map((c) => (
              <li key={c.path}>
                {pathLabel(c.path)}：文字写的是「{c.textValue}」，图片里是「{c.imageValue}」
              </li>
            ))}
          </ul>
        </div>
      )}

      {sheet && (
        <FactsForm
          key={sheet.revision}
          sheet={sheet}
          lowConfidence={lowConfidence}
          onSubmit={(edited) => submit(sheet, edited)}
          beforeSubmit={
            <StylePreferences value={brief} onChange={onBriefChange} invalid={briefInvalid} />
          }
        />
      )}
    </div>
  )
}
