import { deleteAssetRow, findActiveAsset, listAssetsByProject } from '../db/repo/assets'
import type { AssetRow } from '../db/schema'
import type { AssetSize } from './limits'
import { assetAbsPath, removeFiles } from './storage'

export { uploadAssets, toUploadedAsset, thumbUrl, type UploadedAsset } from './upload'
export { assetAbsPath } from './storage'
export { isAssetSize, type AssetSize } from './limits'

/** All assets of a project (images and text notes), oldest first. Used by module 04. */
export function listProjectAssets(projectId: string): AssetRow[] {
  return listAssetsByProject(projectId)
}

/** Absolute path of an image rendition, or undefined if the asset is missing, text, or its project is deleted. */
export function findAssetFile(assetId: string, size: AssetSize): string | undefined {
  const asset = findActiveAsset(assetId)
  if (!asset || asset.kind !== 'image') return undefined
  return assetAbsPath(asset.projectId, asset.id, size)
}

/** Deletes the row first, then its files; false if no such asset (or its project is deleted). */
export async function deleteAsset(assetId: string): Promise<boolean> {
  const asset = findActiveAsset(assetId)
  if (!asset || !deleteAssetRow(asset.id)) return false
  if (asset.kind === 'image') {
    await removeFiles([
      assetAbsPath(asset.projectId, asset.id, 'display'),
      assetAbsPath(asset.projectId, asset.id, 'thumb'),
    ])
  }
  return true
}
