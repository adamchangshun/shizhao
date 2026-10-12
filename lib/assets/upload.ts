import fs from 'node:fs/promises'
import path from 'node:path'
import { Errors } from '../core/errors'
import { newId } from '../core/ids'
import { getDb } from '../db/client'
import { countImages, findImageBySha } from '../db/repo/assets'
import { findActiveProject } from '../db/repo/projects'
import { assets, type AssetRow } from '../db/schema'
import { getEnv } from '../env'
import { UploadErrors } from './errors'
import { MAX_IMAGES_PER_PROJECT, PROCESS_CONCURRENCY } from './limits'
import { parseUpload, type UploadedFile } from './multipart'
import { normalizeImage, type NormalizedImage, type NormalizeOptions } from './normalize'
import { Semaphore } from './semaphore'
import { assetAbsPath, assetRelPath, ensureUploadDir, removeFiles } from './storage'

export interface UploadedAsset {
  id: string
  kind: 'image' | 'text'
  width?: number
  height?: number
  thumbUrl?: string
}

/** Process-wide: at most two images are decoded at once, across all requests (demo-machine RAM). */
export const processingSlots = new Semaphore(PROCESS_CONCURRENCY)

export function thumbUrl(assetId: string): string {
  return `/api/assets/${assetId}/thumb`
}

export function toUploadedAsset(row: AssetRow): UploadedAsset {
  if (row.kind === 'text') return { id: row.id, kind: 'text' }
  return {
    id: row.id,
    kind: 'image',
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    thumbUrl: thumbUrl(row.id),
  }
}

/**
 * Handles one multipart upload for an existing project. All-or-nothing: if any image fails, no
 * row is written and every file this request created is removed. Temp files are always removed.
 */
export async function uploadAssets(
  projectId: string,
  request: Request,
  opts: NormalizeOptions = {},
): Promise<UploadedAsset[]> {
  const tmpRoot = path.join(getEnv().DATA_DIR, 'tmp')
  await fs.mkdir(tmpRoot, { recursive: true, mode: 0o700 })
  const tmpDir = await fs.mkdtemp(path.join(tmpRoot, 'upload-'))
  const written: string[] = []
  try {
    const parsed = await parseUpload(request, tmpDir)
    const text = parsed.text?.trim() || undefined
    if (parsed.files.length === 0 && text === undefined) throw UploadErrors.empty()

    const images = await processAll(parsed.files, opts)
    const plan = planWrites(projectId, images)
    if (countImages(projectId) + plan.fresh.length > MAX_IMAGES_PER_PROJECT) {
      throw UploadErrors.tooManyImages(countImages(projectId))
    }

    if (plan.fresh.length > 0) await ensureUploadDir(projectId)
    for (const item of plan.fresh) {
      for (const size of ['display', 'thumb'] as const) {
        const abs = assetAbsPath(projectId, item.id, size)
        written.push(abs)
        await fs.writeFile(abs, item.image[size], { flag: 'wx', mode: 0o600 })
      }
    }

    const { rows, raced } = commit(projectId, plan, text)
    // Another request stored the same image first: keep its copy, drop ours.
    await removeFiles(
      raced.flatMap((id) => [
        assetAbsPath(projectId, id, 'display'),
        assetAbsPath(projectId, id, 'thumb'),
      ]),
    )
    return rows
  } catch (err) {
    await removeFiles(written)
    throw err
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

/** Runs every image through the shared slots; after the first failure, queued images are skipped. */
async function processAll(
  files: readonly UploadedFile[],
  opts: NormalizeOptions,
): Promise<NormalizedImage[]> {
  let failed = false
  const skipped = Symbol('skipped')
  const results = await Promise.allSettled(
    files.map((file) =>
      processingSlots.run(async () => {
        if (failed) throw skipped
        try {
          return await normalizeImage(file, opts)
        } catch (err) {
          failed = true
          throw err
        }
      }),
    ),
  )
  // Report the first failing file in upload order.
  for (const r of results) {
    if (r.status === 'rejected' && r.reason !== skipped) throw r.reason
  }
  return results.map((r) => (r as PromiseFulfilledResult<NormalizedImage>).value)
}

interface FreshImage {
  id: string
  image: NormalizedImage
}

interface WritePlan {
  /** One entry per uploaded file, in order: the asset id it resolves to. */
  order: Array<{ sha256: string }>
  /** Images not yet stored for this project (deduped within the batch). */
  fresh: FreshImage[]
  /** Images already stored before this request. */
  existing: Map<string, AssetRow>
}

function planWrites(projectId: string, images: readonly NormalizedImage[]): WritePlan {
  const fresh = new Map<string, FreshImage>()
  const existing = new Map<string, AssetRow>()
  for (const image of images) {
    if (fresh.has(image.sha256) || existing.has(image.sha256)) continue
    const row = findImageBySha(projectId, image.sha256)
    if (row) existing.set(image.sha256, row)
    else fresh.set(image.sha256, { id: newId(), image })
  }
  return { order: images.map((i) => ({ sha256: i.sha256 })), fresh: [...fresh.values()], existing }
}

function commit(
  projectId: string,
  plan: WritePlan,
  text: string | undefined,
): { rows: UploadedAsset[]; raced: string[] } {
  return getDb().transaction(
    (tx) => {
      if (!findActiveProject(projectId)) throw Errors.notFound('项目')
      const now = new Date().toISOString()
      const bySha = new Map(plan.existing)
      const raced: string[] = []
      const toInsert: FreshImage[] = []
      for (const item of plan.fresh) {
        const row = findImageBySha(projectId, item.image.sha256, tx)
        if (row) {
          bySha.set(item.image.sha256, row)
          raced.push(item.id)
        } else {
          toInsert.push(item)
        }
      }
      const current = countImages(projectId, tx)
      if (current + toInsert.length > MAX_IMAGES_PER_PROJECT) {
        throw UploadErrors.tooManyImages(current)
      }
      for (const { id, image } of toInsert) {
        const row: AssetRow = {
          id,
          projectId,
          kind: 'image',
          path: assetRelPath(projectId, id, 'display'),
          width: image.width,
          height: image.height,
          sha256: image.sha256,
          bytes: image.display.length,
          text: null,
          createdAt: now,
        }
        tx.insert(assets).values(row).run()
        bySha.set(image.sha256, row)
      }
      const rows = plan.order.map(({ sha256 }) => toUploadedAsset(bySha.get(sha256)!))
      if (text !== undefined) {
        const id = newId()
        tx.insert(assets).values({ id, projectId, kind: 'text', text, createdAt: now }).run()
        rows.push({ id, kind: 'text' })
      }
      return { rows, raced }
    },
    { behavior: 'immediate' },
  )
}
