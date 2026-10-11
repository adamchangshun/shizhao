import { deriveProjectState, type ProjectState } from './core/job-state'
import { findFirstImageAssetId } from './db/repo/assets'
import { findLatestFactSheet } from './db/repo/fact-sheets'
import { listJobStatuses } from './db/repo/jobs'
import { hasAnyVersion } from './db/repo/versions'
import type { ProjectRow } from './db/schema'

export interface ProjectListItem {
  id: string
  slug: string
  type: ProjectRow['type']
  title: string
  state: ProjectState | null
  thumbUrl?: string
  views7d: number
}

export interface FactSummary {
  revision: number
  confirmed: boolean
  shopName: string
  itemCount: number
}

export interface ProjectDetail {
  id: string
  slug: string
  type: ProjectRow['type']
  title: string
  state: ProjectState | null
  createdAt: string
  publishedVersionId: string | null
  unpublishedAt: string | null
  facts: FactSummary | null
}

function stateOf(project: ProjectRow): ProjectState | null {
  return deriveProjectState({
    jobStatuses: listJobStatuses(project.id),
    hasSucceededVersion: hasAnyVersion(project.id),
    publishedVersionId: project.publishedVersionId,
    unpublishedAt: project.unpublishedAt,
  })
}

export function toListItem(project: ProjectRow): ProjectListItem {
  const thumbId = findFirstImageAssetId(project.id)
  return {
    id: project.id,
    slug: project.slug,
    type: project.type,
    title: project.title,
    state: stateOf(project),
    ...(thumbId ? { thumbUrl: `/api/assets/${thumbId}/thumb` } : {}),
    views7d: 0, // filled in by module 10 (stats)
  }
}

export function toDetail(project: ProjectRow): ProjectDetail {
  const sheet = findLatestFactSheet(project.id)
  return {
    id: project.id,
    slug: project.slug,
    type: project.type,
    title: project.title,
    state: stateOf(project),
    createdAt: project.createdAt,
    publishedVersionId: project.publishedVersionId,
    unpublishedAt: project.unpublishedAt,
    facts: sheet
      ? {
          revision: sheet.revision,
          confirmed: sheet.confirmedAt !== null,
          shopName: sheet.json.shop.name,
          itemCount: sheet.json.items.length,
        }
      : null,
  }
}
