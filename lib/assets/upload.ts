import fs from 'node:fs/promises'
import path from 'node:path'
import { Errors } from '../core/errors'
import { newId } from '../core/ids'
import { getDb } from '../db/client'
import { countImages, findImageBySha, listAssetsByProject } from '../db/repo/assets'
import { findActiveProject } from '../db/repo/projects'
import { assets, type AssetRow } from '../db/schema'
import { getEnv } from '../env'
import { UploadErrors } from './errors'
import { MAX_IMAGES_PER_PROJECT, PROCESS_CONCURRENCY } from './limits'
import { parseUpload, type UploadedFile } from './multipart'
import { normalizeImage, type NormalizedImage, type NormalizeOptions } from './normalize'
import { Semaphore } from './semaphore'
import {
  assetAbsPath,
  assetRelPath,
  ensureUploadDir,
  removeFiles,
  sweepStaleUploads,
} from './storage'

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

/** How many times a write plan is rebuilt when a concurrent delete invalidates it. */
const PLAN_ATTEMPTS = 3

class StalePlanError extends Error {}

/**
 * Handles one multipart upload for an existing project. All-or-nothing: if any image fails, no
 * row is written and every file this request created is removed. Temp files are always removed.
 */
export async function uploadAssets(
  projectId: string,
  request: Request,
  opts: NormalizeOptions = {},
): Promise<UploadedAsset[]> {
  const known = new Set(listAssetsByProject(projectId).map((a) => a.id))
  await sweepStaleUploads(projectId, known).catch((err: unknown) => {
    console.error('[assets] stale-upload sweep failed', err)
  })
  const tmpRoot = path.join(getEnv().DATA_DIR, 'tmp')
  await fs.mkdir(tmpRoot, { recursive: true, mode: 0o700 })
  const tmpDir = await fs.mkdtemp(path.join(tmpRoot, 'upload-'))
  try {
    const parsed = await parseUpload(request, tmpDir)
    const text = parsed.text?.trim() || undefined
    if (parsed.files.length === 0 && text === undefined) throw UploadErrors.empty()
    const images = await processAll(parsed.files, opts)
    return await storeImages(projectId, images, text)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch((err: unknown) => {
      console.error('[assets] failed to remove temp dir; left for the stale-upload sweep', err)
    })
  }
}

/** Writes the new renditions and records everything in one transaction, re-planning if stale. */
async function storeImages(
  projectId: string,
  images: readonly NormalizedImage[],
  text: string | undefined,
): Promise<UploadedAsset[]> {
  for (let attempt = 1; ; attempt++) {
    const plan = planWrites(projectId, images)
    const current = countImages(projectId)
    if (current + plan.fresh.length > MAX_IMAGES_PER_PROJECT) {
      throw UploadErrors.tooManyImages(current)
    }
    const written: string[] = []
    try {
      await writeRenditions(projectId, plan.fresh, written)
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
      if (!(err instanceof StalePlanError)) throw err
      if (attempt >= PLAN_ATTEMPTS) throw Errors.conflict('素材正在被其他操作修改，请稍后重试')
    }
  }
}

/** Records a path only once this request has created the file, so cleanup never hits others' files. */
async function writeRenditions(
  projectId: string,
  fresh: readonly FreshImage[],
  written: string[],
): Promise<void> {
  if (fresh.length > 0) await ensureUploadDir(projectId)
  for (const item of fresh) {
    for (const size of ['display', 'thumb'] as const) {
      const abs = assetAbsPath(projectId, item.id, size)
      const handle = await fs.open(abs, 'wx', 0o600)
      written.push(abs)
      try {
        await handle.writeFile(item.image[size])
      } finally {
        await handle.close()
      }
    }
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
      // Re-read the duplicates found outside the transaction: one may have been deleted since.
      const bySha = new Map<string, AssetRow>()
      for (const sha256 of plan.existing.keys()) {
        const row = findImageBySha(projectId, sha256, tx)
        if (!row) throw new StalePlanError()
        bySha.set(sha256, row)
      }
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
