import type { Metadata } from 'next'
import { getEnv } from '@/lib/env'
import { requireSession } from '../../_lib/session'
import { Workspace } from './workspace'

export const metadata: Metadata = { title: '制作宣传页 · 实招 Shizhao' }

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireSession(`/projects/${encodeURIComponent(id)}`)
  return <Workspace projectId={id} publicBase={getEnv().PUBLIC_BASE_URL} />
}
