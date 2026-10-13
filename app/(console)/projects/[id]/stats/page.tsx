import type { Metadata } from 'next'
import { requireSession } from '../../../_lib/session'
import { StatsView } from './stats-view'

export const metadata: Metadata = { title: '访问统计 · 实招 Shizhao' }

export default async function StatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireSession(`/projects/${encodeURIComponent(id)}/stats`)
  return <StatsView projectId={id} />
}
