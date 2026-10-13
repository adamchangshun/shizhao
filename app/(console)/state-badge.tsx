import type { ProjectState } from '@/lib/core/job-state'
import { STATE_LABEL } from './_lib/labels'
import s from './shell.module.css'

const TONE: Record<ProjectState, string> = {
  generating: s.badgeBusy ?? '',
  previewable: s.badgeReady ?? '',
  live: s.badgeLive ?? '',
}

export function StateBadge({ state }: { state: ProjectState | null }) {
  if (!state) return <span className={`${s.badge} ${s.badgeDraft}`}>待制作</span>
  return <span className={`${s.badge} ${TONE[state]}`}>{STATE_LABEL[state]}</span>
}
