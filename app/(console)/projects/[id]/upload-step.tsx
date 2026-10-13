'use client'

import { useEffect, useId, useRef, useState, type DragEvent } from 'react'
import type { SWRResponse } from 'swr'
import { api, messageOf, postJson, uploadWithProgress } from '../../_lib/api'
import type { AssetEntry, ExtractResponse } from '../../_lib/types'
import s from '../../shell.module.css'
import { StepHeading } from './step-heading'
import w from './wizard.module.css'

interface UploadStepProps {
  projectId: string
  assets: SWRResponse<{ assets: AssetEntry[] }>
  /** True when the material changed since the last extraction (or none was run yet). */
  needsExtract: boolean
  onMaterialChanged: () => void
  onExtracted: (result: ExtractResponse) => void
  onSkip: () => void
}

const MAX_TEXT = 2000

export function UploadStep(props: UploadStepProps) {
  const { projectId, assets } = props
  const base = `/api/projects/${encodeURIComponent(projectId)}`
  const inputRef = useRef<HTMLInputElement>(null)
  const textId = useId()
  const [progress, setProgress] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState<'extract' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  const list = assets.data?.assets ?? []
  const images = list.filter((a) => a.kind === 'image')
  const savedText = list
    .filter((a) => a.kind === 'text')
    .map((a) => a.text ?? '')
    .join('\n')
  const [text, setText] = useState<string | null>(null)
  const currentText = text ?? savedText
  // Show the saved notes once they load, unless the merchant already started typing.
  useEffect(() => {
    if (text === null && assets.data) setText(savedText)
  }, [assets.data, savedText, text])

  async function upload(files: File[]) {
    const picked = files.filter(
      (f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name),
    )
    if (picked.length === 0) {
      setError('请选择图片文件')
      return
    }
    setError(null)
    setProgress(0)
    setStatus(`正在上传 ${picked.length} 张图片`)
    const form = new FormData()
    for (const f of picked) form.append('images', f)
    try {
      await uploadWithProgress(`${base}/assets`, form, setProgress).promise
      props.onMaterialChanged()
      setStatus(`已上传 ${picked.length} 张图片`)
    } catch (err) {
      setError(messageOf(err))
      setStatus('')
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
      await assets.mutate()
    }
  }

  async function remove(id: string, index: number) {
    setError(null)
    try {
      await api(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' })
      props.onMaterialChanged()
      setStatus(`已删除第 ${index + 1} 张图片`)
    } catch (err) {
      setError(messageOf(err))
    }
    await assets.mutate()
  }

  /** Replaces the stored notes when the merchant changed them; true when something changed. */
  async function saveText(): Promise<boolean> {
    const next = currentText.trim()
    if (next === savedText.trim()) return false
    for (const a of list.filter((x) => x.kind === 'text')) {
      await api(`/api/assets/${encodeURIComponent(a.id)}`, { method: 'DELETE' })
    }
    if (next) {
      const form = new FormData()
      form.append('text', next)
      await uploadWithProgress(`${base}/assets`, form, () => undefined).promise
    }
    await assets.mutate()
    return true
  }

  async function next() {
    setError(null)
    setBusy('extract')
    try {
      const changed = await saveText()
      if (!changed && !props.needsExtract) {
        props.onSkip()
        return
      }
      setStatus('AI 正在识别商品信息')
      props.onExtracted(await postJson<ExtractResponse>(`${base}/extract`))
    } catch (err) {
      setError(messageOf(err))
      setStatus('')
    } finally {
      setBusy(null)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (progress === null) void upload(Array.from(e.dataTransfer.files))
  }

  const canContinue = images.length > 0 || currentText.trim().length > 0

  return (
    <div className={w.stepGrid}>
      <div>
        <StepHeading>上传素材</StepHeading>
        <p className={s.muted}>拍几张商品照片，或者直接上传菜单、价目表的图片。</p>

        <div
          className={w.drop}
          data-dragging={dragging}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className={w.dropTitle}>把图片拖到这里</p>
          <p className={`${s.small} ${s.muted}`}>支持手机拍照、相册图片，每张不超过 15MB</p>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={() => inputRef.current?.click()}
            disabled={progress !== null}
          >
            选择图片
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            aria-label="选择图片"
            data-testid="image-input"
            onChange={(e) => void upload(Array.from(e.target.files ?? []))}
          />
        </div>

        {progress !== null && (
          <div className={w.progressWrap}>
            <label htmlFor={`${textId}-p`} className={s.small}>
              正在上传 {Math.round(progress * 100)}%
            </label>
            <progress id={`${textId}-p`} max={1} value={progress} className={w.progress} />
          </div>
        )}

        {images.length > 0 && (
          <ul className={w.thumbs} aria-label="已上传的图片">
            {images.map((a, i) => (
              <li key={a.id} className={w.thumbItem}>
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API image */}
                <img src={a.thumbUrl} alt={`第 ${i + 1} 张图片`} width={120} height={120} />
                <button
                  type="button"
                  className={w.thumbDelete}
                  onClick={() => void remove(a.id, i)}
                  aria-label={`删除第 ${i + 1} 张图片`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className={s.field}>
          <label htmlFor={textId} className={s.label}>
            文字说明
          </label>
          <textarea
            id={textId}
            className={s.textarea}
            rows={7}
            maxLength={MAX_TEXT}
            value={currentText}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              '例如：\n拿铁 18 元一杯，燕麦奶可选\n电话 138 0013 8000，营业 8:00-20:00\n每天现烤，不加植脂末'
            }
            aria-describedby={`${textId}-h`}
          />
          <p id={`${textId}-h`} className={s.hint}>
            写下价格、规格、联系方式和你想强调的卖点。这里写的内容优先于图片识别。
          </p>
        </div>

        <p role="status" aria-live="polite" className={`${s.small} ${s.muted}`}>
          {busy === 'extract' && status ? `${status}…` : status}
        </p>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        <div className={w.actions}>
          <button
            type="button"
            className={s.btnPrimary}
            disabled={!canContinue || busy !== null || progress !== null}
            onClick={() => void next()}
          >
            {busy === 'extract' ? 'AI 正在识别…' : '下一步：识别商品信息'}
          </button>
        </div>
      </div>
    </div>
  )
}
