import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { listProjectAssets } from '../assets'
import { ApiError, Errors } from '../core/errors'
import { newId } from '../core/ids'
import { FactItem, FactSheet } from '../core/schemas'
import {
  appendFactSheet,
  confirmLatestFactSheet,
  findLatestConfirmedFactSheet,
  findLatestFactSheet,
} from '../db/repo/fact-sheets'
import { findActiveProject } from '../db/repo/projects'

/**
 * PUT body: a complete FactSheet without the server-owned projectId, revision and confirmedAt,
 * plus `baseRevision`: the revision the merchant edited (0 when there was none yet).
 */
export const FactSheetEdit = FactSheet.omit({
  projectId: true,
  revision: true,
  confirmedAt: true,
}).extend({ baseRevision: z.number().int().nonnegative() })
export type FactSheetEdit = z.infer<typeof FactSheetEdit>

const SOURCED_FIELDS = ['name', 'price', 'spec', 'description'] as const
const CLIENT_ITEM_ID = /^[A-Za-z0-9_-]{1,32}$/

export function factsNotConfirmed(): ApiError {
  return new ApiError(409, 'facts_not_confirmed', '商品信息还没有确认，请先确认后再生成')
}

function requireProject(projectId: string): void {
  if (!findActiveProject(projectId)) throw Errors.notFound('项目')
}

/** The newest revision, confirmed or not (for the merchant UI); null before any extraction. */
export function getLatestFactSheet(projectId: string): FactSheet | null {
  return findLatestFactSheet(projectId)?.json ?? null
}

/**
 * The newest revision that the merchant has confirmed. Throws `facts_not_confirmed` when there is
 * none, so unconfirmed facts can never reach generation (module 08).
 */
export function getConfirmedFactSheet(projectId: string): FactSheet {
  const row = findLatestConfirmedFactSheet(projectId)
  if (!row) throw factsNotConfirmed()
  return row.json
}

/** POST /facts/confirm body: the revision the merchant reviewed. */
export const ConfirmRequest = z.object({ revision: z.number().int().positive() })

/**
 * Confirms the revision the merchant reviewed, which must still be the latest (409
 * `facts_changed` otherwise). Confirming an already confirmed revision is a no-op.
 */
export function confirmFacts(projectId: string, input: unknown): FactSheet {
  requireProject(projectId)
  const { revision } = ConfirmRequest.parse(input)
  const outcome = confirmLatestFactSheet(projectId, revision)
  if (outcome.status === 'missing') {
    throw new ApiError(409, 'no_facts', '还没有商品信息，请先识别素材')
  }
  if (outcome.status === 'stale') {
    throw new ApiError(409, 'facts_changed', '商品信息已有更新，请查看最新内容后再确认')
  }
  return outcome.row.json
}

/**
 * Stores the merchant's edited sheet as a new revision, only if `baseRevision` is still the
 * latest (409 `facts_changed` otherwise). Sources are recomputed by comparing each
 * field with the revision it replaces: changed or new fields become `merchant_edit`, unchanged
 * fields keep their previous source. Sources sent by the client are ignored.
 */
export function saveMerchantEdit(projectId: string, input: unknown): FactSheet {
  requireProject(projectId)
  const edit = FactSheetEdit.parse(input)
  const ids = edit.items.map((i) => i.id)
  if (new Set(ids).size !== ids.length) throw invalid('商品编号重复')
  const projectImages = new Set(
    listProjectAssets(projectId)
      .filter((a) => a.kind === 'image')
      .map((a) => a.id),
  )
  for (const item of edit.items) {
    if (item.imageAssetIds.some((id) => !projectImages.has(id))) throw invalid('图片编号无效')
  }

  const row = appendFactSheet(projectId, (previous, revision) => {
    // Inside the transaction: a save based on an older revision would silently discard the
    // newer one and recompute sources against the wrong revision.
    if ((previous?.revision ?? 0) !== edit.baseRevision) {
      throw new ApiError(409, 'facts_changed', '商品信息已有更新，请查看最新内容后再修改')
    }
    const prevItems = new Map((previous?.json.items ?? []).map((i) => [i.id, i]))
    const items = edit.items.map((item) => withEditSources(item, prevItems.get(item.id)))
    return FactSheet.parse({
      projectId,
      revision,
      shop: edit.shop,
      items,
      extraClaims: edit.extraClaims,
      confirmedAt: null,
    })
  })
  return row.json
}

function withEditSources(item: FactItem, previous: FactItem | undefined): FactItem {
  const id = previous ? item.id : CLIENT_ITEM_ID.test(item.id) ? item.id : newId()
  const sources: FactItem['sources'] = {}
  for (const field of SOURCED_FIELDS) {
    if (item[field] === undefined) continue
    const before = previous?.sources[field]
    sources[field] =
      previous && before && isDeepStrictEqual(previous[field], item[field])
        ? before
        : 'merchant_edit'
  }
  return { ...item, id, sources }
}

function invalid(message: string): ApiError {
  return new ApiError(400, 'invalid_input', message)
}
