import type { Metadata } from 'next'
import { requireSession } from './_lib/session'
import { ProjectList } from './project-list'

export const metadata: Metadata = { title: '我的宣传页 · 实招 Shizhao' }

export default async function HomePage() {
  await requireSession('/')
  return <ProjectList />
}
