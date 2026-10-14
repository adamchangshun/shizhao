// Response shapes of the routes the merchant UI calls (type-only imports; nothing server-side
// reaches the browser bundle).
export type { ProjectDetail, ProjectListItem } from '@/lib/project-view'
export type { JobView, VersionSummary } from '@/lib/jobs'
export type { UploadedAsset } from '@/lib/assets'
export type { PublishLinks } from '@/lib/publish'
export type { FactConflict } from '@/lib/extract'
export type { FactItem, FactSheet, JobStatus, Shop } from '@/lib/core/schemas'

import type { FactConflict } from '@/lib/extract'
import type { FactSheet } from '@/lib/core/schemas'
import type { UploadedAsset } from '@/lib/assets'

export interface AssetEntry extends UploadedAsset {
  text?: string | null
  createdAt: string
}

export interface ExtractResponse {
  factSheet: FactSheet
  conflicts: FactConflict[]
  lowConfidenceFields: string[]
}

export interface FactsResponse {
  factSheet: FactSheet | null
  confirmed: boolean
}

export type { CorrectionView } from '@/lib/corrections/merchant'
import type { CorrectionView } from '@/lib/corrections/merchant'

export interface CorrectionList {
  corrections: CorrectionView[]
  pendingCount: number
}

export type ActionCounts = Record<'view' | 'call' | 'wechat_copy' | 'navigate', number>

/** GET /api/projects/:id/stats?days=7 (module 10). */
export interface StatsResponse {
  totals: ActionCounts
  bySource: { qr: number; link: number }
  daily: Array<{ date: string } & ActionCounts>
}
