// Module 15: a new version of the published page with corrected facts and nothing else changed.
// The design spec and copy are reused from the source version; copy that leaned on the corrected
// fact is cut, the rest is re-checked by the fact-guard rule layer. No model is called anywhere.
// Output is a staging directory that has passed the same DOM fact check as generated pages;
// the caller renames it into place inside the transaction that records and publishes it.
import fsp from 'node:fs/promises'
import path from 'node:path'
import { assetAbsPath, listProjectAssets } from '../assets'
import { buildFactCorpus, computeCopyRefs, guardWithRulesOnly } from '../copy'
import { ApiError } from '../core/errors'
import { newId } from '../core/ids'
import type { CopyDraft, CopyRefs, FactSheet } from '../core/schemas'
import type { VersionRow } from '../db/schema'
import { getEnv } from '../env'
import { renderPage } from '../render'
import { checkPage } from './check'
import { stagingDir, versionDir } from './files'

export type VersionContent = Pick<
  VersionRow,
  'factRevision' | 'designSpec' | 'copy' | 'copyRefs' | 'guard'
>

export interface StagedVersion {
  versionId: string
  /** Fully written and checked; rename to `finalDir` to make it a version directory. */
  staging: string
  finalDir: string
  content: VersionContent
}

export interface RerenderInput {
  projectId: string
  slug: string
  /** The published version whose design and copy are reused. */
  source: Pick<VersionRow, 'designSpec' | 'copy' | 'copyRefs'>
  /** The new, confirmed revision. */
  factSheet: FactSheet
  /** Fact path the correction changed, e.g. `items.<id>.price`. */
  correctedPath: string
  /** Unique key for the staging directory (the correction id). */
  stagingKey: string
  /** Renderer; tests wrap it. */
  render?: typeof renderPage
}

const PAGE_CHECK_FAILED = '页面信息核对未通过，未发布，请稍后重试'

/**
 * Removes copy that referenced the corrected fact (contract R7 copyRefs): the corrected item's
 * own blurb entirely, and every other sentence that cited the path.
 */
export function pruneCopy(copy: CopyDraft, refs: CopyRefs, correctedPath: string): CopyDraft {
  const item = /^items\.([^.]+)\./.exec(correctedPath)?.[1]
  const keep = (field: string, text: string): string => {
    if (item !== undefined && field === `itemBlurbs.${item}`) return ''
    const sentences = refs[field]
    if (!sentences) return text
    return sentences
      .filter((s) => !s.refs.includes(correctedPath))
      .map((s) => s.sentence)
      .join('')
  }
  return {
    headline: keep('headline', copy.headline),
    subhead: keep('subhead', copy.subhead),
    closing: keep('closing', copy.closing),
    itemBlurbs: Object.fromEntries(
      Object.entries(copy.itemBlurbs).map(([id, text]) => [id, keep(`itemBlurbs.${id}`, text)]),
    ),
  }
}

/** Copy for the corrected page: pruned, then re-checked against the new facts by rules only. */
export function correctedCopy(
  source: RerenderInput['source'],
  factSheet: FactSheet,
  correctedPath: string,
): Pick<VersionContent, 'copy' | 'copyRefs' | 'guard'> {
  const pruned = pruneCopy(source.copy, source.copyRefs, correctedPath)
  const checked = guardWithRulesOnly(pruned, buildFactCorpus(factSheet))
  const guard = {
    copy: checked.copy,
    violations: checked.violations,
    rewritten: checked.rewritten,
    removed: checked.removed,
  }
  return { copy: checked.copy, copyRefs: computeCopyRefs(checked.copy, factSheet), guard }
}

export async function rerenderWithFacts(input: RerenderInput): Promise<StagedVersion> {
  const { projectId, factSheet } = input
  const { copy, copyRefs, guard } = correctedCopy(input.source, factSheet, input.correctedPath)
  const versionId = newId()
  const staging = stagingDir(projectId, input.stagingKey)
  const env = getEnv()
  try {
    const result = await (input.render ?? renderPage)({
      factSheet,
      design: input.source.designSpec,
      copy,
      versionId,
      slug: input.slug,
      trackingBase: '/api/track',
      pageUrl: `${env.PUBLIC_BASE_URL}/p/${input.slug}/`,
    })
    const own = new Set(
      listProjectAssets(projectId)
        .filter((a) => a.kind === 'image')
        .map((a) => a.id),
    )
    await fsp.rm(staging, { recursive: true, force: true })
    await fsp.mkdir(path.join(staging, 'media'), { recursive: true })
    for (const ref of result.media) {
      if (!own.has(ref.assetId)) throw new Error('image is not one of the project assets')
      await fsp.copyFile(
        assetAbsPath(projectId, ref.assetId, ref.size),
        path.join(staging, 'media', ref.file),
      )
    }
    await fsp.writeFile(path.join(staging, 'index.html'), result.html, 'utf8')
    await checkPage(result.html, factSheet, path.join(staging, 'media'), result.media)
  } catch (err) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {})
    console.error(`[corrections] rerender of project ${projectId} failed`, err)
    throw new ApiError(500, 'page_check_failed', PAGE_CHECK_FAILED)
  }
  return {
    versionId,
    staging,
    finalDir: versionDir(projectId, versionId),
    content: {
      factRevision: factSheet.revision,
      designSpec: input.source.designSpec,
      copy,
      copyRefs,
      guard,
    },
  }
}
