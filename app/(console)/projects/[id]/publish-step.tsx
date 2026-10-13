'use client'

import { useId, useState } from 'react'
import useSWR from 'swr'
import { messageOf, postJson } from '../../_lib/api'
import { formatPrice, LAYOUT_LABEL } from '../../_lib/labels'
import type { FactsResponse, ProjectDetail, PublishLinks, VersionSummary } from '../../_lib/types'
import s from '../../shell.module.css'
import { LongImage } from './long-image'
import { StepHeading } from './step-heading'
import w from './wizard.module.css'

interface PublishStepProps {
  project: ProjectDetail
  versions: VersionSummary[]
  selectedId: string | null
  publicBase: string
  onPublished: () => void
  onBackToPreview: () => void
}

export function PublishStep({
  project,
  versions,
  selectedId,
  publicBase,
  onPublished,
  onBackToPreview,
}: PublishStepProps) {
  const base = `/api/projects/${encodeURIComponent(project.id)}`
  const facts = useSWR<FactsResponse>(`${base}/facts`)
  const checkId = useId()
  const [checked, setChecked] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [links, setLinks] = useState<PublishLinks | null>(null)

  const target = versions.find((v) => v.id === selectedId) ?? versions[0]
  const live = project.state === 'live'
  const isLiveVersion = live && target?.id === project.publishedVersionId
  const sheet = facts.data?.factSheet
  // The recap shows the latest facts, so only a version built from exactly those may be published.
  const stale =
    sheet && target
      ? !facts.data?.confirmed
        ? '商品信息有改动还没有确认。请先回到「核对信息」确认，再生成新的一版。'
        : target.factRevision !== sheet.revision
          ? '这一版是按之前的商品信息生成的，和下面列出的信息不一致。请回到预览选最新的一版，或换一个风格重新生成。'
          : null
      : null
  const shownLinks: PublishLinks | null =
    links ??
    (live
      ? {
          url: `${publicBase}/p/${project.slug}/`,
          qrPngUrl: `${base}/qr?format=png`,
          qrSvgUrl: `${base}/qr?format=svg`,
        }
      : null)

  async function publish() {
    if (!target || !checked) return
    setPending(true)
    setError(null)
    try {
      const res = await postJson<PublishLinks>(`${base}/publish`, {
        versionId: target.id,
        factsConfirmed: true,
      })
      setLinks(res)
      setChecked(false)
      onPublished()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setPending(false)
    }
  }

  if (!target) {
    return (
      <div>
        <StepHeading>发布</StepHeading>
        <p className={s.muted}>还没有可以发布的版本，请先生成。</p>
      </div>
    )
  }

  const index = versions.indexOf(target)
  return (
    <div className={w.publishGrid}>
      <div>
        <StepHeading>{isLiveVersion ? '已发布' : '发布前最后核对'}</StepHeading>
        <p className={s.muted}>
          要发布的是第 {versions.length - index} 版（{LAYOUT_LABEL[target.templateId] ?? '版式'}）。
          <button type="button" className={w.linkBtn} onClick={onBackToPreview}>
            换一版
          </button>
        </p>

        {facts.error && (
          <p role="alert" className={s.error}>
            {messageOf(facts.error)}
          </p>
        )}
        {sheet && (
          <dl className={`${s.card} ${w.recap}`}>
            <div>
              <dt>店名</dt>
              <dd>{sheet.shop.name}</dd>
            </div>
            <div>
              <dt>电话</dt>
              <dd>{sheet.shop.phone ?? '未填写'}</dd>
            </div>
            {sheet.items.map((item, i) => (
              <div key={item.id}>
                <dt>商品 {i + 1}</dt>
                <dd>
                  {item.name}
                  <span className={w.recapPrice}>
                    {item.price
                      ? `${formatPrice(item.price.amount)} 元 / ${item.price.unit}`
                      : '未标价'}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        )}

        {!isLiveVersion && stale && (
          <p role="alert" className={s.notice}>
            {stale}
          </p>
        )}
        {!isLiveVersion && !stale && (
          <>
            <div className={w.confirm}>
              <input
                id={checkId}
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              <label htmlFor={checkId}>我已核对以上信息无误</label>
            </div>
            {error && (
              <p role="alert" className={s.error}>
                {error}
              </p>
            )}
            <div className={w.actions}>
              <button
                type="button"
                className={s.btnPrimary}
                disabled={!checked || pending || !sheet}
                onClick={() => void publish()}
              >
                {pending ? '正在发布…' : live ? '发布这一版（替换线上版本）' : '发布'}
              </button>
            </div>
          </>
        )}
      </div>

      {shownLinks && (
        <PublishedPanel
          links={shownLinks}
          shopName={project.title}
          projectId={project.id}
          publishedVersionId={links ? target.id : project.publishedVersionId}
          justPublished={links !== null}
        />
      )}
    </div>
  )
}

interface PublishedPanelProps {
  links: PublishLinks
  shopName: string
  projectId: string
  publishedVersionId: string | null
  justPublished: boolean
}

function PublishedPanel({
  links,
  shopName,
  projectId,
  publishedVersionId,
  justPublished,
}: PublishedPanelProps) {
  const urlId = useId()
  const [copied, setCopied] = useState<string>('')

  async function copy() {
    try {
      await navigator.clipboard.writeText(links.url)
      setCopied('已复制链接')
    } catch {
      const input = document.getElementById(urlId) as HTMLInputElement | null
      input?.select()
      setCopied('请长按或按 Ctrl+C 复制')
    }
  }

  return (
    <section className={`${s.card} ${w.published}`} aria-labelledby={`${urlId}-h`}>
      <h3 id={`${urlId}-h`} className={w.publishedTitle}>
        {justPublished ? '发布成功，顾客现在可以扫码查看' : '宣传页正在上线'}
      </h3>
      {justPublished && (
        <p role="status" className={s.srOnly}>
          发布成功
        </p>
      )}

      <div className={s.field}>
        <label htmlFor={urlId} className={s.label}>
          宣传页链接
        </label>
        <div className={w.urlRow}>
          <input
            id={urlId}
            className={s.input}
            readOnly
            value={links.url}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className={s.btn} onClick={() => void copy()}>
            复制
          </button>
        </div>
        <p role="status" aria-live="polite" className={s.hint}>
          {copied}
        </p>
        <a href={links.url} target="_blank" rel="noopener noreferrer" className={w.openLink}>
          打开宣传页（新窗口）
        </a>
      </div>

      <div className={w.qr}>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated QR image */}
        <img src={links.qrSvgUrl} alt={`${shopName}宣传页二维码`} width={180} height={180} />
        <div>
          <p className={s.small}>微信扫一扫，如有提示请点「继续访问」；也可用手机相机扫码。</p>
          <div className={s.row}>
            <a
              className={`${s.btn} ${s.btnSmall}`}
              href={links.qrPngUrl}
              download={`${shopName}-二维码.png`}
            >
              下载二维码 PNG
            </a>
            <a
              className={`${s.btn} ${s.btnSmall}`}
              href={links.qrSvgUrl}
              download={`${shopName}-二维码.svg`}
            >
              下载二维码 SVG
            </a>
          </div>
        </div>
      </div>

      <LongImage projectId={projectId} shopName={shopName} versionKey={publishedVersionId ?? ''} />
    </section>
  )
}
