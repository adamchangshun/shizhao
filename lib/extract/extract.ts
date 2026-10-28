import { listProjectAssets } from '../assets'
import { assetAbsPath } from '../assets/storage'
import { ApiError, Errors } from '../core/errors'
import { FactSheet } from '../core/schemas'
import { getDb } from '../db/client'
import { appendFactSheet } from '../db/repo/fact-sheets'
import { findActiveProject } from '../db/repo/projects'
import { getProvider, ProviderError, recordUsage, type LLMProvider } from '../providers'
import { groundDraft, type FactConflict } from './ground'
import { buildExtractPrompt, EXTRACT_SYSTEM } from './prompt'
import { ModelDraft } from './schema'

export interface ExtractResult {
  factSheet: FactSheet
  conflicts: FactConflict[]
  /**
   * Paths the merchant should check, e.g. 'items[0].price': facts read only from images, and
   * prices left empty while the text has an amount no item took.
   */
  lowConfidenceFields: string[]
}

export interface ExtractOptions {
  provider?: LLMProvider
  signal?: AbortSignal
}

/** Turns a provider failure into a safe client error; its message is already local and Chinese. */
export function providerFailure(err: ProviderError): ApiError {
  const status = err.code === 'rate_limited' ? 503 : err.code === 'timeout' ? 504 : 502
  return new ApiError(status, `provider_${err.code}`, err.message)
}

/**
 * Reads the project's images (display renditions) and text notes, asks the vision model for a
 * draft, grounds every value against the material (see groundDraft) and stores it as a new,
 * unconfirmed revision. Earlier revisions are never overwritten.
 */
export async function extractFacts(
  projectId: string,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  const project = findActiveProject(projectId)
  if (!project) throw Errors.notFound('项目')
  const assets = listProjectAssets(projectId)
  const images = assets.filter((a) => a.kind === 'image')
  const merchantText = assets
    .filter((a) => a.kind === 'text')
    .map((a) => a.text ?? '')
    .join('\n\n')
  if (images.length === 0 && merchantText.trim() === '') {
    throw new ApiError(400, 'no_assets', '请先上传商品图片或填写文字说明')
  }

  const provider = opts.provider ?? getProvider()
  let data: ModelDraft
  try {
    const result = await provider.generateJSON({
      stage: 'extract',
      system: EXTRACT_SYSTEM,
      prompt: buildExtractPrompt(
        merchantText,
        images.map((img, i) => ({ id: img.id, index: i + 1 })),
      ),
      images: images.map((img) => ({
        path: assetAbsPath(projectId, img.id, 'display'),
        mime: 'image/webp' as const,
      })),
      schema: ModelDraft,
      temperature: 0,
      signal: opts.signal,
    })
    recordUsage(getDb(), result.usage, { projectId, jobId: null })
    data = result.data
  } catch (err) {
    if (err instanceof ProviderError) throw providerFailure(err)
    throw err
  }

  const grounded = groundDraft(data, {
    merchantText,
    imageIds: images.map((img) => img.id),
    fallbackShopName: project.title,
  })
  const row = appendFactSheet(projectId, (_previous, revision) =>
    FactSheet.parse({
      projectId,
      revision,
      shop: grounded.shop,
      items: grounded.items,
      extraClaims: grounded.extraClaims,
      confirmedAt: null,
    }),
  )
  return {
    factSheet: row.json,
    conflicts: grounded.conflicts,
    lowConfidenceFields: grounded.lowConfidenceFields,
  }
}
