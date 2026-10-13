'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { ClientError, messageOf } from '../../_lib/api'
import type { AssetEntry, ExtractResponse, ProjectDetail, VersionSummary } from '../../_lib/types'
import { StateBadge } from '../../state-badge'
import s from '../../shell.module.css'
import w from './wizard.module.css'
import { CorrectionsTab } from './corrections-tab'
import { FactsStep } from './facts-step'
import { GenerateStep } from './generate-step'
import { PreviewStep } from './preview-step'
import { PublishStep } from './publish-step'
import { SettingsTab } from './settings-tab'
import { Stepper, STEPS, type Step } from './stepper'
import { UploadStep } from './upload-step'

type Tab = 'make' | 'corrections' | 'settings'

function isStep(v: string | null): v is Step {
  return v !== null && (STEPS as readonly string[]).includes(v)
}

/** URL query state: the current tab, step, job and selected version survive a reload. */
function useQuery() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const set = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v === null) next.delete(k)
        else next.set(k, v)
      }
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, pathname, router],
  )
  return { params, set }
}

export function Workspace({ projectId, publicBase }: { projectId: string; publicBase: string }) {
  const { params, set } = useQuery()
  const base = `/api/projects/${encodeURIComponent(projectId)}`
  const project = useSWR<ProjectDetail>(base)
  const assets = useSWR<{ assets: AssetEntry[] }>(`${base}/assets`)
  const versions = useSWR<{ versions: VersionSummary[] }>(`${base}/versions`)
  // Extraction details (conflicts) only come with the extract response; they live for this visit.
  const [extract, setExtract] = useState<ExtractResponse | null>(null)
  const [materialChanged, setMaterialChanged] = useState(false)

  const tab: Tab =
    params.get('tab') === 'corrections'
      ? 'corrections'
      : params.get('tab') === 'settings'
        ? 'settings'
        : 'make'
  const detail = project.data
  const hasMaterial = (assets.data?.assets.length ?? 0) > 0
  const hasVersions = (versions.data?.versions.length ?? 0) > 0

  const reachable: Record<Step, boolean> = {
    upload: true,
    facts: hasMaterial || detail?.facts != null,
    generate: detail?.facts?.confirmed === true,
    preview: hasVersions,
    publish: hasVersions,
  }
  const done: Record<Step, boolean> = {
    upload: hasMaterial,
    facts: detail?.facts?.confirmed === true,
    generate: hasVersions,
    preview: hasVersions,
    publish: detail?.state === 'live',
  }

  const requested = params.get('step')
  const fallback: Step =
    detail?.state === 'live'
      ? 'publish'
      : detail?.state === 'generating'
        ? 'generate'
        : hasVersions
          ? 'preview'
          : detail?.facts
            ? 'facts'
            : 'upload'
  const step: Step = isStep(requested) ? requested : fallback

  // Move focus to the step heading on step changes, so keyboard and screen reader users land
  // on the new content instead of the button they just pressed.
  const headingRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.querySelector<HTMLElement>('h2')?.focus()
  }, [step])

  const go = useCallback(
    (next: Step, extra: Record<string, string | null> = {}) => set({ step: next, ...extra }),
    [set],
  )

  if (project.error) {
    const gone = project.error instanceof ClientError && project.error.status === 404
    return (
      <div>
        <p role="alert" className={s.error}>
          {gone ? '这个宣传页不存在或已被删除' : messageOf(project.error)}
        </p>
        <Link href="/" className={s.btn}>
          返回我的宣传页
        </Link>
      </div>
    )
  }
  if (!detail) return <p className={s.muted}>正在加载…</p>

  return (
    <div className={w.workspace}>
      <div className={w.top}>
        <div className={w.titleRow}>
          <Link href="/" className={w.back}>
            ← 我的宣传页
          </Link>
          <h1 className={s.h1}>{detail.title}</h1>
          <StateBadge state={detail.state} />
        </div>
        <nav aria-label="宣传页功能" className={w.tabs}>
          <Link
            href={`/projects/${projectId}`}
            className={w.tab}
            aria-current={tab === 'make' ? 'page' : undefined}
          >
            制作
          </Link>
          <Link href={`/projects/${projectId}/stats`} className={w.tab}>
            访问统计
          </Link>
          <Link
            href={`/projects/${projectId}?tab=corrections`}
            className={w.tab}
            aria-current={tab === 'corrections' ? 'page' : undefined}
          >
            顾客纠错
          </Link>
          <Link
            href={`/projects/${projectId}?tab=settings`}
            className={w.tab}
            aria-current={tab === 'settings' ? 'page' : undefined}
          >
            设置
          </Link>
        </nav>
      </div>

      {tab === 'corrections' && <CorrectionsTab />}
      {tab === 'settings' && (
        <SettingsTab
          project={detail}
          onChanged={() => {
            void project.mutate()
          }}
        />
      )}
      {tab === 'make' && (
        <>
          <Stepper current={step} reachable={reachable} done={done} onSelect={(st) => go(st)} />
          <section ref={headingRef} className={w.stepBody} aria-label="当前步骤">
            {step === 'upload' && (
              <UploadStep
                projectId={projectId}
                assets={assets}
                needsExtract={materialChanged || detail.facts === null}
                onMaterialChanged={() => setMaterialChanged(true)}
                onExtracted={(result) => {
                  setExtract(result)
                  setMaterialChanged(false)
                  void project.mutate()
                  go('facts')
                }}
                onSkip={() => go('facts')}
              />
            )}
            {step === 'facts' && (
              <FactsStep
                projectId={projectId}
                extract={extract}
                onExtracted={(result) => {
                  setExtract(result)
                  void project.mutate()
                }}
                onStarted={(jobId) => {
                  void project.mutate()
                  go('generate', { job: jobId, v: null })
                }}
              />
            )}
            {step === 'generate' && (
              <GenerateStep
                projectId={projectId}
                jobId={params.get('job')}
                state={detail.state}
                onFinished={(ok) => {
                  void project.mutate()
                  void versions.mutate().then(() => go(ok ? 'preview' : 'facts', { v: null }))
                }}
                onRestarted={(jobId) => go('generate', { job: jobId })}
              />
            )}
            {step === 'preview' && (
              <PreviewStep
                projectId={projectId}
                versions={versions}
                publishedVersionId={detail.publishedVersionId}
                selectedId={params.get('v')}
                onSelect={(id) => set({ v: id })}
                onRestyle={(jobId) => {
                  void project.mutate()
                  go('generate', { job: jobId, v: null })
                }}
                onPublish={(id) => go('publish', { v: id })}
              />
            )}
            {step === 'publish' && (
              <PublishStep
                project={detail}
                versions={versions.data?.versions ?? []}
                selectedId={params.get('v')}
                publicBase={publicBase}
                onPublished={() => void project.mutate()}
                onBackToPreview={() => go('preview')}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}
